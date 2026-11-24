import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { hashPin, verifyPin } from '@/lib/auth';
import { classifyImportedTrades } from '@/lib/dedupe';
import {
  decodeFileBuffer,
  parseHtmlReport,
  parsePastedOrTextReport,
  parseSpreadsheetBuffer,
} from '@/lib/import-parser';
import { computeJournalMetrics } from '@/lib/trading-math';
import { TradeRecord } from '@/lib/types';

function makeExistingTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 'tr-1',
    userId: 'u-1',
    sn: 1,
    pair: 'EURUSD',
    position: 'Buy',
    setup: 'H1 5050 Bounce',
    customSetup: null,
    entryDate: '2026-11-18',
    entryTime: '08:15:00',
    entryDatetime: '2026-11-18 08:15:00',
    dayOfWeek: 'Wednesday',
    session: 'London',
    lots: 0.5,
    riskAmount: 50,
    riskPct: 0.5,
    entryPrice: 1.0842,
    stopLoss: 1.0832,
    takeProfit: 1.0867,
    exitPrice: 1.0867,
    exitDate: '2026-11-18',
    exitTime: '11:40:00',
    exitDatetime: '2026-11-18 11:40:00',
    exitReason: 'Take profit hit',
    commission: 0,
    swap: 0,
    brokerPnl: 125,
    followedPlan: 'Yes',
    marketCondition: 'Trending',
    timeframe: 'H1',
    emotion: '2 — Composed',
    brokerTicket: '84920145',
    fingerprint: 'EURUSD|Buy|2026-11-18 08:15:00|1.08420|0.50',
    chartUrl: null,
    beforeScreenshot: null,
    afterScreenshot: null,
    mistakes: null,
    maePips: null,
    mfePips: null,
    notes: null,
    source: 'html_import',
    importBatchId: null,
    adminReviewNote: null,
    adminReviewedAt: null,
    createdAt: '2026-11-18T11:45:00Z',
    updatedAt: '2026-11-18T11:45:00Z',
    ...overrides,
  };
}

