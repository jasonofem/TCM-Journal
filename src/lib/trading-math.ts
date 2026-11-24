import {
  BreakdownRow,
  ComputedTrade,
  DashboardFilters,
  DashboardMetrics,
  EquityPoint,
  FirmEquityPoint,
  PositionSide,
  QualityFlag,
  TradeOutcome,
  TradeRecord,
  TradingSession,
  UserProfile,
} from './types';

export const STANDARD_PAIRS = [
  'AUDCHF',
  'AUDJPY',
  'AUDCAD',
  'AUDUSD',
  'AUDNZD',
  'EURGBP',
  'EURCHF',
  'EURJPY',
  'EURCAD',
  'EURUSD',
  'EURNZD',
  'EURAUD',
  'GBPCHF',
  'GBPJPY',
  'GBPCAD',
  'GBPUSD',
  'GBPNZD',
  'GBPAUD',
  'NZDCHF',
  'NZDJPY',
  'NZDCAD',
  'NZDUSD',
  'CADJPY',
  'CADCHF',
  'USDCHF',
  'USDJPY',
  'USDCAD',
  'XAUUSD',
  'CHFJPY',
] as const;

export const STANDARD_SETUPS = [
  'H1 5050 Bounce',
  'H4 50505 Bounce',
  'Safety trade',
  'Other',
] as const;

export const SESSIONS: TradingSession[] = ['Asian', 'Tokyo', 'London', 'New York'];

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;

export const EXIT_REASONS = [
  'Take profit hit',
  'Stop loss hit',
  'Breakeven / scratch',
  'Manual close',
  'Partial close then full',
  'News / invalidation',
] as const;

export const MARKET_CONDITIONS = [
  'Trending',
  'Ranging',
  'Volatile / news',
  'Low liquidity',
] as const;

export const FOLLOWED_PLAN_OPTIONS = ['Yes', 'Partial', 'No'] as const;

export const EMOTIONS = [
  '1 — Calm',
  '2 — Composed',
  '3 — Neutral',
  '4 — Anxious / FOMO',
  '5 — Tilted / Revenge',
] as const;

export const TCM_PAIRS = STANDARD_PAIRS;
export const SETUPS = STANDARD_SETUPS;
export const TRADING_SESSIONS = SESSIONS;
export const DAYS_OF_WEEK = WEEKDAYS;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'ZAR', 'CAD', 'AUD', 'CHF', 'JPY'] as const;

const KNOWN_SYMBOL_ALIASES: Record<string, string> = {
  GOLD: 'XAUUSD',
  XAU: 'XAUUSD',
  'XAU/USD': 'XAUUSD',
  'XAUUSD.': 'XAUUSD',
  SILVER: 'XAGUSD',
  'XAG/USD': 'XAGUSD',
  US30: 'US30',
  DJ30: 'US30',
  NAS100: 'NAS100',
  USTEC: 'NAS100',
  NDX100: 'NAS100',
  SPX500: 'SPX500',
  US500: 'SPX500',
  BTCUSD: 'BTCUSD',
  ETHUSD: 'ETHUSD',
};

