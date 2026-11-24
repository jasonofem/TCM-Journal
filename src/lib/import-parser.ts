import * as cheerio from 'cheerio';
import * as XLSX from 'xlsx';
import { buildTradeFingerprint } from './dedupe';
import {
  detectSessionFromTime,
  normalizePair,
  normalizeSession,
  normalizeSetup,
} from './trading-math';
import { ParsedTradeCandidate, PositionSide, TradingSession } from './types';

export interface ParseReportOutput {
  detectedFormat: string;
  accountMeta: {
    accountNumber: string | null;
    accountName: string | null;
    currency: string | null;
    reportedBalance: number | null;
  };
  trades: ParsedTradeCandidate[];
  ignoredRows: number;
  warnings: string[];
}

export function decodeFileBuffer(buffer: Buffer): string {
  if (buffer.length >= 2) {
    // UTF-16LE BOM (standard MetaTrader 5 HTML export!)
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.slice(2).toString('utf16le');
    }
    // UTF-16BE BOM
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.allocUnsafe(buffer.length - 2);
      for (let i = 2; i + 1 < buffer.length; i += 2) {
        swapped[i - 2] = buffer[i + 1];
        swapped[i - 1] = buffer[i];
      }
      return swapped.toString('utf16le');
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf8');
  }
  // Heuristic UTF-16LE without BOM: lots of 0x00 in odd positions
  let zeroCount = 0;
  const sampleLen = Math.min(buffer.length, 200);
  for (let i = 1; i < sampleLen; i += 2) {
    if (buffer[i] === 0) zeroCount++;
  }
  if (sampleLen > 20 && zeroCount > sampleLen * 0.35) {
    return buffer.toString('utf16le');
  }
  return buffer.toString('utf8');
}

function cleanNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val)
    .replace(/\u00a0/g, ' ')
    .replace(/[$,€£₦¥]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!str || str === '-' || str === '—' || str.toLowerCase() === 'null') return null;
  // Handle accounting negatives like (54.45)
  const negMatch = /^\((.+)\)$/.exec(str);
  const numStr = negMatch ? `-${negMatch[1]}` : str;
  // Handle European comma decimal if single comma and no dot (e.g. "1,2345" or "-54,45")
  const normalized =
    numStr.includes(',') && !numStr.includes('.')
      ? numStr.replace(',', '.')
      : numStr.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizeDateTime(raw: unknown): {
  date: string;
  time: string;
  datetime: string;
} | null {
  if (raw === null || raw === undefined) return null;

  // Excel serial number (e.g., 46238.6667)
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 100000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const date = `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
      const time = `${pad2(parsed.H || 0)}:${pad2(parsed.M || 0)}:${pad2(Math.floor(parsed.S || 0))}`;
      return { date, time, datetime: `${date} ${time}` };
    }
  }

  const s = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!s) return null;

  // Numeric string Excel serial
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const num = Number(s);
    const parsed = XLSX.SSF.parse_date_code(num);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const date = `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
      const time = `${pad2(parsed.H || 0)}:${pad2(parsed.M || 0)}:${pad2(Math.floor(parsed.S || 0))}`;
      return { date, time, datetime: `${date} ${time}` };
    }
  }

  // YYYY.MM.DD HH:MM(:SS) or YYYY-MM-DD[T ]HH:MM(:SS)
  const isoLike =
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (isoLike) {
    const date = `${isoLike[1]}-${pad2(Number(isoLike[2]))}-${pad2(Number(isoLike[3]))}`;
    const time = isoLike[4]
      ? `${pad2(Number(isoLike[4]))}:${pad2(Number(isoLike[5]))}:${pad2(Number(isoLike[6] || 0))}`
      : '00:00:00';
    return { date, time, datetime: `${date} ${time}` };
  }

  // DD/MM/YYYY or DD.MM.YYYY HH:MM(:SS)
  const dmy =
    /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    // If second > 12 it's MM/DD/YYYY, otherwise default DD/MM/YYYY (standard in UK/NG/brokers)
    const month = second > 12 ? first : second;
    const day = second > 12 ? second : first;
    const date = `${dmy[3]}-${pad2(month)}-${pad2(day)}`;
    const time = dmy[4]
      ? `${pad2(Number(dmy[4]))}:${pad2(Number(dmy[5]))}:${pad2(Number(dmy[6] || 0))}`
      : '00:00:00';
    return { date, time, datetime: `${date} ${time}` };
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const date = parsed.toISOString().slice(0, 10);
    const time = parsed.toISOString().slice(11, 19);
    return { date, time, datetime: `${date} ${time}` };
  }

  return null;
}

function normalizeTimeOnly(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && raw >= 0 && raw < 1) {
    const totalSec = Math.round(raw * 86400);
    const hh = Math.floor(totalSec / 3600) % 24;
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  const s = String(raw).trim();
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  return `${pad2(Number(m[1]))}:${pad2(Number(m[2]))}:${pad2(Number(m[3] || 0))}`;
}

function normalizeSide(raw: unknown): PositionSide | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'buy' || s === 'long' || s === 'b' || s.startsWith('buy ')) return 'Buy';
  if (s === 'sell' || s === 'short' || s === 's' || s.startsWith('sell ')) return 'Sell';
  return null;
}

