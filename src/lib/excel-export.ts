import * as XLSX from 'xlsx';
import { ComputedTrade, DashboardMetrics, UserProfile } from './types';

export function buildTraderWorkbookBuffer(
  user: UserProfile,
  trades: ComputedTrade[],
  metrics: DashboardMetrics
): Buffer {
  const wb = XLSX.utils.book_new();

  // 00_Summary
  const summaryRows = [
    ['TITAN CAPITAL MARKETS — PERFORMANCE SUMMARY'],
    ['Trader Name', user.name],
    ['Trader ID', user.traderId],
    ['Account Number', user.accountNumber || '—'],
    ['Account Name', user.accountName],
    ['Currency', user.currency],
    ['Initial Capital', user.initialCapital],
    ['Current Equity', Number(metrics.currentEquity.toFixed(2))],
    ['Total Net PnL', Number(metrics.totalNetPnl.toFixed(2))],
    ['ROI %', `${metrics.roiPct.toFixed(2)}%`],
    ['Closed Trades', metrics.closedCount],
    ['Open Trades', metrics.openCount],
    ['Wins', metrics.wins],
    ['Losses', metrics.losses],
    ['Breakeven', metrics.breakeven],
    ['Win Rate', metrics.winRate !== null ? `${metrics.winRate.toFixed(2)}%` : '—'],
    [
      'Profit Factor',
      metrics.profitFactorInfinite
        ? '∞'
        : metrics.profitFactor !== null
          ? metrics.profitFactor.toFixed(2)
          : '—',
    ],
    ['Average Win', metrics.averageWin !== null ? Number(metrics.averageWin.toFixed(2)) : '—'],
    ['Average Loss', metrics.averageLoss !== null ? Number(metrics.averageLoss.toFixed(2)) : '—'],
    ['Largest Win', metrics.largestWin !== null ? Number(metrics.largestWin.toFixed(2)) : '—'],
    ['Largest Loss', metrics.largestLoss !== null ? Number(metrics.largestLoss.toFixed(2)) : '—'],
    ['Max Drawdown', Number(metrics.maxDrawdown.toFixed(2))],
    ['Max Drawdown %', `${metrics.maxDrawdownPct.toFixed(2)}%`],
    ['Generated At', new Date().toISOString()],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, '00_Summary');

  // 01_Settings
  const settingsRows = [
    ['Field', 'Value'],
    ['Trader Name', user.name],
    ['Trader ID', user.traderId],
    ['Role', user.role],
    ['Tier', user.tier],
    ['Initial Capital', user.initialCapital],
    ['Account Currency', user.currency],
    ['Default Risk %', user.defaultRiskPct],
    ['Breakeven Threshold', user.breakevenThreshold],
    ['Daily Loss Limit %', user.dailyLossLimitPct],
    ['Timezone Offset (UTC+)', user.timezoneOffsetHours],
  ];
  const wsSettings = XLSX.utils.aoa_to_sheet(settingsRows);
  XLSX.utils.book_append_sheet(wb, wsSettings, '01_Settings');

  // 02_Trade_Data (aligned with TCM TradeJournal_*.xlsx structure!)
  const tradeHeaders = [
    'S/N',
    'Entry Time & Date',
    'Day of Week',
    'Pair',
    'Position',
    'Session',
    'Lot',
    'Risk Per Trade',
    'Entry Price',
    'Stop Loss',
    'Take Profit',
    'Planned RR',
    'Exit Price',
    'Exit Time & Date',
    'Duration',
    'Pips',
    'Actual RR',
    'Commission',
    'Swap',
    'Net Profit/Loss',
    'Outcome',
    'Account Balance',
    'Setup',
    'Timeframe',
    'Exit Reason',
    'Followed Plan',
    'Broker Ticket',
    'Mistakes',
    'Notes',
  ];

  const tradeRows = trades.map((t) => [
    t.sn,
    t.entryDatetime,
    t.dayOfWeek,
    t.pair,
    t.position === 'Buy' ? 'Long' : 'Short',
    t.session,
    t.lots,
    t.computedRiskAmount !== null ? Number(t.computedRiskAmount.toFixed(2)) : '',
    t.entryPrice,
    t.stopLoss ?? '',
    t.takeProfit ?? '',
    t.plannedRr !== null ? Number(t.plannedRr.toFixed(2)) : '',
    t.exitPrice ?? '',
    t.exitDatetime ?? '',
    t.durationLabel,
    t.resultPips !== null ? Number(t.resultPips.toFixed(1)) : '',
    t.realizedRr !== null ? Number(t.realizedRr.toFixed(2)) : '',
    t.commission,
    t.swap,
    t.netPnl !== null ? Number(t.netPnl.toFixed(2)) : '',
    t.outcome,
    t.balanceAfter !== null ? Number(t.balanceAfter.toFixed(2)) : '',
    t.effectiveSetup,
    t.timeframe ?? '',
    t.exitReason ?? '',
    t.followedPlan ?? '',
    t.brokerTicket ?? '',
    t.mistakes ?? '',
    t.notes ?? '',
  ]);

  const wsTrades = XLSX.utils.aoa_to_sheet([tradeHeaders, ...tradeRows]);
  XLSX.utils.book_append_sheet(wb, wsTrades, '02_Trade_Data');

  // 03_Breakdowns
  const breakdownRows: unknown[][] = [['BY PAIR'], ['Pair', 'Trades', 'Wins', 'Losses', 'BE', 'Win Rate %', 'Net PnL']];
  metrics.byPair.forEach((r) =>
    breakdownRows.push([r.label, r.trades, r.wins, r.losses, r.be, Number(r.winRate.toFixed(1)), Number(r.netPnl.toFixed(2))])
  );
  breakdownRows.push([], ['BY SESSION'], ['Session', 'Trades', 'Wins', 'Losses', 'BE', 'Win Rate %', 'Net PnL']);
  metrics.bySession.forEach((r) =>
    breakdownRows.push([r.label, r.trades, r.wins, r.losses, r.be, Number(r.winRate.toFixed(1)), Number(r.netPnl.toFixed(2))])
  );
  breakdownRows.push([], ['BY SETUP'], ['Setup', 'Trades', 'Wins', 'Losses', 'BE', 'Win Rate %', 'Net PnL']);
  metrics.bySetup.forEach((r) =>
    breakdownRows.push([r.label, r.trades, r.wins, r.losses, r.be, Number(r.winRate.toFixed(1)), Number(r.netPnl.toFixed(2))])
  );

  const wsBreak = XLSX.utils.aoa_to_sheet(breakdownRows);
  XLSX.utils.book_append_sheet(wb, wsBreak, '03_Breakdowns');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