export function normalizePair(raw: string): string {
  const cleaned = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace('/', '');

  if (!cleaned) return 'OTHER';
  if (KNOWN_SYMBOL_ALIASES[cleaned]) return KNOWN_SYMBOL_ALIASES[cleaned];

  // Strip common broker suffixes like EURUSD.m, EURUSDm, EURUSD.pro, EURUSD_i, XAUUSD.raw, EURUSD#
  const strippedDot = cleaned.replace(/[._#-](M|R|PRO|RAW|ECN|STD|MINI|MICRO|CENT|I|C|Z|S|B|A|SB)$/i, '');
  if (KNOWN_SYMBOL_ALIASES[strippedDot]) return KNOWN_SYMBOL_ALIASES[strippedDot];

  // Check if starts with a known 6-letter FX/metal symbol followed by broker suffix letter(s)
  for (const sym of STANDARD_PAIRS) {
    if (strippedDot === sym) return sym;
    if (strippedDot.startsWith(sym) && strippedDot.length <= sym.length + 3) {
      return sym;
    }
  }

  // Handle single trailing lowercase/broker char like EURUSDm or XAUUSDc
  const base6 = strippedDot.slice(0, 6);
  if ((STANDARD_PAIRS as readonly string[]).includes(base6) && strippedDot.length <= 8) {
    return base6;
  }

  if (strippedDot.startsWith('XAU')) return 'XAUUSD';
  if (strippedDot.startsWith('GOLD')) return 'XAUUSD';

  return strippedDot || 'OTHER';
}

export function normalizeSetup(raw?: string | null): { setup: string; customSetup: string | null } {
  const val = (raw || '').trim();
  if (!val) return { setup: 'H1 5050 Bounce', customSetup: null };
  const lower = val.toLowerCase().replace(/\s+/g, ' ');
  if (lower.includes('h1') && (lower.includes('5050') || lower.includes('50/50') || lower.includes('50-50'))) {
    return { setup: 'H1 5050 Bounce', customSetup: null };
  }
  if (lower.includes('h4') && (lower.includes('50505') || lower.includes('5050') || lower.includes('50/50') || lower.includes('50-50'))) {
    return { setup: 'H4 50505 Bounce', customSetup: null };
  }
  if (lower.includes('safety')) {
    return { setup: 'Safety trade', customSetup: null };
  }
  if ((STANDARD_SETUPS as readonly string[]).includes(val)) {
    return { setup: val, customSetup: null };
  }
  return { setup: 'Other', customSetup: val };
}

export function getPipSize(pair: string): number {
  const sym = normalizePair(pair);
  if (sym.includes('JPY')) return 0.01;
  if (sym.startsWith('XAU') || sym === 'GOLD') return 0.1;
  if (sym.startsWith('XAG')) return 0.01;
  if (['US30', 'NAS100', 'SPX500', 'GER40', 'UK100'].includes(sym)) return 1.0;
  return 0.0001;
}

export function getPriceDecimals(pair: string): number {
  const sym = normalizePair(pair);
  if (sym.includes('JPY')) return 3;
  if (sym.startsWith('XAU') || sym.startsWith('XAG') || ['US30', 'NAS100', 'SPX500'].includes(sym)) return 2;
  return 5;
}

export function getContractSize(pair: string): number {
  const sym = normalizePair(pair);
  if (sym.startsWith('XAU')) return 100;
  if (sym.startsWith('XAG')) return 5000;
  if (['US30', 'NAS100', 'SPX500'].includes(sym)) return 1;
  return 100000;
}

export function getDirectionSign(position: PositionSide): 1 | -1 {
  return position === 'Buy' ? 1 : -1;
}

export function getDayOfWeekFromDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return 'Monday';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const idx = dt.getUTCDay(); // 0 = Sun
  const map = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return map[idx] || 'Monday';
}

export function detectSessionFromTime(
  timeStr: string,
  sourceOffsetHours = 1
): TradingSession {
  const m = /^(\d{1,2}):(\d{2})/.exec((timeStr || '').trim());
  if (!m) return 'London';
  const hour = Number(m[1]);
  // Convert to UTC hour cleanly
  const utcHour = (((hour - sourceOffsetHours) % 24) + 24) % 24;

  // Trading sessions in UTC:
  // Asian (Sydney/early Asia): 22:00 - 02:59 UTC
  // Tokyo: 03:00 - 06:59 UTC
  // London: 07:00 - 12:59 UTC
  // New York: 13:00 - 21:59 UTC
  if (utcHour >= 13 && utcHour < 22) return 'New York';
  if (utcHour >= 7 && utcHour < 13) return 'London';
  if (utcHour >= 3 && utcHour < 7) return 'Tokyo';
  return 'Asian';
}

export function normalizeSession(raw?: string | null, fallbackTime = '12:00:00', offsetHours = 1): TradingSession {
  const lower = (raw || '').trim().toLowerCase();
  if (lower.includes('new') || lower === 'ny') return 'New York';
  if (lower.includes('lon') || lower === 'ldn') return 'London';
  if (lower.includes('tok') || lower === 'tyo') return 'Tokyo';
  if (lower.includes('asia') || lower.includes('syd')) return 'Asian';
  return detectSessionFromTime(fallbackTime, offsetHours);
}

export function parseDatetimeMs(dateStr: string | null, timeStr: string | null): number | null {
  if (!dateStr) return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dm) return null;
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec((timeStr || '00:00:00').trim());
  const hh = tm ? Number(tm[1]) : 0;
  const mm = tm ? Number(tm[2]) : 0;
  const ss = tm && tm[3] ? Number(tm[3]) : 0;
  return Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hh, mm, ss);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '—';
  const totalMins = Math.round(minutes);
  const d = Math.floor(totalMins / (24 * 60));
  const h = Math.floor((totalMins % (24 * 60)) / 60);
  const m = totalMins % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