describe('TCM Multi-Format Broker Report Parser', () => {
  it('parses MT4 HTML statement and ignores deposit/balance & pending limit orders', () => {
    const mt4Html = `
      <html><body>
      <div>Account: 8396045 &nbsp; Name: Jason Ofem &nbsp; Currency: USD</div>
      <table>
        <tr><td colspan="14"><b>Closed Transactions:</b></td></tr>
        <tr>
          <td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td>
          <td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td>
          <td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td>
        </tr>
        <tr>
          <td>710001</td><td>2026.08.04 10:00:00</td><td>balance</td><td></td><td>Deposit</td>
          <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>5 000.00</td>
        </tr>
        <tr>
          <td>84920145</td><td>2026.11.18 08:15:00</td><td>buy</td><td>0.50</td><td>EURUSD.pro</td>
          <td>1.08420</td><td>1.08320</td><td>1.08670</td><td>2026.11.18 11:40:00</td><td>1.08670</td>
          <td>-3.50</td><td>0.00</td><td>0.00</td><td>125.00</td>
        </tr>
        <tr>
          <td>84920146</td><td>2026.11.18 14:00:00</td><td>buy limit</td><td>0.20</td><td>GBPUSD</td>
          <td>1.28000</td><td>1.27800</td><td>1.28500</td><td>2026.11.18 16:00:00</td><td>0.00000</td>
          <td>0.00</td><td>0.00</td><td>0.00</td><td>0.00</td>
        </tr>
        <tr><td colspan="14"><b>Open Trades:</b></td></tr>
        <tr>
          <td>84920199</td><td>2026.11.24 09:30:00</td><td>sell</td><td>0.10</td><td>XAUUSD</td>
          <td>2650.00</td><td>2660.00</td><td>2625.00</td><td></td><td>2644.10</td>
          <td>0.00</td><td>0.00</td><td>0.00</td><td>59.00</td>
        </tr>
      </table>
      </body></html>
    `;

    const res = parseHtmlReport(mt4Html, 1);
    expect(res.detectedFormat).toBe('MT4 HTML Statement');
    expect(res.accountMeta.accountNumber).toBe('8396045');
    expect(res.ignoredRows).toBe(2); // balance + buy limit
    expect(res.trades).toHaveLength(2);

    expect(res.trades[0].pair).toBe('EURUSD');
    expect(res.trades[0].brokerTicket).toBe('84920145');
    expect(res.trades[0].commission).toBe(-3.5);
    expect(res.trades[0].brokerPnl).toBe(125);
    expect(res.trades[0].isOpen).toBe(false);

    expect(res.trades[1].pair).toBe('XAUUSD');
    expect(res.trades[1].isOpen).toBe(true);
    expect(res.trades[1].exitPrice).toBeNull();
    expect(res.trades[1].brokerPnl).toBeNull();
  });

  it('decodes and parses UTF-16LE BOM MT5 HTML Reports with hidden cells & space-thousands numbers', () => {
    const mt5Html = `
      <!DOCTYPE html>
      <html><body>
      <div>Trade History Report - Account: 315077956 (USD, MetaTrader 5)</div>
      <table>
        <tr><th colspan="13"><b>Positions</b></th></tr>
        <tr>
          <th>Time</th><th>Position</th><th>Symbol</th><th>Type</th><th>Volume</th>
          <th>Price</th><th>S / L</th><th>T / P</th><th>Time</th><th>Price</th>
          <th>Commission</th><th>Swap</th><th>Profit</th>
        </tr>
        <tr>
          <td>2026.11.19 09:05:12</td><td>51200991</td><td>GBPUSD</td><td>sell</td><td>1.00</td>
          <td>1.29500</td><td>1.29800</td><td>1.28500</td><td>2026.11.19 15:20:00</td><td>1.28500</td>
          <td>-7.00</td><td>-1.50</td><td>1 000.00</td>
          <td class="hidden" colspan="8"></td>
        </tr>
        <tr><th colspan="12"><b>Orders</b></th></tr>
        <tr>
          <td>2026.11.19 16:00:00</td><td>51201000</td><td>EURUSD</td><td>buy limit</td><td>0.50</td>
          <td>1.07000</td><td>1.06800</td><td>1.07500</td><td>2026.11.19 18:00:00</td><td>0.00000</td>
          <td>0</td><td>0</td><td>0</td>
        </tr>
      </table>
      </body></html>
    `;

    const utf16Body = Buffer.from(mt5Html, 'utf16le');
    const bom = Buffer.from([0xff, 0xfe]);
    const fullBuffer = Buffer.concat([bom, utf16Body]);

    const decoded = decodeFileBuffer(fullBuffer);
    const res = parseHtmlReport(decoded, 1);

    expect(res.detectedFormat).toBe('MT5 HTML Report');
    expect(res.accountMeta.accountNumber).toBe('315077956');
    expect(res.trades).toHaveLength(1);
    expect(res.trades[0].pair).toBe('GBPUSD');
    expect(res.trades[0].position).toBe('Sell');
    expect(res.trades[0].brokerPnl).toBe(1000);
    expect(res.trades[0].commission).toBe(-7);
    expect(res.trades[0].swap).toBe(-1.5);
  });

  it('parses TCM Excel & C5_TradeLog Excel workbooks cleanly', () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        'Date',
        'Time',
        'Instrument',
        'Direction',
        'Entry',
        'Exit',
        'Lot Size',
        'Risk $',
        'P&L $',
        'Strategy Used',
        'Session',
        'Notes',
      ],
      [
        '2026-08-04',
        '16:00:05',
        'AUDUSD',
        'Long',
        0.6512,
        0.6542,
        0.2,
        25,
        60,
        'H1 50/50 Bounce',
        'NY',
        'Good execution',
      ],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, 'Trade Log');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const res = parseSpreadsheetBuffer(buf, 'C5_TradeLog_TCM-T-003.xlsx', 1);
    expect(res.trades).toHaveLength(1);
    expect(res.trades[0].pair).toBe('AUDUSD');
    expect(res.trades[0].position).toBe('Buy');
    expect(res.trades[0].entryDatetime).toBe('2026-08-04 16:00:05');
    expect(res.trades[0].session).toBe('New York');
    expect(res.trades[0].setup).toBe('H1 5050 Bounce');
    expect(res.trades[0].brokerPnl).toBe(60);
  });

  it('parses pasted headerless MT5 TSV rows directly', () => {
    const tsv = `2026.11.20 08:15:00\t99001122\tEURUSD\tbuy\t0.50\t1.08420\t1.08320\t1.08670\t2026.11.20 11:40:00\t1.08670\t0.00\t0.00\t125.00`;
    const res = parsePastedOrTextReport(tsv, 'paste.txt', 1);
    expect(res.trades).toHaveLength(1);
    expect(res.trades[0].brokerTicket).toBe('99001122');
    expect(res.trades[0].pair).toBe('EURUSD');
    expect(res.trades[0].brokerPnl).toBe(125);
  });
});