function isIgnorableType(raw: unknown): boolean {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return false;
  return [
    'balance',
    'credit',
    'deposit',
    'withdrawal',
    'bonus',
    'correction',
    'buy limit',
    'sell limit',
    'buy stop',
    'sell stop',
    'buy stop limit',
    'sell stop limit',
    'cancelled',
    'canceled',
  ].some((k) => s === k || s.includes('limit') || s.includes('stop') || s.includes('balance'));
}

function finalizeCandidate(
  fields: {
    idx: number;
    brokerTicket?: string | null;
    rawSymbol: string;
    position: PositionSide;
    lots: number;
    entryDate: string;
    entryTime: string;
    exitDate?: string | null;
    exitTime?: string | null;
    entryPrice: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
    exitPrice?: number | null;
    commission?: number;
    swap?: number;
    brokerPnl?: number | null;
    riskAmount?: number | null;
    setup?: string | null;
    session?: TradingSession | null;
    notes?: string | null;
    mistakes?: string | null;
    beforeScreenshot?: string | null;
    afterScreenshot?: string | null;
    comment?: string | null;
    exitReason?: string | null;
    isOpen?: boolean;
  },
  timezoneOffsetHours: number
): ParsedTradeCandidate {
  const pair = normalizePair(fields.rawSymbol);
  const entryDatetime = `${fields.entryDate} ${fields.entryTime}`;
  const isOpen =
    fields.isOpen ?? (fields.exitPrice === null || fields.exitPrice === undefined || !fields.exitDate);
  const exitDate = isOpen ? null : fields.exitDate || null;
  const exitTime = isOpen ? null : fields.exitTime || fields.entryTime;
  const exitDatetime = exitDate && exitTime ? `${exitDate} ${exitTime}` : null;

  const session =
    fields.session || detectSessionFromTime(fields.entryTime, timezoneOffsetHours);

  const normalizedSetup = fields.setup ? normalizeSetup(fields.setup).setup : null;

  const fingerprint = buildTradeFingerprint({
    pair,
    position: fields.position,
    entryDatetime,
    entryPrice: fields.entryPrice,
    lots: fields.lots,
  });

  // Auto infer exit reason when SL/TP exact match if not set
  let exitReason = fields.exitReason || null;
  if (!exitReason && !isOpen && fields.exitPrice !== null && fields.exitPrice !== undefined) {
    const sl = fields.stopLoss;
    const tp = fields.takeProfit;
    if (tp && Math.abs(fields.exitPrice - tp) <= 0.00025) {
      exitReason = 'Take profit hit';
    } else if (sl && Math.abs(fields.exitPrice - sl) <= 0.00025) {
      exitReason = 'Stop loss hit';
    }
  }

  return {
    tempId: `imp-${fields.idx}-${fingerprint}`,
    brokerTicket: fields.brokerTicket ? String(fields.brokerTicket).trim() : null,
    pair,
    rawSymbol: fields.rawSymbol,
    position: fields.position,
    lots: Number(fields.lots.toFixed(2)),
    entryDate: fields.entryDate,
    entryTime: fields.entryTime,
    entryDatetime,
    exitDate,
    exitTime,
    exitDatetime,
    entryPrice: fields.entryPrice,
    stopLoss: fields.stopLoss && fields.stopLoss > 0 ? fields.stopLoss : null,
    takeProfit: fields.takeProfit && fields.takeProfit > 0 ? fields.takeProfit : null,
    exitPrice: !isOpen && fields.exitPrice && fields.exitPrice > 0 ? fields.exitPrice : null,
    commission: fields.commission || 0,
    swap: fields.swap || 0,
    brokerPnl: isOpen ? null : fields.brokerPnl ?? null,
    riskAmount: fields.riskAmount ?? null,
    setup: normalizedSetup,
    session,
    notes: fields.notes || fields.comment || null,
    mistakes: fields.mistakes || null,
    beforeScreenshot: fields.beforeScreenshot || null,
    afterScreenshot: fields.afterScreenshot || null,
    comment: fields.comment || null,
    exitReason,
    isOpen,
    fingerprint,
  };
}

// ---------- HTML PARSER (MT4 & MT5 & generic HTML tables) ----------