export const formatDurationMinutes = formatDuration;

export function estimateGrossPnl(
  pair: string,
  position: PositionSide,
  lots: number,
  entryPrice: number,
  exitPrice: number
): number {
  const sym = normalizePair(pair);
  const dir = getDirectionSign(position);
  const contract = getContractSize(sym);
  const raw = (exitPrice - entryPrice) * dir * contract * lots;

  if (sym.endsWith('USD')) {
    return raw;
  }
  if (sym.startsWith('USD')) {
    return exitPrice > 0 ? raw / exitPrice : raw;
  }
  // Cross pairs estimate: pips * $10 * lots
  const pipSize = getPipSize(sym);
  const pips = ((exitPrice - entryPrice) * dir) / pipSize;
  return pips * 10 * lots;
}

export function estimateRiskAmount(
  pair: string,
  lots: number,
  entryPrice: number,
  stopLoss: number | null
): number | null {
  if (stopLoss === null || !Number.isFinite(stopLoss) || stopLoss <= 0 || lots <= 0) return null;
  const sym = normalizePair(pair);
  const contract = getContractSize(sym);
  const dist = Math.abs(entryPrice - stopLoss);
  if (dist === 0) return 0;

  if (sym.endsWith('USD')) {
    return dist * contract * lots;
  }
  if (sym.startsWith('USD')) {
    return entryPrice > 0 ? (dist * contract * lots) / entryPrice : dist * contract * lots;
  }
  const pipSize = getPipSize(sym);
  const slPips = dist / pipSize;
  return slPips * 10 * lots;
}