describe('Smart Deduplication & Re-Upload Engine', () => {
  it('detects duplicates by ticket/fingerprint, updates open-to-closed trades, and adds only new ones', () => {
    const existingClosed = makeExistingTrade({
      id: 'tr-closed',
      sn: 1,
      brokerTicket: '84920145',
    });

    const existingOpen = makeExistingTrade({
      id: 'tr-open',
      sn: 2,
      brokerTicket: '84920999',
      pair: 'USDJPY',
      position: 'Sell',
      entryDate: '2026-11-23',
      entryTime: '09:00:00',
      entryDatetime: '2026-11-23 09:00:00',
      lots: 0.4,
      entryPrice: 154.5,
      stopLoss: 154.7,
      takeProfit: 154.0,
      exitPrice: null,
      exitDate: null,
      exitTime: null,
      exitDatetime: null,
      brokerPnl: null,
      fingerprint: 'USDJPY|Sell|2026-11-23 09:00:00|154.500|0.40',
    });

    const reportHtml = `
      <html><body><table>
        <tr><th colspan="13"><b>Positions</b></th></tr>
        <tr>
          <th>Time</th><th>Position</th><th>Symbol</th><th>Type</th><th>Volume</th>
          <th>Price</th><th>S / L</th><th>T / P</th><th>Time</th><th>Price</th>
          <th>Commission</th><th>Swap</th><th>Profit</th>
        </tr>
        <tr>
          <td>2026.11.18 08:15:00</td><td>84920145</td><td>EURUSD</td><td>buy</td><td>0.50</td>
          <td>1.08420</td><td>1.08320</td><td>1.08670</td><td>2026.11.18 11:40:00</td><td>1.08670</td>
          <td>0</td><td>0</td><td>125.00</td>
        </tr>
        <tr>
          <td>2026.11.23 09:00:00</td><td>84920999</td><td>USDJPY</td><td>sell</td><td>0.40</td>
          <td>154.500</td><td>154.700</td><td>154.000</td><td>2026.11.24 10:15:00</td><td>154.000</td>
          <td>0</td><td>0</td><td>129.87</td>
        </tr>
        <tr>
          <td>2026.11.24 11:00:00</td><td>84921005</td><td>XAUUSD</td><td>buy</td><td>0.10</td>
          <td>2640.00</td><td>2630.00</td><td>2665.00</td><td>2026.11.24 13:30:00</td><td>2665.00</td>
          <td>-1.00</td><td>0</td><td>250.00</td>
        </tr>
      </table></body></html>
    `;

    const parsed = parseHtmlReport(reportHtml, 1);
    const classified = classifyImportedTrades(
      parsed.trades,
      [existingClosed, existingOpen],
      { setup: 'H1 5050 Bounce', timeframe: 'H1' }
    );

    expect(classified).toHaveLength(3);
    expect(classified[0].action).toBe('SKIP_DUPLICATE');
    expect(classified[1].action).toBe('UPDATE_CLOSE');
    expect(classified[1].matchedTradeId).toBe('tr-open');
    expect(classified[2].action).toBe('NEW');
  });
});

