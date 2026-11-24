'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  FileUp,
  Flame,
  RotateCcw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  DAYS_OF_WEEK,
  SETUPS,
  TRADING_SESSIONS,
  computeJournalMetrics,
  formatDurationMinutes,
} from '@/lib/trading-math';
import { ComputedTrade, TradeRecord, UserProfile } from '@/lib/types';
import { formatMoney, formatPct, formatR } from '@/lib/format';
import {
  DailyPnlChart,
  EquityCurveChart,
  HorizontalBreakdownBars,
  OutcomeDonut,
} from './Charts';

interface DashboardViewProps {
  user: UserProfile;
  rawTrades: TradeRecord[];
  onGoToImport: () => void;
  onSelectTrade: (trade: ComputedTrade) => void;
}

export default function DashboardView({
  user,
  rawTrades,
  onGoToImport,
  onSelectTrade,
}: DashboardViewProps) {
  const [pairFilter, setPairFilter] = useState('ALL');
  const [dayFilter, setDayFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');
  const [setupFilter, setSetupFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const availablePairs = useMemo(() => {
    const s = new Set(rawTrades.map((t) => t.pair));
    return Array.from(s).sort();
  }, [rawTrades]);

  const filteredRaw = useMemo(() => {
    return rawTrades.filter((t) => {
      if (pairFilter !== 'ALL' && t.pair !== pairFilter) return false;
      if (dayFilter !== 'ALL' && t.dayOfWeek !== dayFilter) return false;
      if (sessionFilter !== 'ALL' && t.session !== sessionFilter) return false;
      if (setupFilter !== 'ALL' && t.setup !== setupFilter && t.customSetup !== setupFilter) {
        return false;
      }
      if (dateFrom && t.entryDate < dateFrom) return false;
      if (dateTo && t.entryDate > dateTo) return false;
      return true;
    });
  }, [rawTrades, pairFilter, dayFilter, sessionFilter, setupFilter, dateFrom, dateTo]);

  const { computedTrades, metrics, insightSummary } = useMemo(
    () =>
      computeJournalMetrics(filteredRaw, {
        initialCapital: user.initialCapital,
        defaultRiskPct: user.defaultRiskPct,
        breakevenThreshold: user.breakevenThreshold,
        dailyLossLimitPct: user.dailyLossLimitPct,
        timezoneOffsetHours: user.timezoneOffsetHours,
      }),
    [filteredRaw, user]
  );

  const extraStats = useMemo(() => {
    const closed = computedTrades
      .filter((t) => t.outcome !== 'Open')
      .sort((a, b) =>
        (a.exitDatetime || a.entryDatetime).localeCompare(b.exitDatetime || b.entryDatetime)
      );
    const rs = closed.map((t) => t.realizedRr).filter((v): v is number => v !== null);
    const avgR = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    const durs = closed.map((t) => t.durationMinutes).filter((v): v is number => v !== null);
    const avgDurationMinutes =
      durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : null;

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let curW = 0;
    let curL = 0;
    for (const t of closed) {
      if (t.outcome === 'Win') {
        curW++;
        curL = 0;
        if (curW > maxWinStreak) maxWinStreak = curW;
      } else if (t.outcome === 'Loss') {
        curL++;
        curW = 0;
        if (curL > maxLossStreak) maxLossStreak = curL;
      }
    }
    const lastDecided = [...closed].reverse().find((t) => t.outcome === 'Win' || t.outcome === 'Loss');
    let curCount = 0;
    if (lastDecided) {
      for (let i = closed.length - 1; i >= 0; i--) {
        if (closed[i].outcome === 'BE') continue;
        if (closed[i].outcome === lastDecided.outcome) curCount++;
        else break;
      }
    }

    const dailyMap = new Map<string, { pnl: number; count: number }>();
    for (const t of closed) {
      const d = t.exitDate || t.entryDate;
      const prev = dailyMap.get(d) || { pnl: 0, count: 0 };
      dailyMap.set(d, { pnl: prev.pnl + (t.netPnl || 0), count: prev.count + 1 });
    }
    const dailyPnl = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, info]) => ({ date, pnl: info.pnl, count: info.count }));

    const peakEquity = Math.max(
      user.initialCapital,
      ...metrics.equityCurve.map((p) => p.equity)
    );

    return {
      avgR,
      avgDurationMinutes,
      maxWinStreak,
      maxLossStreak,
      currentStreak: {
        type: lastDecided?.outcome === 'Loss' ? 'Loss' : 'Win',
        count: curCount,
      },
      dailyPnl,
      peakEquity,
    };
  }, [computedTrades, metrics.equityCurve, user.initialCapital]);

  const hasFilters =
    pairFilter !== 'ALL' ||
    dayFilter !== 'ALL' ||
    sessionFilter !== 'ALL' ||
    setupFilter !== 'ALL' ||
    dateFrom !== '' ||
    dateTo !== '';

  function resetFilters() {
    setPairFilter('ALL');
    setDayFilter('ALL');
    setSessionFilter('ALL');
    setSetupFilter('ALL');
    setDateFrom('');
    setDateTo('');
  }

  const recentTrades = useMemo(
    () => [...computedTrades].sort((a, b) => b.entryDatetime.localeCompare(a.entryDatetime)).slice(0, 8),
    [computedTrades]
  );

  const qcWarningsCount = computedTrades.reduce((acc, t) => acc + t.flags.length, 0);

  return (
    <div className="space-y-6">
      {rawTrades.length === 0 && (
        <div className="tcm-kpi-card rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#c8a55b] font-semibold mb-1.5">
              Zero-Effort Onboarding
            </div>
            <h2 className="font-serif-display text-2xl sm:text-3xl text-white">
              Drop or paste your broker statement to populate your journal automatically.
            </h2>
            <p className="text-sm text-[#9398a6] mt-1.5 max-w-2xl">
              Upload any MT4 HTML Statement, MT5 Trade History HTML/Excel, TCM XLSX workbook, or
              paste copied history rows. Only new trades are added; duplicates are skipped cleanly.
            </p>
          </div>
          <button
            onClick={onGoToImport}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#c8a55b] hover:bg-[#d8b76e] text-[#090a0f] font-semibold text-sm shadow-[0_8px_24px_rgba(200,165,91,0.22)] transition-all"
          >
            <FileUp className="w-4 h-4" />
            Import HTML / Excel Report
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-[#101218] border border-[#222634] rounded-xl p-3 flex flex-wrap items-center gap-2.5">
        <select
          value={pairFilter}
          onChange={(e) => setPairFilter(e.target.value)}
          className="bg-[#090b10] border border-[#262b38] rounded-lg px-3 py-1.5 text-xs text-[#e5e2da] focus:border-[#c8a55b] focus:outline-none"
        >
          <option value="ALL">All Pairs ({availablePairs.length})</option>
          {availablePairs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={dayFilter}
          onChange={(e) => setDayFilter(e.target.value)}
          className="bg-[#090b10] border border-[#262b38] rounded-lg px-3 py-1.5 text-xs text-[#e5e2da] focus:border-[#c8a55b] focus:outline-none"
        >
          <option value="ALL">All Days</option>
          {DAYS_OF_WEEK.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
          className="bg-[#090b10] border border-[#262b38] rounded-lg px-3 py-1.5 text-xs text-[#e5e2da] focus:border-[#c8a55b] focus:outline-none"
        >
          <option value="ALL">All Sessions</option>
          {TRADING_SESSIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={setupFilter}
          onChange={(e) => setSetupFilter(e.target.value)}
          className="bg-[#090b10] border border-[#262b38] rounded-lg px-3 py-1.5 text-xs text-[#e5e2da] focus:border-[#c8a55b] focus:outline-none"
        >
          <option value="ALL">All Setups</option>
          {SETUPS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs text-[#8d94a5]">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-[#090b10] border border-[#262b38] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-[#e5e2da] focus:border-[#c8a55b] focus:outline-none"
          />
          <span>→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-[#090b10] border border-[#262b38] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-[#e5e2da] focus:border-[#c8a55b] focus:outline-none"
          />
        </div>

        {hasFilters && (
          <button
            onClick={resetFilters}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#c8a55b] hover:bg-[#c8a55b]/10 border border-[#c8a55b]/30"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#8d94a5]">
            <span>Account Equity</span>
            {metrics.totalNetPnl >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-white">
            {formatMoney(metrics.currentEquity, user.currency)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs font-mono-num">
            <span className={metrics.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {formatMoney(metrics.totalNetPnl, user.currency, true)}
            </span>
            <span className="text-[#9398a6]">{formatPct(metrics.roiPct, true)} ROI</span>
          </div>
        </div>

        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#8d94a5]">
            <span>Win Rate & Record</span>
            <Award className="w-4 h-4 text-[#c8a55b]" />
          </div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-white">
            {metrics.winRate !== null ? `${metrics.winRate.toFixed(1)}%` : '—'}
          </div>
          <div className="mt-1 text-xs font-mono-num text-[#9398a6]">
            <span className="text-emerald-400">{metrics.wins}W</span> ·{' '}
            <span className="text-rose-400">{metrics.losses}L</span> ·{' '}
            <span className="text-[#c8a55b]">{metrics.breakeven}BE</span>{' '}
            <span className="text-[#697082]">({metrics.closedCount} closed)</span>
          </div>
        </div>

        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#8d94a5]">
            <span>Profit Factor & Avg R</span>
            <Activity className="w-4 h-4 text-[#c8a55b]" />
          </div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-white">
            {metrics.profitFactorInfinite
              ? '∞'
              : metrics.profitFactor !== null
                ? metrics.profitFactor.toFixed(2)
                : '—'}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs font-mono-num text-[#9398a6]">
            <span>Avg R: {formatR(extraStats.avgR)}</span>
            <span>Exp: {formatMoney(metrics.expectancy, user.currency, true)}</span>
          </div>
        </div>

        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#8d94a5]">
            <span>Max Drawdown & DLL</span>
            <ShieldAlert
              className={`w-4 h-4 ${
                metrics.dllBreachedToday ? 'text-rose-400' : 'text-[#c8a55b]'
              }`}
            />
          </div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-rose-300">
            -{metrics.maxDrawdownPct.toFixed(2)}%
          </div>
          <div className="mt-1 flex items-center justify-between text-xs font-mono-num text-[#9398a6]">
            <span>-{formatMoney(metrics.maxDrawdown, user.currency)}</span>
            <span className={metrics.dllBreachedToday ? 'text-rose-400 font-semibold' : ''}>
              Today DD: {metrics.todayLossPct.toFixed(2)}% / {user.dailyLossLimitPct}%
            </span>
          </div>
        </div>
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#101218] border border-[#222634] rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#7f8698]">Avg Win / Loss</div>
          <div className="mt-1 text-sm font-mono-num">
            <span className="text-emerald-400">{formatMoney(metrics.averageWin, user.currency)}</span>
            <span className="text-[#5d6475] mx-1.5">/</span>
            <span className="text-rose-400">{formatMoney(metrics.averageLoss, user.currency)}</span>
          </div>
        </div>

        <div className="bg-[#101218] border border-[#222634] rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#7f8698]">
            Current Streak
          </div>
          <div className="mt-1 text-sm font-mono-num flex items-center gap-1.5 text-white">
            <Flame className="w-3.5 h-3.5 text-[#c8a55b]" />
            {extraStats.currentStreak.count > 0
              ? `${extraStats.currentStreak.count} ${extraStats.currentStreak.type}${extraStats.currentStreak.count > 1 ? 's' : ''}`
              : '—'}
            <span className="text-[11px] text-[#737a8c] ml-auto">
              Max {extraStats.maxWinStreak}W / {extraStats.maxLossStreak}L
            </span>
          </div>
        </div>

        <div className="bg-[#101218] border border-[#222634] rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#7f8698]">
            Open Positions
          </div>
          <div className="mt-1 text-sm font-mono-num text-[#e6c77f]">
            {metrics.openCount} active
          </div>
        </div>

        <div className="bg-[#101218] border border-[#222634] rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#7f8698]">
            Avg Hold & Plan
          </div>
          <div className="mt-1 text-sm font-mono-num text-white flex items-center justify-between">
            <span>{formatDurationMinutes(extraStats.avgDurationMinutes)}</span>
            <span className="text-[11px] text-[#9398a6]">
              {metrics.planAdherencePct !== null
                ? `${metrics.planAdherencePct.toFixed(0)}% plan`
                : `${qcWarningsCount} QC flags`}
            </span>
          </div>
        </div>
      </div>

      {/* Insight Strip */}
      <div className="bg-gradient-to-r from-[#141720] to-[#0f1117] border border-[#c8a55b]/25 rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-[#ddd8cc]">
        <AlertTriangle className="w-4 h-4 text-[#c8a55b] shrink-0" />
        <span>{insightSummary}</span>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-[#101218] border border-[#222634] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Equity Curve</h3>
              <p className="text-[11px] text-[#838a9c]">
                Cumulative balance across closed executions (starting{' '}
                {formatMoney(user.initialCapital, user.currency)})
              </p>
            </div>
            <span className="font-mono-num text-xs text-[#c8a55b]">
              Peak: {formatMoney(extraStats.peakEquity, user.currency)}
            </span>
          </div>
          <EquityCurveChart
            points={metrics.equityCurve}
            initialCapital={user.initialCapital}
            currency={user.currency}
          />
        </div>

        <div className="bg-[#101218] border border-[#222634] rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Outcome Distribution</h3>
            <p className="text-[11px] text-[#838a9c] mb-4">
              Breakeven band ±{formatMoney(user.breakevenThreshold, user.currency)}
            </p>
            <OutcomeDonut wins={metrics.wins} losses={metrics.losses} be={metrics.breakeven} />
          </div>
          <div className="mt-5 pt-4 border-t border-[#1e222f] grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[#7e8597] text-[10px] uppercase">Largest Win</div>
              <div className="font-mono-num text-emerald-400 font-semibold mt-0.5">
                {formatMoney(metrics.largestWin, user.currency, true)}
              </div>
            </div>
            <div>
              <div className="text-[#7e8597] text-[10px] uppercase">Largest Loss</div>
              <div className="font-mono-num text-rose-400 font-semibold mt-0.5">
                {formatMoney(metrics.largestLoss, user.currency)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-[#101218] border border-[#222634] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Daily Net P&L</h3>
          <p className="text-[11px] text-[#838a9c] mb-3">Realized outcome by closing date</p>
          <DailyPnlChart days={extraStats.dailyPnl} currency={user.currency} />
        </div>

        <div className="bg-[#101218] border border-[#222634] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Performance by Pair</h3>
          <p className="text-[11px] text-[#838a9c] mb-4">Top instruments by net P&L</p>
          <HorizontalBreakdownBars rows={metrics.byPair} currency={user.currency} />
        </div>

        <div className="bg-[#101218] border border-[#222634] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Performance by Session</h3>
          <p className="text-[11px] text-[#838a9c] mb-4">Asian · Tokyo · London · New York</p>
          <HorizontalBreakdownBars rows={metrics.bySession} currency={user.currency} />
        </div>
      </div>

      {/* Recent Trades Quick Feed */}
      <div className="bg-[#101218] border border-[#222634] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e222f] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Executions</h3>
          <span className="text-[11px] text-[#838a9c] font-mono-num">
            Click any row to inspect & review
          </span>
        </div>
        {recentTrades.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#6f7687]">
            No trades recorded matching current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#0b0d12] text-[#848b9c] uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Entry</th>
                  <th className="px-4 py-2.5">Pair</th>
                  <th className="px-4 py-2.5">Side</th>
                  <th className="px-4 py-2.5">Session</th>
                  <th className="px-4 py-2.5">Setup</th>
                  <th className="px-4 py-2.5 text-right">Lots</th>
                  <th className="px-4 py-2.5 text-right">R</th>
                  <th className="px-4 py-2.5 text-right">Net P&L</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1e29]">
                {recentTrades.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelectTrade(t)}
                    className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono-num text-[#7f8698]">{t.sn}</td>
                    <td className="px-4 py-2.5 font-mono-num text-[#cbd0dc] whitespace-nowrap">
                      {t.entryDate} <span className="text-[#6d7486]">{t.entryTime.slice(0, 5)}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono-num font-semibold text-white">{t.pair}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          t.position === 'Buy'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {t.position.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#b5bac7]">{t.session}</td>
                    <td className="px-4 py-2.5 text-[#b5bac7]">{t.effectiveSetup}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#cbd0dc]">
                      {t.lots.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#c8a55b]">
                      {formatR(t.realizedRr)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono-num font-semibold ${
                        t.netPnl === null
                          ? 'text-[#7f8698]'
                          : t.netPnl >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {formatMoney(t.netPnl, user.currency, true)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          t.outcome === 'Win'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : t.outcome === 'Loss'
                              ? 'bg-rose-500/15 text-rose-300'
                              : t.outcome === 'BE'
                                ? 'bg-[#c8a55b]/20 text-[#e4c277]'
                                : 'bg-sky-500/15 text-sky-300'
                        }`}
                      >
                        {t.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