export function computeTrades(
  trades: TradeRecord[],
  settings: Pick<UserProfile, 'initialCapital' | 'breakevenThreshold'>
): ComputedTrade[] {
  const threshold = Math.max(0, settings.breakevenThreshold ?? 0);

  const preliminary: ComputedTrade[] = trades.map((t) => {
    const pipSize = getPipSize(t.pair);
    const dir = getDirectionSign(t.position);
    const effectiveSetup =
      t.setup === 'Other' && t.customSetup ? t.customSetup : t.setup || 'Other';

    const slPips =
      t.stopLoss !== null && t.stopLoss > 0
        ? Math.abs(t.entryPrice - t.stopLoss) / pipSize
        : null;
    const tpPips =
      t.takeProfit !== null && t.takeProfit > 0
        ? Math.abs(t.takeProfit - t.entryPrice) / pipSize
        : null;

    const plannedRr =
      slPips !== null && slPips > 0 && tpPips !== null ? tpPips / slPips : null;

    const isClosed = t.exitPrice !== null && t.exitPrice > 0 && Boolean(t.exitDate);
    const resultPips =
      isClosed && t.exitPrice !== null
        ? ((t.exitPrice - t.entryPrice) * dir) / pipSize
        : null;

    const totalCost = (t.commission || 0) + (t.swap || 0);
    // Note: in MT4/MT5 reports, commission & swap are usually negative numbers (costs) and Profit is gross trade profit.
    // If manual entry uses positive commission cost, handle thoughtfully:
    // Standard TCM manual spec: Net PnL = (override OR estimate) - abs(commission) if commission > 0, or + commission + swap if negative!
    let grossPnl: number | null = null;
    let netPnl: number | null = null;
    let pnlSource: 'broker' | 'estimated' | 'open' = 'open';

    if (isClosed && t.exitPrice !== null) {
      if (t.brokerPnl !== null && Number.isFinite(t.brokerPnl)) {
        grossPnl = t.brokerPnl;
        // Broker PnL from MT4/MT5 is raw trade profit; commission/swap in MT4/MT5 are negative when fees apply
        if (t.source === 'manual') {
          // Manual entry: user inputs positive fee in Commission/swap field -> subtract it
          const fee = (t.commission || 0) >= 0 ? -(t.commission || 0) : (t.commission || 0);
          const swapVal = t.swap || 0;
          netPnl = grossPnl + fee + swapVal;
        } else {
          // Imported reports: commission & swap already carry their sign (e.g. -2.45)
          netPnl = grossPnl + totalCost;
        }
        pnlSource = 'broker';
      } else {
        grossPnl = estimateGrossPnl(t.pair, t.position, t.lots, t.entryPrice, t.exitPrice);
        const fee = (t.commission || 0) > 0 ? -(t.commission || 0) : (t.commission || 0);
        netPnl = grossPnl + fee + (t.swap || 0);
        pnlSource = 'estimated';
      }
    }

    let outcome: TradeOutcome = 'Open';
    if (isClosed && netPnl !== null) {
      if (Math.abs(netPnl) <= threshold) outcome = 'BE';
      else if (netPnl > threshold) outcome = 'Win';
      else outcome = 'Loss';
    }

    const entryMs = parseDatetimeMs(t.entryDate, t.entryTime);
    const exitMs = isClosed ? parseDatetimeMs(t.exitDate, t.exitTime || t.entryTime) : null;
    const durationMinutes =
      entryMs !== null && exitMs !== null && exitMs >= entryMs
        ? (exitMs - entryMs) / 60000
        : null;

    const estRisk = estimateRiskAmount(t.pair, t.lots, t.entryPrice, t.stopLoss);
    const computedRiskAmount =
      t.riskAmount !== null && t.riskAmount > 0 ? t.riskAmount : estRisk;
    const computedRiskPct =
      t.riskPct !== null && t.riskPct > 0
        ? t.riskPct
        : computedRiskAmount !== null && settings.initialCapital > 0
          ? (computedRiskAmount / settings.initialCapital) * 100
          : null;

    let realizedRr: number | null = null;
    if (isClosed && resultPips !== null && slPips !== null && slPips > 0) {
      realizedRr = resultPips / slPips;
    } else if (isClosed && netPnl !== null && computedRiskAmount !== null && computedRiskAmount > 0) {
      realizedRr = netPnl / computedRiskAmount;
    }

    const flags: QualityFlag[] = [];
    if (t.stopLoss === null || t.stopLoss <= 0) {
      flags.push({ level: 'warning', message: 'No Stop Loss recorded' });
    } else {
      if (t.position === 'Buy' && t.stopLoss >= t.entryPrice) {
        flags.push({ level: 'error', message: 'Stop Loss is at or above Entry on a Buy' });
      }
      if (t.position === 'Sell' && t.stopLoss <= t.entryPrice) {
        flags.push({ level: 'error', message: 'Stop Loss is at or below Entry on a Sell' });
      }
    }
    if (t.takeProfit !== null && t.takeProfit > 0) {
      if (t.position === 'Buy' && t.takeProfit <= t.entryPrice) {
        flags.push({ level: 'warning', message: 'Take Profit is below Entry on a Buy' });
      }
      if (t.position === 'Sell' && t.takeProfit >= t.entryPrice) {
        flags.push({ level: 'warning', message: 'Take Profit is above Entry on a Sell' });
      }
    }
    if (
      t.riskAmount !== null &&
      t.riskAmount > 0 &&
      estRisk !== null &&
      estRisk > 0 &&
      Math.abs(t.riskAmount - estRisk) / estRisk > 0.15
    ) {
      flags.push({
        level: 'warning',
        message: `Typed risk ($${t.riskAmount.toFixed(2)}) diverges >15% from SL estimate ($${estRisk.toFixed(2)})`,
      });
    }
    if (entryMs !== null && exitMs !== null && exitMs < entryMs) {
      flags.push({ level: 'error', message: 'Exit datetime is earlier than Entry datetime' });
    }

    return {
      ...t,
      effectiveSetup,
      pipSize,
      slPips,
      tpPips,
      resultPips,
      plannedRr,
      realizedRr,
      durationMinutes,
      durationLabel: formatDuration(durationMinutes),
      grossPnl,
      netPnl,
      pnlSource,
      outcome,
      balanceAfter: null,
      computedRiskAmount,
      computedRiskPct,
      flags,
    };
  });

  // Running balance sorted chronologically by exit datetime, then S/N (closed trades only)
  const closedSorted = preliminary
    .filter((t) => t.outcome !== 'Open' && t.netPnl !== null)
    .sort((a, b) => {
      const aTime = (a.exitDatetime || a.entryDatetime || '').localeCompare(
        b.exitDatetime || b.entryDatetime || ''
      );
      if (aTime !== 0) return aTime;
      return a.sn - b.sn;
    });

  let runningBalance = settings.initialCapital;
  const balanceMap = new Map<string, number>();
  for (const t of closedSorted) {
    runningBalance += t.netPnl || 0;
    balanceMap.set(t.id, runningBalance);
  }

  return preliminary.map((t) => ({
    ...t,
    balanceAfter: balanceMap.get(t.id) ?? null,
  }));
}