function extractHeaderMeta(text: string): ParseReportOutput['accountMeta'] {
  const accMatch = /Account(?:\s*Number)?[:\s]+([0-9]{4,15})/i.exec(text);
  const nameMatch = /Name[:\s]+([^\n\r(<|]{2,60})/i.exec(text);
  const currMatch = /Currency[:\s]+([A-Z]{3})/i.exec(text) || /\(([A-Z]{3}),/i.exec(text);
  const balMatch = /Balance[:\s]+([0-9,\s]+\.\d{2})/i.exec(text);
  return {
    accountNumber: accMatch ? accMatch[1].trim() : null,
    accountName: nameMatch ? nameMatch[1].trim() : null,
    currency: currMatch ? currMatch[1].trim() : null,
    reportedBalance: balMatch ? cleanNum(balMatch[1]) : null,
  };
}

interface ColMap {
  ticket?: number;
  openTime?: number;
  closeTime?: number;
  type?: number;
  direction?: number; // MT5 deals 'in'/'out'
  symbol?: number;
  lots?: number;
  entryPrice?: number;
  exitPrice?: number;
  sl?: number;
  tp?: number;
  commission?: number;
  fee?: number;
  swap?: number;
  taxes?: number;
  profit?: number;
  risk?: number;
  setup?: number;
  session?: number;
  notes?: number;
  mistakes?: number;
  comment?: number;
  beforeShot?: number;
  afterShot?: number;
}

function mapHeaders(headers: string[]): ColMap {
  const map: ColMap = {};
  const norm = headers.map((h) => h.replace(/\u00a0/g, ' ').trim().toLowerCase());

  norm.forEach((h, i) => {
    if (!h) return;
    if (h === 'ticket' || h === 'position' && map.ticket === undefined && norm.includes('symbol')) {
      // Careful: in TCM journal, 'Position' means Buy/Sell! In MT5, 'Position' is the numeric Ticket ID when 'Type' is also present!
      if (h === 'ticket' || (h === 'position' && (norm.includes('type') || norm.includes('volume')))) {
        map.ticket = i;
        return;
      }
    }
    if (h === 'deal' || h === 'order' || h === 'position id' || h === 'trade id' || h === 'id') {
      if (map.ticket === undefined) map.ticket = i;
      return;
    }
    if (
      h === 'open time' ||
      h === 'entry time & date' ||
      h === 'entry datetime' ||
      h === 'entry time'
    ) {
      map.openTime = i;
      return;
    }
    if (
      h === 'close time' ||
      h === 'exit time & date' ||
      h === 'exit datetime' ||
      h === 'exit time'
    ) {
      map.closeTime = i;
      return;
    }
    if (h === 'time' || h === 'date & time' || h === 'datetime') {
      // If both separate 'date' and 'time' columns exist (e.g. C5_TradeLog), 'time' belongs to entry date, NOT closeTime!
      if (h === 'time' && norm.includes('date')) {
        return;
      }
      if (map.openTime === undefined) map.openTime = i;
      else if (map.closeTime === undefined) map.closeTime = i;
      return;
    }
    if (h === 'date' && map.openTime === undefined) {
      map.openTime = i;
      return;
    }
    if (h === 'symbol' || h === 'item' || h === 'pair' || h === 'currency pair' || h === 'instrument') {
      map.symbol = i;
      return;
    }
    if (h === 'type' || h === 'side' || h === 'action' || (h === 'position' && !norm.includes('volume'))) {
      if (map.type === undefined) map.type = i;
      return;
    }
    if (h === 'direction') {
      // Could be MT5 Deals ('in'/'out') OR TCM C5_TradeLog ('Long'/'Short')!
      if (norm.includes('deal') || norm.includes('volume')) map.direction = i;
      else map.type = i;
      return;
    }
    if (h === 'volume' || h === 'size' || h === 'lot' || h === 'lots' || h === 'lot size' || h === 'qty' || h === 'quantity') {
      map.lots = i;
      return;
    }
    if (h === 'open price' || h === 'entry price' || h === 'entry') {
      map.entryPrice = i;
      return;
    }
    if (h === 'close price' || h === 'exit price' || h === 'exit') {
      map.exitPrice = i;
      return;
    }
    if (h === 'price') {
      if (map.entryPrice === undefined) map.entryPrice = i;
      else if (map.exitPrice === undefined) map.exitPrice = i;
      return;
    }
    if (h === 's / l' || h === 'sl' || h === 's/l' || h === 'stop loss' || h === 'stoploss') {
      map.sl = i;
      return;
    }
    if (h === 't / p' || h === 'tp' || h === 't/p' || h === 'take profit' || h === 'takeprofit') {
      map.tp = i;
      return;
    }
    if (h === 'commission' || h === 'commissions' || h === 'comm') {
      map.commission = i;
      return;
    }
    if (h === 'fee') {
      map.fee = i;
      return;
    }
    if (h === 'swap' || h === 'swaps' || h === 'rollover') {
      map.swap = i;
      return;
    }
    if (h === 'taxes' || h === 'tax') {
      map.taxes = i;
      return;
    }
    if (
      h === 'profit' ||
      h === 'net profit' ||
      h === 'p&l' ||
      h === 'pnl' ||
      h === 'p&l $' ||
      h === 'profit/loss' ||
      h === 'net p&l' ||
      h === 'net pnl'
    ) {
      map.profit = i;
      return;
    }
    if (h === 'risk per trade' || h === 'risk $' || h === 'risk amount' || h === 'risk') {
      map.risk = i;
      return;
    }
    if (h === 'setup' || h === 'strategy' || h === 'strategy used' || h === 'trading setup') {
      map.setup = i;
      return;
    }
    if (h === 'session' || h === 'trading session') {
      map.session = i;
      return;
    }
    if (h === 'notes' || h === 'note' || h === 'notes / psychology') {
      map.notes = i;
      return;
    }
    if (h === 'mistakes' || h === 'mistake') {
      map.mistakes = i;
      return;
    }
    if (h === 'comment') {
      map.comment = i;
      return;
    }
    if (h === 'before screenshot') map.beforeShot = i;
    if (h === 'after screenshot') map.afterShot = i;
  });

  return map;
}

function parseRowWithMap(
  cells: string[],
  map: ColMap,
  sectionMode: 'closed' | 'open' | 'auto',
  idx: number,
  timezoneOffsetHours: number
): { candidate?: ParsedTradeCandidate; ignored?: boolean } {
  const rawType = map.type !== undefined ? cells[map.type] : '';
  if (isIgnorableType(rawType)) {
    return { ignored: true };
  }
  const position = normalizeSide(rawType);
  if (!position) return { ignored: false };

  const rawSymbol = map.symbol !== undefined ? cells[map.symbol]?.trim() : '';
  if (!rawSymbol) return { ignored: false };

  const lots = map.lots !== undefined ? cleanNum(cells[map.lots]) : null;
  const entryPrice = map.entryPrice !== undefined ? cleanNum(cells[map.entryPrice]) : null;
  const entryDt = map.openTime !== undefined ? normalizeDateTime(cells[map.openTime]) : null;

  if (!lots || lots <= 0 || !entryPrice || entryPrice <= 0 || !entryDt) {
    return { ignored: false };
  }

  const sl = map.sl !== undefined ? cleanNum(cells[map.sl]) : null;
  const tp = map.tp !== undefined ? cleanNum(cells[map.tp]) : null;
  const exitPriceRaw = map.exitPrice !== undefined ? cleanNum(cells[map.exitPrice]) : null;
  const rawCloseCell = map.closeTime !== undefined ? (cells[map.closeTime] || '').trim() : '';
  const exitDt =
    sectionMode === 'open' || map.closeTime === undefined
      ? null
      : normalizeDateTime(rawCloseCell);

  // If the report has no Close Time column at all (e.g. C5_TradeLog or simple CSVs),
  // a valid Exit Price > 0 means the trade IS closed on entryDt.date!
  const hasCloseCol = map.closeTime !== undefined;
  const isOpen =
    sectionMode === 'open' ||
    exitPriceRaw === null ||
    exitPriceRaw <= 0 ||
    (hasCloseCol && !exitDt);
  const resolvedExitDt = isOpen ? null : exitDt || entryDt;

  const commission =
    (map.commission !== undefined ? cleanNum(cells[map.commission]) || 0 : 0) +
    (map.fee !== undefined ? cleanNum(cells[map.fee]) || 0 : 0) +
    (map.taxes !== undefined ? cleanNum(cells[map.taxes]) || 0 : 0);
  const swap = map.swap !== undefined ? cleanNum(cells[map.swap]) || 0 : 0;
  const brokerPnl = !isOpen && map.profit !== undefined ? cleanNum(cells[map.profit]) : null;
  const riskAmount = map.risk !== undefined ? cleanNum(cells[map.risk]) : null;

  const setup = map.setup !== undefined ? cells[map.setup]?.trim() || null : null;
  const session =
    map.session !== undefined && cells[map.session]?.trim()
      ? normalizeSession(cells[map.session], entryDt.time, timezoneOffsetHours)
      : null;

  const ticket = map.ticket !== undefined ? cells[map.ticket]?.trim() || null : null;
  const comment = map.comment !== undefined ? cells[map.comment]?.trim() || null : null;
  const notes = map.notes !== undefined ? cells[map.notes]?.trim() || null : null;
  const mistakes = map.mistakes !== undefined ? cells[map.mistakes]?.trim() || null : null;
  const beforeScreenshot = map.beforeShot !== undefined ? cells[map.beforeShot]?.trim() || null : null;
  const afterScreenshot = map.afterShot !== undefined ? cells[map.afterShot]?.trim() || null : null;

  return {
    candidate: finalizeCandidate(
      {
        idx,
        brokerTicket: ticket,
        rawSymbol,
        position,
        lots,
        entryDate: entryDt.date,
        entryTime: entryDt.time,
        exitDate: resolvedExitDt?.date || null,
        exitTime: resolvedExitDt?.time || null,
        entryPrice,
        stopLoss: sl,
        takeProfit: tp,
        exitPrice: exitPriceRaw,
        commission,
        swap,
        brokerPnl,
        riskAmount,
        setup,
        session,
        notes,
        mistakes,
        beforeScreenshot,
        afterScreenshot,
        comment,
        isOpen,
      },
      timezoneOffsetHours
    ),
  };
}

export function parseHtmlReport(
  html: string,
  timezoneOffsetHours = 1
): ParseReportOutput {
  const $ = cheerio.load(html);
  const fullText = $.root().text();
  const accountMeta = extractHeaderMeta(fullText);

  const isMt5 =
    /MetaTrader 5|Trade History Report/i.test(fullText) ||
    $('th, td, b').toArray().some((el) => $(el).text().trim() === 'Positions');
  const isMt4 =
    /Closed Transactions|Open Trades|Statement:/i.test(fullText) ||
    $('td, b').toArray().some((el) => /Closed Transactions/i.test($(el).text()));

  const detectedFormat = isMt5
    ? 'MT5 HTML Report'
    : isMt4
      ? 'MT4 HTML Statement'
      : 'HTML Table Report';

  const trades: ParsedTradeCandidate[] = [];
  let ignoredRows = 0;
  const warnings: string[] = [];

  let currentSection: 'none' | 'positions' | 'open_positions' | 'deals' | 'orders' | 'closed_tx' | 'open_tx' =
    isMt5 || isMt4 ? 'none' : 'positions';
  let activeMap: ColMap | null = null;
  const dealRows: { cells: string[]; map: ColMap }[] = [];

  $('tr').each((rowIdx, tr) => {
    const $tr = $(tr);
    // Filter out hidden cells that MT5 puts in spacer/comment rows
    const visibleCells = $tr
      .children('th, td')
      .toArray()
      .filter((cell) => {
        const cls = ($(cell).attr('class') || '').toLowerCase();
        const style = ($(cell).attr('style') || '').toLowerCase();
        return !cls.includes('hidden') && !style.includes('display:none') && !style.includes('display: none');
      })
      .map((cell) => $(cell).text().replace(/\u00a0/g, ' ').trim());

    if (visibleCells.length === 0) return;

    const rowJoined = visibleCells.join(' ').trim();
    const rowLower = rowJoined.toLowerCase();

    // Detect section headers
    if (visibleCells.length <= 3) {
      if (/^positions$/i.test(rowJoined)) {
        currentSection = 'positions';
        activeMap = null;
        return;
      }
      if (/^open positions$/i.test(rowJoined)) {
        currentSection = 'open_positions';
        activeMap = null;
        return;
      }
      if (/^deals$/i.test(rowJoined)) {
        currentSection = 'deals';
        activeMap = null;
        return;
      }
      if (/^orders$/i.test(rowJoined) || /^working orders$/i.test(rowJoined)) {
        currentSection = 'orders';
        activeMap = null;
        return;
      }
      if (/closed transactions/i.test(rowLower)) {
        currentSection = 'closed_tx';
        activeMap = null;
        return;
      }
      if (/open trades/i.test(rowLower)) {
        currentSection = 'open_tx';
        activeMap = null;
        return;
      }
      if (/summary:|total|closed p\/l|balance:|free margin/i.test(rowLower)) {
        if (currentSection === 'open_tx' || currentSection === 'closed_tx') {
          currentSection = 'none';
        }
        return;
      }
    }

    // Check if this row is a table header row
    const hasSymbolCol = visibleCells.some((c) =>
      ['symbol', 'item', 'pair', 'instrument'].includes(c.toLowerCase())
    );
    const hasPriceCol = visibleCells.some((c) =>
      ['price', 'open price', 'entry price', 'entry'].includes(c.toLowerCase())
    );
    if (hasSymbolCol && hasPriceCol && visibleCells.length >= 6) {
      activeMap = mapHeaders(visibleCells);
      if (currentSection === 'none') {
        currentSection = activeMap.direction !== undefined ? 'deals' : 'positions';
      }
      return;
    }

    if (currentSection === 'orders') return; // Pending/working orders are not executed positions

    // Fallback positional mapping if MT4/MT5 rows have no explicit header above them
    if (!activeMap && visibleCells.length >= 10) {
      const maybeMt4 = normalizeSide(visibleCells[2]) && normalizeDateTime(visibleCells[1]);
      const maybeMt5 = normalizeSide(visibleCells[3]) && normalizeDateTime(visibleCells[0]);
      if (maybeMt4) {
        activeMap = {
          ticket: 0,
          openTime: 1,
          type: 2,
          lots: 3,
          symbol: 4,
          entryPrice: 5,
          sl: 6,
          tp: 7,
          closeTime: 8,
          exitPrice: 9,
          commission: 10,
          taxes: 11,
          swap: 12,
          profit: 13,
        };
      } else if (maybeMt5) {
        activeMap = {
          openTime: 0,
          ticket: 1,
          symbol: 2,
          type: 3,
          lots: 4,
          entryPrice: 5,
          sl: 6,
          tp: 7,
          closeTime: 8,
          exitPrice: 9,
          commission: 10,
          swap: 11,
          profit: 12,
        };
      }
    }

    if (!activeMap) return;

    if (currentSection === 'deals') {
      dealRows.push({ cells: visibleCells, map: activeMap });
      return;
    }

    const mode: 'closed' | 'open' | 'auto' =
      currentSection === 'open_positions' || currentSection === 'open_tx'
        ? 'open'
        : currentSection === 'closed_tx' || currentSection === 'positions'
          ? 'auto'
          : 'auto';

    const res = parseRowWithMap(visibleCells, activeMap, mode, rowIdx, timezoneOffsetHours);
    if (res.ignored) ignoredRows++;
    else if (res.candidate) trades.push(res.candidate);
  });

  // Fallback: if MT5 export only had a `Deals` section (no `Positions` section), reconstruct from Deals!
  if (trades.length === 0 && dealRows.length > 0) {
    const reconstructed = reconstructTradesFromDeals(dealRows, timezoneOffsetHours);
    trades.push(...reconstructed.trades);
    ignoredRows += reconstructed.ignored;
    if (reconstructed.trades.length > 0) {
      warnings.push(
        `No "Positions" table found; automatically reconstructed ${reconstructed.trades.length} trade(s) from the "Deals" history.`
      );
    }
  }

  return {
    detectedFormat,
    accountMeta,
    trades,
    ignoredRows,
    warnings,
  };
}

function reconstructTradesFromDeals(
  dealRows: { cells: string[]; map: ColMap }[],
  timezoneOffsetHours: number
): { trades: ParsedTradeCandidate[]; ignored: number } {
  interface DealEntry {
    time: { date: string; time: string; datetime: string };
    ticket: string | null;
    symbol: string;
    side: PositionSide;
    dir: string; // 'in' | 'out' | 'in/out'
    lots: number;
    price: number;
    commission: number;
    swap: number;
    profit: number;
    comment: string | null;
  }
  const openQueue = new Map<string, DealEntry[]>();
  const trades: ParsedTradeCandidate[] = [];
  let ignored = 0;

  dealRows.forEach(({ cells, map }) => {
    const rawType = map.type !== undefined ? cells[map.type] : '';
    if (isIgnorableType(rawType)) {
      ignored++;
      return;
    }
    const side = normalizeSide(rawType);
    if (!side) return;
    const symbol = map.symbol !== undefined ? normalizePair(cells[map.symbol]) : '';
    const dt = map.openTime !== undefined ? normalizeDateTime(cells[map.openTime]) : null;
    const lots = map.lots !== undefined ? cleanNum(cells[map.lots]) : null;
    const price = map.entryPrice !== undefined ? cleanNum(cells[map.entryPrice]) : null;
    const dir = map.direction !== undefined ? cells[map.direction].trim().toLowerCase() : 'in';

    if (!symbol || !dt || !lots || !price) return;

    const deal: DealEntry = {
      time: dt,
      ticket: map.ticket !== undefined ? cells[map.ticket].trim() : null,
      symbol,
      side,
      dir,
      lots,
      price,
      commission:
        (map.commission !== undefined ? cleanNum(cells[map.commission]) || 0 : 0) +
        (map.fee !== undefined ? cleanNum(cells[map.fee]) || 0 : 0),
      swap: map.swap !== undefined ? cleanNum(cells[map.swap]) || 0 : 0,
      profit: map.profit !== undefined ? cleanNum(cells[map.profit]) || 0 : 0,
      comment: map.comment !== undefined ? cells[map.comment].trim() : null,
    };

    if (dir === 'in') {
      const arr = openQueue.get(symbol) || [];
      arr.push(deal);
      openQueue.set(symbol, arr);
    } else if (dir === 'out' || dir === 'out by') {
      const arr = openQueue.get(symbol) || [];
      const entry = arr.shift();
      if (entry) {
        trades.push(
          finalizeCandidate(
            {
              idx: trades.length,
              brokerTicket: entry.ticket || deal.ticket,
              rawSymbol: entry.symbol,
              position: entry.side,
              lots: deal.lots,
              entryDate: entry.time.date,
              entryTime: entry.time.time,
              exitDate: deal.time.date,
              exitTime: deal.time.time,
              entryPrice: entry.price,
              exitPrice: deal.price,
              commission: entry.commission + deal.commission,
              swap: entry.swap + deal.swap,
              brokerPnl: deal.profit,
              comment: deal.comment || entry.comment,
              isOpen: false,
            },
            timezoneOffsetHours
          )
        );
      }
    }
  });

  // Any remaining `in` deals are still open
  for (const [, rem] of openQueue.entries()) {
    for (const entry of rem) {
      trades.push(
        finalizeCandidate(
          {
            idx: trades.length,
            brokerTicket: entry.ticket,
            rawSymbol: entry.symbol,
            position: entry.side,
            lots: entry.lots,
            entryDate: entry.time.date,
            entryTime: entry.time.time,
            entryPrice: entry.price,
            commission: entry.commission,
            swap: entry.swap,
            comment: entry.comment,
            isOpen: true,
          },
          timezoneOffsetHours
        )
      );
    }
  }

  return { trades, ignored };
}

// ---------- SPREADSHEET PARSER (XLSX / XLS / CSV) ----------

function parseMatrixRows(
  matrix: unknown[][],
  timezoneOffsetHours: number
): {
  trades: ParsedTradeCandidate[];
  ignoredRows: number;
  accountMeta: ParseReportOutput['accountMeta'];
  detectedFormat: string;
} {
  let accountNumber: string | null = null;
  let accountName: string | null = null;
  let currency: string | null = null;
  let reportedBalance: number | null = null;

  // Scan top 10 rows for account metadata
  for (let r = 0; r < Math.min(10, matrix.length); r++) {
    const line = matrix[r].map((c) => String(c ?? '')).join(' ');
    const accM = /Account(?:\s*Number)?[:\s]+([0-9]{4,15})/i.exec(line);
    if (accM) accountNumber = accM[1];
    const nameM = /Name[:\s]+([^|\n\r]{2,50})/i.exec(line);
    if (nameM) accountName = nameM[1].trim();
    const curM = /Currency[:\s]+([A-Z]{3})/i.exec(line);
    if (curM) currency = curM[1];
    const balM = /Account Balance\s+([0-9,.]+)/i.exec(line);
    if (balM) reportedBalance = cleanNum(balM[1]);
  }

  const trades: ParsedTradeCandidate[] = [];
  let ignoredRows = 0;
  let activeMap: ColMap | null = null;
  let dateColIdx: number | null = null;
  let timeColIdx: number | null = null;
  let inSection: 'positions' | 'open_positions' | 'orders' | 'deals' | 'generic' = 'generic';
  let detectedFormat = 'Excel / CSV Trade Log';

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    const cells = row.map((c) => (c === null || c === undefined ? '' : String(c).trim()));
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    if (nonEmpty.length === 1) {
      const marker = nonEmpty[0].toLowerCase();
      if (marker === 'positions') {
        inSection = 'positions';
        detectedFormat = 'MT5 Excel Report';
        activeMap = null;
        continue;
      }
      if (marker === 'open positions') {
        inSection = 'open_positions';
        activeMap = null;
        continue;
      }
      if (marker === 'orders') {
        inSection = 'orders';
        activeMap = null;
        continue;
      }
      if (marker === 'deals') {
        inSection = 'deals';
        activeMap = null;
        continue;
      }
    }

    const lowerCells = cells.map((c) => c.toLowerCase());
    const hasSymbol = lowerCells.some((c) =>
      ['symbol', 'pair', 'item', 'instrument', 'currency pair'].includes(c)
    );
    const hasSideOrPrice = lowerCells.some((c) =>
      ['type', 'position', 'direction', 'side', 'action', 'entry price', 'open price', 'entry', 'price'].includes(c)
    );
    if (hasSymbol && hasSideOrPrice && nonEmpty.length >= 5) {
      activeMap = mapHeaders(cells);
      dateColIdx = lowerCells.indexOf('date');
      timeColIdx = lowerCells.indexOf('time');
      if (lowerCells.includes('entry time & date')) {
        detectedFormat = 'TCM Excel Journal';
      } else if (lowerCells.includes('strategy used') && lowerCells.includes('instrument')) {
        detectedFormat = 'TCM C5 TradeLog Excel';
      }
      continue;
    }

    if (inSection === 'orders' || inSection === 'deals') continue;
    if (!activeMap) continue;

    // Special handling for C5_TradeLog where Date + Time are separate columns!
    const rawRow = row;
    let overrideEntryDt: { date: string; time: string } | null = null;
    if (dateColIdx !== null && dateColIdx >= 0 && timeColIdx !== null && timeColIdx >= 0) {
      const dPart = normalizeDateTime(rawRow[dateColIdx]);
      const tPart = normalizeTimeOnly(rawRow[timeColIdx]);
      if (dPart && tPart) {
        overrideEntryDt = { date: dPart.date, time: tPart };
      }
    }

    // Use raw Excel values for numeric date serials when available
    const rowStrings = row.map((cell, ci) => {
      if (typeof cell === 'number') {
        if (ci === activeMap?.openTime || ci === activeMap?.closeTime) {
          const dt = normalizeDateTime(cell);
          return dt ? dt.datetime : String(cell);
        }
      }
      return cell === null || cell === undefined ? '' : String(cell).trim();
    });

    if (overrideEntryDt && activeMap.openTime !== undefined) {
      rowStrings[activeMap.openTime] = `${overrideEntryDt.date} ${overrideEntryDt.time}`;
    }

    const res = parseRowWithMap(
      rowStrings,
      activeMap,
      inSection === 'open_positions' ? 'open' : 'auto',
      r,
      timezoneOffsetHours
    );

    if (res.ignored) ignoredRows++;
    else if (res.candidate) trades.push(res.candidate);
  }

  return {
    trades,
    ignoredRows,
    accountMeta: { accountNumber, accountName, currency, reportedBalance },
    detectedFormat,
  };
}

export function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileName = 'report.xlsx',
  timezoneOffsetHours = 1
): ParseReportOutput {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const warnings: string[] = [];
  let bestResult: ReturnType<typeof parseMatrixRows> | null = null;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: '',
    });
    const parsed = parseMatrixRows(matrix, timezoneOffsetHours);
    if (!bestResult || parsed.trades.length > bestResult.trades.length) {
      bestResult = parsed;
    }
  }

  if (!bestResult) {
    return {
      detectedFormat: fileName.endsWith('.csv') ? 'CSV Report' : 'Excel Workbook',
      accountMeta: { accountNumber: null, accountName: null, currency: null, reportedBalance: null },
      trades: [],
      ignoredRows: 0,
      warnings: ['No readable trade rows were found in this spreadsheet.'],
    };
  }

  return {
    detectedFormat: bestResult.detectedFormat,
    accountMeta: bestResult.accountMeta,
    trades: bestResult.trades,
    ignoredRows: bestResult.ignoredRows,
    warnings,
  };
}

