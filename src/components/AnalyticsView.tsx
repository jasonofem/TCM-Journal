'use client';

import React, { useMemo } from 'react';
import { computeJournalMetrics } from '@/lib/trading-math';
import { BreakdownRow, ComputedTrade, TradeRecord, UserProfile } from '@/lib/types';
import { formatMoney } from '@/lib/format';

function BreakdownTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: BreakdownRow[];
  currency: string;
}) {
  return (
    <div className="bg-[#101218] border border-[#222634] rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#1e222f] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-[11px] font-mono-num text-[#7f8698]">{rows.length} groups</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#6f7687]">No closed trades yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#0b0d12] text-[#848b9c] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Segment</th>
                <th className="px-4 py-2.5 text-right">Trades</th>
                <th className="px-4 py-2.5 text-right">W / L / BE</th>
                <th className="px-4 py-2.5 text-right">Win %</th>
                <th className="px-4 py-2.5 text-right">PF</th>
                <th className="px-4 py-2.5 text-right">Avg P&L</th>
                <th className="px-4 py-2.5 text-right">Net P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1e29]">
              {rows.map((r) => (
                <tr key={r.label} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-medium text-white">{r.label}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num text-[#cbd0dc]">{r.trades}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num text-[#9398a6]">
                    <span className="text-emerald-400">{r.wins}</span> /{' '}
                    <span className="text-rose-400">{r.losses}</span> /{' '}
                    <span className="text-[#c8a55b]">{r.be}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-num text-[#cbd0dc]">
                    {r.winRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-num text-[#c8a55b]">
                    {r.profitFactor === null ? '∞' : r.profitFactor.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-num text-[#cbd0dc]">
                    {formatMoney(r.avgPnl, currency, true)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono-num font-semibold ${
                      r.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatMoney(r.netPnl, currency, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function buildGroupRows(
  closed: ComputedTrade[],
  keyFn: (t: ComputedTrade) => string
): BreakdownRow[] {
  const map = new Map<string, ComputedTrade[]>();
  closed.forEach((t) => {
    const k = keyFn(t);
    const arr = map.get(k) || [];
    arr.push(t);
    map.set(k, arr);
  });
  return Array.from(map.entries())
    .map(([label, list]) => {
      const wins = list.filter((t) => t.outcome === 'Win').length;
      const losses = list.filter((t) => t.outcome === 'Loss').length;
      const be = list.filter((t) => t.outcome === 'BE').length;
      const netPnl = list.reduce((s, t) => s + (t.netPnl ?? 0), 0);
      const gp = list.filter((t) => (t.netPnl ?? 0) > 0).reduce((s, t) => s + (t.netPnl ?? 0), 0);
      const gl = Math.abs(
        list.filter((t) => (t.netPnl ?? 0) < 0).reduce((s, t) => s + (t.netPnl ?? 0), 0)
      );
      return {
        label,
        trades: list.length,
        wins,
        losses,
        be,
        winRate: list.length > 0 ? (wins / list.length) * 100 : 0,
        netPnl,
        avgPnl: list.length > 0 ? netPnl / list.length : 0,
        profitFactor: gl > 0 ? gp / gl : gp > 0 ? null : 0,
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);
}

export default function AnalyticsView({
  user,
  rawTrades,
}: {
  user: UserProfile;
  rawTrades: TradeRecord[];
}) {
  const { computedTrades, metrics } = useMemo(
    () =>
      computeJournalMetrics(rawTrades, {
        initialCapital: user.initialCapital,
        defaultRiskPct: user.defaultRiskPct,
        breakevenThreshold: user.breakevenThreshold,
        dailyLossLimitPct: user.dailyLossLimitPct,
        timezoneOffsetHours: user.timezoneOffsetHours,
      }),
    [rawTrades, user]
  );

  const closedTrades = useMemo(
    () => computedTrades.filter((t) => t.outcome !== 'Open'),
    [computedTrades]
  );

  const bySide = useMemo(
    () => buildGroupRows(closedTrades, (t) => t.position),
    [closedTrades]
  );

  const byExitReason = useMemo(
    () => buildGroupRows(closedTrades, (t) => t.exitReason || 'Not tagged'),
    [closedTrades]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BreakdownTable title="Performance by Currency Pair" rows={metrics.byPair} currency={user.currency} />
        <BreakdownTable title="Performance by Setup / Strategy" rows={metrics.bySetup} currency={user.currency} />
        <BreakdownTable title="Performance by Trading Session" rows={metrics.bySession} currency={user.currency} />
        <BreakdownTable title="Performance by Day of Week" rows={metrics.byWeekday} currency={user.currency} />
        <BreakdownTable title="Direction Bias (Long vs Short)" rows={bySide} currency={user.currency} />
        <BreakdownTable title="Exit Reason Audit" rows={byExitReason} currency={user.currency} />
      </div>
    </div>
  );
}