export function filterComputedTrades(
  trades: ComputedTrade[],
  filters: DashboardFilters
): ComputedTrade[] {
  return trades.filter((t) => {
    if (filters.pair !== 'ALL' && t.pair !== filters.pair) return false;
    if (filters.weekday !== 'ALL' && t.dayOfWeek !== filters.weekday) return false;
    if (filters.session !== 'ALL' && t.session !== filters.session) return false;
    if (filters.setup !== 'ALL' && t.effectiveSetup !== filters.setup) return false;
    if (filters.dateFrom && t.entryDate < filters.dateFrom) return false;
    if (filters.dateTo && t.entryDate > filters.dateTo) return false;
    return true;
  });
}

function aggregateGroup(
  trades: ComputedTrade[],
  keyFn: (t: ComputedTrade) => string,
  order?: readonly string[]
): BreakdownRow[] {
  const map = new Map<string, ComputedTrade[]>();
  for (const t of trades) {
    const k = keyFn(t);
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }

  const rows: BreakdownRow[] = [];
  for (const [label, items] of map.entries()) {
    const wins = items.filter((i) => i.outcome === 'Win').length;
    const losses = items.filter((i) => i.outcome === 'Loss').length;
    const be = items.filter((i) => i.outcome === 'BE').length;
    const netPnl = items.reduce((s, i) => s + (i.netPnl || 0), 0);
    const gp = items.filter((i) => (i.netPnl || 0) > 0).reduce((s, i) => s + (i.netPnl || 0), 0);
    const gl = Math.abs(
      items.filter((i) => (i.netPnl || 0) < 0).reduce((s, i) => s + (i.netPnl || 0), 0)
    );
    rows.push({
      label,
      trades: items.length,
      wins,
      losses,
      be,
      winRate: items.length > 0 ? (wins / items.length) * 100 : 0,
      netPnl,
      avgPnl: items.length > 0 ? netPnl / items.length : 0,
      profitFactor: gl > 0 ? gp / gl : gp > 0 ? null : 0,
    });
  }

  if (order) {
    const orderIdx = new Map(order.map((v, i) => [v, i]));
    rows.sort((a, b) => (orderIdx.get(a.label) ?? 99) - (orderIdx.get(b.label) ?? 99));
  } else {
    rows.sort((a, b) => b.netPnl - a.netPnl);
  }
  return rows;
}