describe('Trading Math, QC Flags & PIN Security', () => {
  it('computes net P&L, equity curve, profit factor, DLL %, and QC alerts accurately', () => {
    const winTrade = makeExistingTrade({
      id: 't1',
      sn: 1,
      brokerPnl: 120,
      commission: -5,
      swap: 0,
      riskAmount: 50,
    });
    const lossNoSl = makeExistingTrade({
      id: 't2',
      sn: 2,
      entryDate: '2026-11-24',
      entryDatetime: '2026-11-24 10:00:00',
      exitDate: '2026-11-24',
      exitDatetime: '2026-11-24 11:00:00',
      stopLoss: null,
      brokerPnl: -300,
      commission: 0,
      swap: 0,
      riskAmount: 50,
    });

    const { computedTrades, metrics } = computeJournalMetrics([winTrade, lossNoSl], {
      initialCapital: 5000,
      defaultRiskPct: 1,
      breakevenThreshold: 1,
      dailyLossLimitPct: 5,
      timezoneOffsetHours: 1,
    });

    expect(computedTrades[0].netPnl).toBe(115);
    expect(computedTrades[1].netPnl).toBe(-300);
    expect(computedTrades[1].flags.some((f) => f.message.includes('No Stop Loss'))).toBe(true);

    expect(metrics.currentEquity).toBe(4815);
    expect(metrics.totalNetPnl).toBe(-185);
    expect(metrics.winRate).toBe(50);
    expect(metrics.profitFactor).toBeCloseTo(115 / 300, 3);
    expect(metrics.todayPnl).toBe(-300);
    // Start-of-day balance before today was 5000 + 115 = 5115; 300 / 5115 = 5.865%
    expect(metrics.todayLossPct).toBeCloseTo((300 / 5115) * 100, 2);
    expect(metrics.dllBreachedToday).toBe(true);
  });

  it('persists desks & trades in local DB and deduplicates end-to-end across re-imports', async () => {
    const {
      createUserRecord,
      createTradeRecord,
      listTradesByUser,
      deleteUserRecord,
    } = await import('@/lib/db');

    const testTraderId = `TCM-TEST-${Date.now()}`;
    const user = await createUserRecord({
      traderId: testTraderId,
      name: 'Integration Test Trader',
      role: 'trader',
      pinHash: hashPin('secret99'),
      initialCapital: 5000,
    });

    try {
      await createTradeRecord(user.id, {
        pair: 'EURUSD',
        position: 'Buy',
        setup: 'H1 5050 Bounce',
        entryDate: '2026-11-20',
        entryTime: '08:15:00',
        lots: 0.5,
        entryPrice: 1.0842,
        stopLoss: 1.0832,
        takeProfit: 1.0867,
        exitPrice: 1.0867,
        exitDate: '2026-11-20',
        exitTime: '11:40:00',
        brokerPnl: 125,
        brokerTicket: '99001122',
        source: 'html_import',
      });

      const existing = await listTradesByUser(user.id);
      expect(existing).toHaveLength(1);

      const pasted = `
2026.11.20 08:15:00\t99001122\tEURUSD\tbuy\t0.50\t1.08420\t1.08320\t1.08670\t2026.11.20 11:40:00\t1.08670\t0.00\t0.00\t125.00
2026.11.21 14:05:00\t99001188\tXAUUSD\tsell\t0.10\t2650.00\t2660.00\t2625.00\t2026.11.21 16:30:00\t2625.00\t-1.00\t0.00\t250.00
      `;
      const parsed = parsePastedOrTextReport(pasted, 'paste.txt', 1);
      const classified = classifyImportedTrades(parsed.trades, existing, {
        setup: 'H1 5050 Bounce',
        timeframe: 'H1',
      });

      expect(classified[0].action).toBe('SKIP_DUPLICATE');
      expect(classified[1].action).toBe('NEW');
      expect(classified[1].candidate.pair).toBe('XAUUSD');
    } finally {
      await deleteUserRecord(user.id);
    }
  });

  it('hashes and verifies PINs securely', () => {
    const hash = hashPin('titan2026');
    expect(verifyPin('titan2026', hash)).toBe(true);
    expect(verifyPin('wrongpin', hash)).toBe(false);
  });
});