// ---------- DELIMITED TEXT / PASTE PARSER (TSV / CSV / Headerless MT4/MT5 / JSON) ----------

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t').map((s) => s.trim());
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

export function parsePastedOrTextReport(
  rawText: string,
  fileName = 'pasted-report.txt',
  timezoneOffsetHours = 1
): ParseReportOutput {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      detectedFormat: 'Empty Input',
      accountMeta: { accountNumber: null, accountName: null, currency: null, reportedBalance: null },
      trades: [],
      ignoredRows: 0,
      warnings: ['No content provided.'],
    };
  }

  // 1. HTML detection
  if (/<html|<table|<tr|<td/i.test(trimmed)) {
    return parseHtmlReport(trimmed, timezoneOffsetHours);
  }

  // 2. JSON backup detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : Array.isArray(data?.trades) ? data.trades : [];
      const trades: ParsedTradeCandidate[] = [];
      arr.forEach((item: Record<string, unknown>, idx: number) => {
        const pair = normalizePair(String(item.pair || item.symbol || ''));
        const pos = normalizeSide(item.position || item.type || item.side);
        const lots = cleanNum(item.lots ?? item.lot ?? item.volume);
        const entryPrice = cleanNum(item.entryPrice ?? item.entry_price ?? item.entry);
        const entryDt = normalizeDateTime(
          item.entryDatetime ||
            (item.entryDate ? `${item.entryDate} ${item.entryTime || '12:00:00'}` : null)
        );
        if (!pair || !pos || !lots || !entryPrice || !entryDt) return;
        const exitPrice = cleanNum(item.exitPrice ?? item.exit_price ?? item.exit);
        const exitDt = normalizeDateTime(
          item.exitDatetime ||
            (item.exitDate ? `${item.exitDate} ${item.exitTime || '12:00:00'}` : null)
        );
        trades.push(
          finalizeCandidate(
            {
              idx,
              brokerTicket: item.brokerTicket ? String(item.brokerTicket) : null,
              rawSymbol: pair,
              position: pos,
              lots,
              entryDate: entryDt.date,
              entryTime: entryDt.time,
              exitDate: exitDt?.date || null,
              exitTime: exitDt?.time || null,
              entryPrice,
              stopLoss: cleanNum(item.stopLoss ?? item.stop_loss ?? item.sl),
              takeProfit: cleanNum(item.takeProfit ?? item.take_profit ?? item.tp),
              exitPrice,
              commission: cleanNum(item.commission) || 0,
              swap: cleanNum(item.swap) || 0,
              brokerPnl: cleanNum(item.brokerPnl ?? item.broker_pnl ?? item.pnl ?? item.profit),
              riskAmount: cleanNum(item.riskAmount ?? item.risk_amount ?? item.risk),
              setup: item.setup ? String(item.setup) : null,
              session: item.session ? normalizeSession(String(item.session), entryDt.time, timezoneOffsetHours) : null,
              notes: item.notes ? String(item.notes) : null,
              mistakes: item.mistakes ? String(item.mistakes) : null,
              isOpen: exitPrice === null || !exitDt,
            },
            timezoneOffsetHours
          )
        );
      });
      return {
        detectedFormat: 'JSON Backup',
        accountMeta: { accountNumber: null, accountName: null, currency: null, reportedBalance: null },
        trades,
        ignoredRows: 0,
        warnings: [],
      };
    } catch {
      // fall through to delimited text
    }
  }

  // 3. Tab-separated or Comma-separated pasted lines (e.g. copy-paste from Excel / MT5 HTML / CSV)
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const firstSample = lines.slice(0, 10).join('\n');
  const delimiter = firstSample.includes('\t')
    ? '\t'
    : firstSample.includes(';') && !firstSample.includes(',')
      ? ';'
      : ',';

  const matrix = lines.map((line) => splitDelimitedLine(line, delimiter));
  const parsed = parseMatrixRows(matrix, timezoneOffsetHours);

  // If no header row was copied (user pasted raw MT4/MT5 rows directly), try positional parsing!
  if (parsed.trades.length === 0) {
    const positionalTrades: ParsedTradeCandidate[] = [];
    let ignoredRows = 0;
    matrix.forEach((cells, r) => {
      if (cells.length < 9) return;
      // MT4 row: Ticket | OpenTime | Type | Lots | Symbol | Entry | SL | TP | CloseTime | Exit | Comm | Tax | Swap | Profit
      if (normalizeSide(cells[2]) && normalizeDateTime(cells[1])) {
        const res = parseRowWithMap(
          cells,
          {
            ticket: 0,
            openTime: 1,
            type: 2,
            lots: 3,
            symbol: 4,
            entryPrice: 5,
            sl: 6,
            tp: 7,
            closeTime: 8,
            exitPrice: 9,
            commission: 10,
            taxes: 11,
            swap: 12,
            profit: 13,
          },
          'auto',
          r,
          timezoneOffsetHours
        );
        if (res.ignored) ignoredRows++;
        else if (res.candidate) positionalTrades.push(res.candidate);
        return;
      }
      // MT5 row: OpenTime | Position | Symbol | Type | Volume | Price | SL | TP | CloseTime | ClosePrice | Comm | Swap | Profit
      if (normalizeSide(cells[3]) && normalizeDateTime(cells[0])) {
        const res = parseRowWithMap(
          cells,
          {
            openTime: 0,
            ticket: 1,
            symbol: 2,
            type: 3,
            lots: 4,
            entryPrice: 5,
            sl: 6,
            tp: 7,
            closeTime: 8,
            exitPrice: 9,
            commission: 10,
            swap: 11,
            profit: 12,
          },
          'auto',
          r,
          timezoneOffsetHours
        );
        if (res.ignored) ignoredRows++;
        else if (res.candidate) positionalTrades.push(res.candidate);
      }
    });

    if (positionalTrades.length > 0) {
      return {
        detectedFormat: delimiter === '\t' ? 'Pasted MT4/MT5 Rows (TSV)' : 'Pasted MT4/MT5 Rows (CSV)',
        accountMeta: parsed.accountMeta,
        trades: positionalTrades,
        ignoredRows,
        warnings: [],
      };
    }
  }

  return {
    detectedFormat:
      parsed.trades.length > 0
        ? parsed.detectedFormat
        : fileName.endsWith('.csv')
          ? 'CSV Report'
          : 'Pasted Table Text',
    accountMeta: parsed.accountMeta,
    trades: parsed.trades,
    ignoredRows: parsed.ignoredRows,
    warnings:
      parsed.trades.length === 0
        ? [
            'Could not detect trade rows. Paste raw MT4/MT5 HTML source, copy the table rows from Excel/browser, or upload the .html / .xlsx / .csv file directly.',
          ]
        : [],
  };
}

export function parseReportBuffer(
  buffer: Buffer,
  fileName: string,
  timezoneOffsetHours = 1
): ParseReportOutput {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseSpreadsheetBuffer(buffer, fileName, timezoneOffsetHours);
  }
  const text = decodeFileBuffer(buffer);
  return parsePastedOrTextReport(text, fileName, timezoneOffsetHours);
}