export function computeDashboardMetrics(
  allComputed: ComputedTrade[],
  filteredComputed: ComputedTrade[],
  user: Pick<UserProfile, 'initialCapital' | 'dailyLossLimitPct' | 'timezoneOffsetHours'>
): DashboardMetrics {
  const closed = filteredComputed
    .filter((t) => t.outcome !== 'Open' && t.netPnl !== null)
    .sort((a, b) => {
      const cmp = (a.exitDatetime || a.entryDatetime).localeCompare(b.exitDatetime || b.entryDatetime);
      return cmp !== 0 ? cmp : a.sn - b.sn;
    });
  const open = filteredComputed.filter((t) => t.outcome === 'Open');

  const winsArr = closed.filter((t) => t.outcome === 'Win');
  const lossArr = closed.filter((t) => t.outcome === 'Loss');
  const beArr = closed.filter((t) => t.outcome === 'BE');

  const wins = winsArr.length;
  const losses = lossArr.length;
  const breakeven = beArr.length;
  const closedCount = closed.length;

  const winRate = closedCount > 0 ? (wins / closedCount) * 100 : null;
  const winRateExclBe = wins + losses > 0 ? (wins / (wins + losses)) * 100 : null;

  const totalNetPnl = closed.reduce((sum, t) => sum + (t.netPnl || 0), 0);
  const grossProfit = closed.filter((t) => (t.netPnl || 0) > 0).reduce((s, t) => s + (t.netPnl || 0), 0);
  const grossLoss = Math.abs(
    closed.filter((t) => (t.netPnl || 0) < 0).reduce((s, t) => s + (t.netPnl || 0), 0)
  );

  const profitFactorInfinite = grossLoss === 0 && grossProfit > 0;
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : profitFactorInfinite ? null : null;

  const startCap = user.initialCapital || 0;
  const currentEquity = startCap + totalNetPnl;
  const roiPct = startCap > 0 ? (totalNetPnl / startCap) * 100 : 0;

  const winPnls = winsArr.map((t) => t.netPnl || 0);
  const lossPnls = lossArr.map((t) => t.netPnl || 0);

  const largestWin = winPnls.length > 0 ? Math.max(...winPnls) : null;
  const largestLoss = lossPnls.length > 0 ? Math.min(...lossPnls) : null;
  const averageWin =
    winPnls.length > 0 ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : null;
  const averageLoss =
    lossPnls.length > 0 ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length : null;
  const expectancy = closedCount > 0 ? totalNetPnl / closedCount : null;

  let cumPnl = 0;
  let equity = startCap;
  let peakEquity = startCap;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const equityCurve: EquityPoint[] = [];

  closed.forEach((t, idx) => {
    const net = t.netPnl || 0;
    cumPnl += net;
    equity += net;
    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity - equity;
    const ddPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    equityCurve.push({
      index: idx + 1,
      label: `#${t.sn}`,
      date: t.exitDate || t.entryDate,
      pair: t.pair,
      netPnl: net,
      cumPnl,
      equity,
      drawdown: -dd,
    });
  });

  // Today's PnL & DLL % from all trades (WAT / user local date)
  const now = new Date();
  const offsetMs = (user.timezoneOffsetHours ?? 1) * 3600 * 1000;
  const todayStr = new Date(now.getTime() + offsetMs).toISOString().slice(0, 10);
  const todayClosed = allComputed.filter(
    (t) => t.outcome !== 'Open' && (t.exitDate === todayStr || t.entryDate === todayStr)
  );
  const todayPnl = todayClosed.reduce((s, t) => s + (t.netPnl || 0), 0);
  const allEquityBeforeToday =
    startCap +
    allComputed
      .filter((t) => t.outcome !== 'Open' && (t.exitDate || t.entryDate) < todayStr)
      .reduce((s, t) => s + (t.netPnl || 0), 0);
  const refBalance = allEquityBeforeToday > 0 ? allEquityBeforeToday : startCap;
  const todayLossPct = todayPnl < 0 && refBalance > 0 ? (Math.abs(todayPnl) / refBalance) * 100 : 0;
  const dllBreachedToday = todayLossPct >= (user.dailyLossLimitPct || 5);

  const planMarked = closed.filter((t) => t.followedPlan === 'Yes' || t.followedPlan === 'No' || t.followedPlan === 'Partial');
  const planYes = planMarked.filter((t) => t.followedPlan === 'Yes').length;
  const planAdherencePct = planMarked.length > 0 ? (planYes / planMarked.length) * 100 : null;

  const byPair = aggregateGroup(closed, (t) => t.pair);
  const bySession = aggregateGroup(closed, (t) => t.session, SESSIONS);
  const byWeekday = aggregateGroup(closed, (t) => t.dayOfWeek, WEEKDAYS);
  const bySetup = aggregateGroup(closed, (t) => t.effectiveSetup);
  const byMonthly = aggregateGroup(closed, (t) => (t.exitDate || t.entryDate).slice(0, 7)).sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  const bestPair = byPair[0] || null;
  const worstPair = byPair.length > 1 ? byPair[byPair.length - 1] : null;
  const bestSession = [...bySession].sort((a, b) => b.netPnl - a.netPnl)[0] || null;
  const bestSetup = [...bySetup].sort((a, b) => b.netPnl - a.netPnl)[0] || null;
  const bestWeekday = [...byWeekday].sort((a, b) => b.netPnl - a.netPnl)[0] || null;

  let insightSummary =
    'No closed trades in this slice. Import a report or log a complete ticket to populate analytics.';
  if (closedCount > 0) {
    const parts: string[] = [];
    if (bestPair) {
      parts.push(
        `Top pair: ${bestPair.label} (${bestPair.netPnl >= 0 ? '+' : ''}$${bestPair.netPnl.toFixed(2)}, ${bestPair.winRate.toFixed(0)}% WR)`
      );
    }
    if (worstPair && worstPair.netPnl < 0) {
      parts.push(`Drag: ${worstPair.label} (-$${Math.abs(worstPair.netPnl).toFixed(2)})`);
    }
    if (bestSession) {
      parts.push(
        `Strongest session: ${bestSession.label} (${bestSession.netPnl >= 0 ? '+' : ''}$${bestSession.netPnl.toFixed(2)})`
      );
    }
    if (bestSetup) {
      parts.push(`Best setup: ${bestSetup.label}`);
    }
    insightSummary = parts.join(' · ');
  }

  // Realized RR histogram buckets
  const rrDefs = [
    { label: '≤ -1.5R', test: (r: number) => r <= -1.5 },
    { label: '-1.5 to -0.5R', test: (r: number) => r > -1.5 && r <= -0.5 },
    { label: '-0.5 to 0.5R', test: (r: number) => r > -0.5 && r < 0.5 },
    { label: '0.5 to 1.5R', test: (r: number) => r >= 0.5 && r < 1.5 },
    { label: '1.5 to 2.5R', test: (r: number) => r >= 1.5 && r < 2.5 },
    { label: '≥ 2.5R', test: (r: number) => r >= 2.5 },
  ];
  const rrBuckets = rrDefs.map((b) => ({
    label: b.label,
    count: closed.filter((t) => t.realizedRr !== null && b.test(t.realizedRr)).length,
  }));

  const recentTape = [...closed]
    .sort((a, b) => {
      const cmp = (b.exitDatetime || b.entryDatetime).localeCompare(a.exitDatetime || a.entryDatetime);
      return cmp !== 0 ? cmp : b.sn - a.sn;
    })
    .slice(0, 10);

  return {
    closedCount,
    openCount: open.length,
    totalCount: filteredComputed.length,
    wins,
    losses,
    breakeven,
    winRate,
    winRateExclBe,
    totalNetPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    profitFactorInfinite,
    currentEquity,
    roiPct,
    largestWin,
    largestLoss,
    averageWin,
    averageLoss,
    expectancy,
    maxDrawdown,
    maxDrawdownPct,
    todayPnl,
    todayLossPct,
    dllBreachedToday,
    planAdherencePct,
    insightSummary,
    bestPair,
    worstPair,
    bestSession,
    bestSetup,
    bestWeekday,
    equityCurve,
    byPair,
    bySession,
    byWeekday,
    bySetup,
    byMonthly,
    rrBuckets,
    recentTape,
  };
}

export function computeJournalMetrics(
  rawTrades: TradeRecord[],
  opts: {
    initialCapital: number;
    defaultRiskPct: number;
    breakevenThreshold: number;
    dailyLossLimitPct: number;
    timezoneOffsetHours?: number;
  }
) {
  const computedTrades = computeTrades(rawTrades, {
    initialCapital: opts.initialCapital,
    breakevenThreshold: opts.breakevenThreshold,
  });
  const metrics = computeDashboardMetrics(computedTrades, computedTrades, {
    initialCapital: opts.initialCapital,
    dailyLossLimitPct: opts.dailyLossLimitPct,
    timezoneOffsetHours: opts.timezoneOffsetHours ?? 1,
  });
  return { computedTrades, metrics, insightSummary: metrics.insightSummary };
}

export function buildFirmEquityCurve(
  firmTrades: Array<ComputedTrade & { traderIdCode: string; traderName: string }>,
  totalInitialCapital: number
): {
  points: FirmEquityPoint[];
  peakEquity: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  roiPct: number;
} {
  const closedSorted = firmTrades
    .filter((t) => t.outcome !== 'Open' && t.netPnl !== null)
    .sort((a, b) => {
      const aDt = a.exitDatetime || a.entryDatetime || '';
      const bDt = b.exitDatetime || b.entryDatetime || '';
      const dtCmp = aDt.localeCompare(bDt);
      if (dtCmp !== 0) return dtCmp;
      const entryCmp = (a.entryDatetime || '').localeCompare(b.entryDatetime || '');
      if (entryCmp !== 0) return entryCmp;
      const traderCmp = a.traderIdCode.localeCompare(b.traderIdCode);
      if (traderCmp !== 0) return traderCmp;
      return a.sn - b.sn;
    });

  let cumPnl = 0;
  let equity = totalInitialCapital;
  let peakEquity = totalInitialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const points: FirmEquityPoint[] = [];
  closedSorted.forEach((t, idx) => {
    const net = t.netPnl || 0;
    cumPnl += net;
    equity = totalInitialCapital + cumPnl;
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = equity - peakEquity; // <= 0
    const drawdownPct = peakEquity > 0 ? (Math.abs(drawdown) / peakEquity) * 100 : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;

    points.push({
      index: idx + 1,
      label: `#${idx + 1}`,
      date: t.exitDate || t.entryDate,
      datetime: t.exitDatetime || t.entryDatetime,
      traderIdCode: t.traderIdCode,
      traderName: t.traderName,
      pair: t.pair,
      netPnl: net,
      cumPnl,
      equity,
      peakEquity,
      drawdown,
      drawdownPct,
    });
  });

  const roiPct = totalInitialCapital > 0 ? (cumPnl / totalInitialCapital) * 100 : 0;
  return { points, peakEquity, maxDrawdown, maxDrawdownPct, roiPct };
}
