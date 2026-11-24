'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Crown,
  Dices,
  Eye,
  FileUp,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  ComputedTrade,
  FirmOverviewResponse,
  FirmTraderSummary,
} from '@/lib/types';
import { formatMoney, formatR, formatRelativeTime } from '@/lib/format';
import { FirmEquityCurveChart } from '@/components/Charts';

interface AdminCommandViewProps {
  overview: FirmOverviewResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onInspectTrader: (
    user: FirmTraderSummary['user'],
    goToTab?: 'dashboard' | 'import' | 'trades'
  ) => void;
  onSelectFirmTrade: (
    trade: ComputedTrade,
    ownerUser: FirmTraderSummary['user']
  ) => void;
}

export default function AdminCommandView({
  overview,
  loading,
  onRefresh,
  onInspectTrader,
  onSelectFirmTrade,
}: AdminCommandViewProps) {
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueMode, setIssueMode] = useState<'single' | 'bulk'>('single');
  const [resetTarget, setResetTarget] = useState<FirmTraderSummary | null>(null);
  const [newPin, setNewPin] = useState('');
  const [resetResult, setResetResult] = useState<{ traderId: string; key: string } | null>(null);

  // Issue desk state
  const [newId, setNewId] = useState('TCM-T-001');
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState('Trainee');
  const [newRole, setNewRole] = useState<'trader' | 'admin'>('trader');
  const [newAccNum, setNewAccNum] = useState('');
  const [newCapital, setNewCapital] = useState('5000');
  const [newDll, setNewDll] = useState('5');
  const [newDeskPin, setNewDeskPin] = useState('');
  const [bulkLines, setBulkLines] = useState(
    'TCM-T-001, Trader One, 5000\nTCM-T-002, Trader Two, 5000\nTCM-T-003, Jason Ofem, 5000'
  );
  const [issuedCredentials, setIssuedCredentials] = useState<
    Array<{ traderId: string; name: string; key: string; initialCapital: number }>
  >([]);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Firm Equity Curve UI controls
  const [curveMode, setCurveMode] = useState<'equity' | 'pnl' | 'roi'>('equity');
  const [curveWindow, setCurveWindow] = useState<'ALL' | '30' | '90'>('ALL');
  const [showDrawdown, setShowDrawdown] = useState(true);

  function randomSixDigit(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // Firm trade tape filter
  const [tapeFilter, setTapeFilter] = useState<'all' | 'qc' | 'open'>('all');
  const [tapeTrader, setTapeTrader] = useState('ALL');
  const [tapeSearch, setTapeSearch] = useState('');

  const filteredFirmTrades = useMemo(() => {
    if (!overview) return [];
    const q = tapeSearch.trim().toLowerCase();
    return overview.recentFirmTrades.filter((t) => {
      if (tapeTrader !== 'ALL' && t.traderIdCode !== tapeTrader) return false;
      if (tapeFilter === 'qc' && t.flags.length === 0) return false;
      if (tapeFilter === 'open' && t.outcome !== 'Open') return false;
      if (q) {
        const hay =
          `${t.traderIdCode} ${t.traderName} ${t.pair} ${t.effectiveSetup} ${t.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [overview, tapeFilter, tapeTrader, tapeSearch]);

  async function handleIssueDesk(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    setSubmitting(true);
    try {
      if (issueMode === 'bulk') {
        const lines = bulkLines
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const bulkPayload = lines.map((line) => {
          const parts = line.split(/[,\t|]+/).map((p) => p.trim());
          return {
            traderId: parts[0] || '',
            name: parts[1] || parts[0] || '',
            initialCapital: parts[2] ? Number(parts[2]) || 5000 : Number(newCapital) || 5000,
            accountNumber: parts[3] || null,
            tier: newTier,
            dailyLossLimitPct: Number(newDll) || 5,
            pin: parts[4] && parts[4].length >= 6 ? parts[4] : randomSixDigit(),
          };
        });
        const res = await fetch('/api/admin/traders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bulk: bulkPayload }),
        });
        const data = await res.json();
        if (!res.ok) {
          setModalError(data.error || 'Bulk issue failed.');
          return;
        }
        if (Array.isArray(data.created) && data.created.length > 0) {
          setIssuedCredentials((prev) => [...data.created, ...prev]);
        }
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setModalError(
            data.errors.map((er: { traderId: string; error: string }) => `${er.traderId}: ${er.error}`).join(' | ')
          );
        } else {
          setShowIssueModal(false);
        }
        await onRefresh();
        return;
      }

      const chosenKey = newDeskPin.trim() || randomSixDigit();
      const res = await fetch('/api/admin/traders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traderId: newId.trim().toUpperCase(),
          name: newName.trim(),
          tier: newTier,
          role: newRole,
          accountNumber: newAccNum.trim() || null,
          initialCapital: Number(newCapital) || 5000,
          dailyLossLimitPct: Number(newDll) || 5,
          pin: chosenKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || 'Failed to issue desk.');
        return;
      }
      setIssuedCredentials((prev) => [
        {
          traderId: data.user.traderId,
          name: data.user.name,
          key: data.key || chosenKey,
          initialCapital: data.user.initialCapital,
        },
        ...prev,
      ]);
      setShowIssueModal(false);
      setNewName('');
      setNewAccNum('');
      setNewDeskPin('');
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setSubmitting(true);
    try {
      const finalKey = newPin.trim() || randomSixDigit();
      const res = await fetch(`/api/admin/traders/${resetTarget.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPin: finalKey }),
      });
      if (res.ok) {
        setResetResult({ traderId: resetTarget.user.traderId, key: finalKey });
        setIssuedCredentials((prev) => [
          {
            traderId: resetTarget.user.traderId,
            name: resetTarget.user.name,
            key: finalKey,
            initialCapital: resetTarget.user.initialCapital,
          },
          ...prev.filter((c) => c.traderId !== resetTarget.user.traderId),
        ]);
        setResetTarget(null);
        setNewPin('');
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTraderActive(summary: FirmTraderSummary) {
    await fetch(`/api/admin/traders/${summary.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !summary.user.isActive }),
    });
    await onRefresh();
  }

  if (loading && !overview) {
    return (
      <div className="py-16 text-center text-sm text-[#8d94a5]">
        Loading Firm Command telemetry...
      </div>
    );
  }

  if (!overview) return null;

  const fm = overview.firmTotals;
  const userById = new Map(overview.traders.map((t) => [t.user.id, t.user]));
  const totalNoSlAlerts = overview.traders.reduce((s, t) => s + t.metrics.noSlCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="tcm-kpi-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[#c8a55b] font-semibold">
            <Crown className="w-3.5 h-3.5" />
            Boss Oversight · Multi-Desk Surveillance
          </div>
          <h2 className="font-serif-display text-2xl sm:text-3xl text-white mt-1">
            Titan Capital Markets — Firm Command
          </h2>
          <p className="text-xs text-[#9398a6] mt-1">
            Monitor live equity, daily loss limits, risk compliance, sync timestamps, and review
            every trade across all trader desks in real time.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#151822] border border-[#2a3040] text-xs text-[#d6d2c7] hover:border-[#c8a55b]/45"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              const nextNum = overview.traders.length + 1;
              setNewId(`TCM-T-${String(nextNum).padStart(3, '0')}`);
              setNewDeskPin(randomSixDigit());
              setModalError(null);
              setShowIssueModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c8a55b] hover:bg-[#d8b76e] text-[#090a0f] font-semibold text-xs shadow-[0_6px_20px_rgba(200,165,91,0.22)]"
          >
            <Plus className="w-4 h-4" />
            Issue Trader Desk
          </button>
        </div>
      </div>

      {/* Newly Issued / Reset 6-Digit Keys Roster */}
      {(issuedCredentials.length > 0 || resetResult) && (
        <div className="bg-[#121620] border border-[#c8a55b]/45 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-[#e6c77a] flex items-center gap-1.5">
                <KeyRound className="w-4 h-4" />
                Ready-to-Share 6-Digit Trader Keys (Copy & Send to Each Trader)
              </div>
              <p className="text-[11px] text-[#9398a6] mt-0.5">
                Keys are encrypted in Postgres once created — copy and share them with your traders now.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = issuedCredentials
                    .map(
                      (c) =>
                        `${c.name} (${c.traderId}) — 6-Digit Key: ${c.key} | URL: ${window.location.origin}`
                    )
                    .join('\n');
                  navigator.clipboard.writeText(text);
                  setCopiedCreds(true);
                  setTimeout(() => setCopiedCreds(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c8a55b] text-[#090a0f] font-semibold text-xs"
              >
                {copiedCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCreds ? 'Copied All!' : 'Copy All Keys'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIssuedCredentials([]);
                  setResetResult(null);
                }}
                className="text-xs text-[#7f8698] hover:text-white px-2"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {issuedCredentials.map((cred) => (
              <div
                key={cred.traderId}
                className="bg-[#090b10] border border-[#272c3a] rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-mono-num font-semibold text-[#e6c77a]">
                    {cred.traderId}
                  </div>
                  <div className="text-[#cbd0dc] truncate">{cred.name}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase text-[#7f8698]">6-Digit Key</div>
                  <div className="font-mono-num text-sm font-bold tracking-widest text-emerald-300">
                    {cred.key}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Firm KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#8d94a5]">Firm Equity</div>
          <div className="mt-1.5 font-mono-num text-xl font-semibold text-white">
            {formatMoney(fm.totalCurrentEquity)}
          </div>
          <div
            className={`text-xs font-mono-num mt-0.5 ${
              fm.combinedNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatMoney(fm.combinedNetPnl, 'USD', true)} Net P&L
          </div>
        </div>

        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#8d94a5]">Firm Win Rate</div>
          <div className="mt-1.5 font-mono-num text-xl font-semibold text-white">
            {fm.firmWinRate !== null ? `${fm.firmWinRate.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs font-mono-num text-[#9398a6] mt-0.5">
            {fm.combinedClosedTrades} closed · {fm.combinedOpenTrades} open
          </div>
        </div>

        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#8d94a5]">Active Desks</div>
          <div className="mt-1.5 font-mono-num text-xl font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[#c8a55b]" />
            {fm.activeTraders} / {overview.traders.length}
          </div>
          <div className="text-xs text-[#9398a6] mt-0.5">
            Allocated {formatMoney(fm.totalInitialCapital)}
          </div>
        </div>

        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#8d94a5]">No-SL Risk Alerts</div>
          <div
            className={`mt-1.5 font-mono-num text-xl font-semibold flex items-center gap-1.5 ${
              totalNoSlAlerts > 0 ? 'text-amber-300' : 'text-emerald-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            {totalNoSlAlerts}
          </div>
          <div className="text-xs text-[#9398a6] mt-0.5">Across all trader logs</div>
        </div>

        <div className="tcm-kpi-card rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#8d94a5]">Today DLL Breaches</div>
          <div
            className={`mt-1.5 font-mono-num text-xl font-semibold flex items-center gap-1.5 ${
              fm.dllBreachCount > 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            {fm.dllBreachCount}
          </div>
          <div className="text-xs text-[#9398a6] mt-0.5">Daily Loss Rule monitor</div>
        </div>
      </div>

      {/* Total Firm Desk Equity Curve */}
      <div className="relative overflow-hidden rounded-2xl border border-[#c8a55b]/25 bg-gradient-to-b from-[#131620] via-[#0e1017] to-[#0a0c11] p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#c8a55b]/[0.07] blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1f2432]">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#c8a55b] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Total Firm Desk Trajectory
            </div>
            <div className="flex flex-wrap items-baseline gap-3 mt-1">
              <h3 className="font-serif-display text-xl sm:text-2xl text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#c8a55b]" />
                Combined Desk Equity Curve
              </h3>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono-num font-semibold border ${
                  fm.combinedNetPnl >= 0
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/35 text-rose-300'
                }`}
              >
                {fm.firmRoiPct >= 0 ? '+' : ''}
                {fm.firmRoiPct.toFixed(2)}% ROI
              </span>
            </div>
            <p className="text-xs text-[#8f96a8] mt-0.5">
              Chronological aggregate capital curve across all {overview.traders.length} desks (
              {fm.combinedClosedTrades} closed executions) · Hover anywhere to inspect trade &amp;
              trader attribution.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Mode Pills */}
            <div className="inline-flex rounded-xl bg-[#090b10] border border-[#222736] p-1 text-[11px]">
              {(
                [
                  { id: 'equity', label: 'Equity ($)' },
                  { id: 'pnl', label: 'Net P&L' },
                  { id: 'roi', label: 'ROI %' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCurveMode(m.id)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    curveMode === m.id
                      ? 'bg-[#c8a55b] text-[#090a0f] font-semibold'
                      : 'text-[#8d94a5] hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Range Window Pills */}
            <div className="inline-flex rounded-xl bg-[#090b10] border border-[#222736] p-1 text-[11px] font-mono-num">
              {(['ALL', '90', '30'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setCurveWindow(w)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    curveWindow === w
                      ? 'bg-[#1c2130] text-[#e6c77a] font-semibold border border-[#c8a55b]/35'
                      : 'text-[#8d94a5] hover:text-white'
                  }`}
                >
                  {w === 'ALL' ? 'All' : `${w}T`}
                </button>
              ))}
            </div>

            {/* Underwater Drawdown Toggle */}
            <button
              type="button"
              onClick={() => setShowDrawdown((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium border transition-colors ${
                showDrawdown
                  ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
                  : 'bg-[#090b10] border-[#222736] text-[#8d94a5] hover:text-white'
              }`}
            >
              {showDrawdown ? 'Drawdown On' : 'Drawdown Off'}
            </button>
          </div>
        </div>

        {/* Summary Stat Strip */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-5 gap-3 py-4">
          <div className="rounded-xl bg-[#090b10]/85 border border-[#1f2432] px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[#7e8597]">
              Starting Capital
            </div>
            <div className="font-mono-num text-sm font-semibold text-[#d9d4c8] mt-0.5">
              {formatMoney(fm.totalInitialCapital)}
            </div>
          </div>

          <div className="rounded-xl bg-[#090b10]/85 border border-[#c8a55b]/30 px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[#c8a55b]">
              Live Firm Equity
            </div>
            <div className="font-mono-num text-sm font-semibold text-white mt-0.5">
              {formatMoney(fm.totalCurrentEquity)}
            </div>
          </div>

          <div className="rounded-xl bg-[#090b10]/85 border border-[#1f2432] px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[#7e8597]">
              High-Water Mark
            </div>
            <div className="font-mono-num text-sm font-semibold text-emerald-300 mt-0.5">
              {formatMoney(fm.firmPeakEquity)}
            </div>
          </div>

          <div className="rounded-xl bg-[#090b10]/85 border border-[#1f2432] px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[#7e8597]">
              Max Firm Drawdown
            </div>
            <div className="font-mono-num text-sm font-semibold text-rose-300 mt-0.5">
              {formatMoney(fm.firmMaxDrawdown)}{' '}
              <span className="text-[11px] text-[#9ca3b5]">
                ({fm.firmMaxDrawdownPct.toFixed(2)}%)
              </span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl bg-[#090b10]/85 border border-[#1f2432] px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[#7e8597]">
              Firm Profit Factor
            </div>
            <div className="font-mono-num text-sm font-semibold text-[#e6c77a] mt-0.5">
              {fm.firmProfitFactor !== null
                ? fm.firmProfitFactor.toFixed(2)
                : fm.combinedNetPnl > 0
                  ? '∞'
                  : '—'}
            </div>
          </div>
        </div>

        {/* Interactive Smooth Equity & Drawdown SVG */}
        <div className="relative z-10 pt-1">
          <FirmEquityCurveChart
            points={overview.firmEquityCurve}
            initialCapital={fm.totalInitialCapital}
            mode={curveMode}
            showDrawdown={showDrawdown}
            windowLimit={curveWindow}
          />
        </div>
      </div>

      {/* Desks Roster Table */}
      <div className="bg-[#101218] border border-[#222634] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e222f] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">All Trader Desks</h3>
          <span className="text-[11px] text-[#8d94a5]">
            Click “Inspect Desk” to view full charts, trade log, or sync reports on behalf of a trader.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#0b0d12] text-[#848b9c] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Desk</th>
                <th className="px-4 py-3">Tier / Acct</th>
                <th className="px-4 py-3 text-right">Capital</th>
                <th className="px-4 py-3 text-right">Equity / Net P&L</th>
                <th className="px-4 py-3 text-right">Win %</th>
                <th className="px-4 py-3 text-right">Trades</th>
                <th className="px-4 py-3">Today DLL</th>
                <th className="px-4 py-3">Alerts / Sync</th>
                <th className="px-4 py-3 text-right">Boss Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1e29]">
              {overview.traders.map((row) => {
                const u = row.user;
                const m = row.metrics;
                const dllRatio = Math.min(
                  100,
                  (m.todayLossPct / Math.max(u.dailyLossLimitPct, 0.1)) * 100
                );
                return (
                  <tr key={u.id} className={!u.isActive ? 'opacity-50' : 'hover:bg-white/[0.02]'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num font-semibold text-[#e6c77a]">
                          {u.traderId}
                        </span>
                        {u.role === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded bg-[#c8a55b]/20 text-[#e6c77a] text-[9px] uppercase font-semibold">
                            Boss
                          </span>
                        )}
                      </div>
                      <div className="text-white font-medium">{u.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[#cbd0dc]">{u.tier}</div>
                      <div className="text-[10px] font-mono-num text-[#7f8698]">
                        {u.accountNumber ? `#${u.accountNumber}` : u.accountName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-[#cbd0dc]">
                      {formatMoney(u.initialCapital, u.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num">
                      <div className="text-white font-semibold">
                        {formatMoney(m.currentEquity, u.currency)}
                      </div>
                      <div
                        className={`text-[11px] ${
                          m.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatMoney(m.totalNetPnl, u.currency, true)} ({m.roiPct >= 0 ? '+' : ''}
                        {m.roiPct.toFixed(1)}%)
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-white">
                      {m.winRate !== null ? `${m.winRate.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-[#cbd0dc]">
                      {m.closedTrades}
                      {m.openTrades > 0 && (
                        <span className="text-sky-300 ml-1">+{m.openTrades}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[130px]">
                      <div className="flex justify-between text-[10px] font-mono-num mb-1">
                        <span className={m.dllBreachedToday ? 'text-rose-400 font-semibold' : 'text-[#cbd0dc]'}>
                          {m.todayLossPct.toFixed(1)}%
                        </span>
                        <span className="text-[#737a8c]">/ {u.dailyLossLimitPct}%</span>
                      </div>
                      <div className="h-1.5 bg-[#090b10] rounded-full overflow-hidden">
                        <div
                          style={{ width: `${dllRatio}%` }}
                          className={`h-full rounded-full ${
                            m.dllBreachedToday
                              ? 'bg-rose-500'
                              : dllRatio > 60
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                          }`}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[11px]">
                        {m.noSlCount > 0 ? (
                          <span className="text-amber-300 font-medium">
                            {m.noSlCount} no-SL flag{m.noSlCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-emerald-400">Clean SL</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#7f8698]">
                        Sync: {formatRelativeTime(m.lastSyncAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => onInspectTrader(u, 'dashboard')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#c8a55b]/15 hover:bg-[#c8a55b]/30 text-[#e7c77a] border border-[#c8a55b]/35 text-[11px] font-medium"
                        >
                          <Eye className="w-3 h-3" />
                          Inspect Desk
                        </button>
                        <button
                          onClick={() => onInspectTrader(u, 'import')}
                          title="Upload/Sync Broker Report for this trader"
                          className="p-1.5 rounded-lg bg-[#161a24] border border-[#2a2f3f] text-[#cbd0dc] hover:text-[#c8a55b]"
                        >
                          <FileUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setResetTarget(row);
                            setNewPin('');
                          }}
                          title="Reset Desk PIN"
                          className="p-1.5 rounded-lg bg-[#161a24] border border-[#2a2f3f] text-[#cbd0dc] hover:text-[#c8a55b]"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => toggleTraderActive(row)}
                            className="px-2 py-1 rounded-lg bg-[#161a24] border border-[#2a2f3f] text-[10px] text-[#9ea5b5] hover:text-white"
                          >
                            {u.isActive ? 'Pause' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Firm-Wide Trade Surveillance Tape */}
      <div className="bg-[#101218] border border-[#222634] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e222f] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Firm-Wide Execution Tape (Latest 100 Across All Desks)
            </h3>
            <p className="text-[11px] text-[#7f8698]">
              Click any trade to inspect details and leave coaching / risk review feedback.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['all', 'All'],
                ['qc', 'QC Alerts Only'],
                ['open', 'Open Positions'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTapeFilter(id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] ${
                  tapeFilter === id
                    ? 'bg-[#c8a55b] text-[#090a0f] font-semibold'
                    : 'bg-[#0b0d12] text-[#8d94a5] border border-[#222634]'
                }`}
              >
                {label}
              </button>
            ))}

            <select
              value={tapeTrader}
              onChange={(e) => setTapeTrader(e.target.value)}
              className="bg-[#090b10] border border-[#272c3a] rounded-lg px-2.5 py-1 text-xs text-white"
            >
              <option value="ALL">All Desks</option>
              {overview.traders.map((t) => (
                <option key={t.user.id} value={t.user.traderId}>
                  {t.user.traderId} · {t.user.name}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#737a8c] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tapeSearch}
                onChange={(e) => setTapeSearch(e.target.value)}
                placeholder="Filter pair/setup..."
                className="bg-[#090b10] border border-[#272c3a] rounded-lg pl-7 pr-2.5 py-1 text-xs text-white w-36"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-[#0b0d12] text-[#848b9c] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Trader</th>
                <th className="px-4 py-2.5">Entry</th>
                <th className="px-4 py-2.5">Pair</th>
                <th className="px-4 py-2.5">Side</th>
                <th className="px-4 py-2.5">Setup</th>
                <th className="px-4 py-2.5 text-right">Lots</th>
                <th className="px-4 py-2.5 text-right">R</th>
                <th className="px-4 py-2.5 text-right">Net P&L</th>
                <th className="px-4 py-2.5">Review / Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1e29]">
              {filteredFirmTrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#6f7687]">
                    No firm executions match this filter yet.
                  </td>
                </tr>
              ) : (
                filteredFirmTrades.map((t) => {
                  const owner = userById.get(t.userId);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => owner && onSelectFirmTrade(t, owner)}
                      className="hover:bg-white/[0.03] cursor-pointer"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-mono-num text-[#e6c77a] font-semibold">
                          {t.traderIdCode}
                        </span>
                        <span className="text-[#8d94a5] ml-1.5">{t.traderName}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono-num text-[#cbd0dc] whitespace-nowrap">
                        {t.entryDatetime}
                      </td>
                      <td className="px-4 py-2.5 font-mono-num font-semibold text-white">
                        {t.pair}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            t.position === 'Buy'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {t.position.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#cbd0dc]">{t.effectiveSetup}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">
                        {t.lots.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-[#c8a55b]">
                        {formatR(t.realizedRr)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono-num font-semibold ${
                          t.netPnl === null
                            ? 'text-sky-300'
                            : t.netPnl >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {t.outcome === 'Open'
                          ? 'OPEN'
                          : formatMoney(t.netPnl, owner?.currency || 'USD', true)}
                      </td>
                      <td className="px-4 py-2.5 text-[11px]">
                        {t.flags.length > 0 && (
                          <span className="text-amber-300 mr-2">{t.flags[0].message}</span>
                        )}
                        {t.adminReviewNote && <span className="text-[#e6c77a]">Reviewed ✓</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Trader Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#101218] border border-[#c8a55b]/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif-display text-xl text-white">Issue Trader Desk(s)</h3>
              <button
                onClick={() => setShowIssueModal(false)}
                className="text-[#8d94a5] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#090b10] border border-[#222634]">
              <button
                type="button"
                onClick={() => {
                  setIssueMode('single');
                  setModalError(null);
                }}
                className={`py-1.5 rounded-lg text-xs font-medium ${
                  issueMode === 'single'
                    ? 'bg-[#c8a55b] text-[#090a0f] font-semibold'
                    : 'text-[#8d94a5] hover:text-white'
                }`}
              >
                Single Trader Desk
              </button>
              <button
                type="button"
                onClick={() => {
                  setIssueMode('bulk');
                  setModalError(null);
                }}
                className={`py-1.5 rounded-lg text-xs font-medium ${
                  issueMode === 'bulk'
                    ? 'bg-[#c8a55b] text-[#090a0f] font-semibold'
                    : 'text-[#8d94a5] hover:text-white'
                }`}
              >
                Bulk Issue Multiple Traders
              </button>
            </div>

            {modalError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/40 px-3 py-2 text-xs text-rose-200">
                {modalError}
              </div>
            )}

            <form onSubmit={handleIssueDesk} className="space-y-3">
              {issueMode === 'bulk' ? (
                <>
                  <div>
                    <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                      Paste Trader List (one per line: ID, Full Name, Capital, Account#)
                    </label>
                    <textarea
                      rows={5}
                      required
                      value={bulkLines}
                      onChange={(e) => setBulkLines(e.target.value)}
                      placeholder={'TCM-T-001, John Doe, 5000\nTCM-T-002, Jane Smith, 10000\nTCM-T-003, Jason Ofem, 5000, 315077956'}
                      className="w-full bg-[#090b10] border border-[#272c3a] rounded-xl p-3 text-xs font-mono-num text-white focus:border-[#c8a55b] focus:outline-none"
                    />
                    <p className="text-[11px] text-[#7f8698] mt-1">
                      A unique 6-digit access key is automatically generated for every trader in the list.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Default Tier
                      </label>
                      <select
                        value={newTier}
                        onChange={(e) => setNewTier(e.target.value)}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-2.5 py-2 text-xs text-white"
                      >
                        <option value="Trainee">Trainee</option>
                        <option value="Junior Funded">Junior Funded</option>
                        <option value="Senior Funded">Senior Funded</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Default Capital
                      </label>
                      <input
                        type="number"
                        value={newCapital}
                        onChange={(e) => setNewCapital(e.target.value)}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-2.5 py-2 text-xs font-mono-num text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        DLL %
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={newDll}
                        onChange={(e) => setNewDll(e.target.value)}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-2.5 py-2 text-xs font-mono-num text-white"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Trader ID
                      </label>
                      <input
                        required
                        value={newId}
                        onChange={(e) => setNewId(e.target.value.toUpperCase())}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num uppercase text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Role
                      </label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as 'trader' | 'admin')}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
                      >
                        <option value="trader">Trader Desk</option>
                        <option value="admin">Co-Admin / Risk Officer</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                      Trader Full Name
                    </label>
                    <input
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Jason Ofem"
                      className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Tier
                      </label>
                      <select
                        value={newTier}
                        onChange={(e) => setNewTier(e.target.value)}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
                      >
                        <option value="Trainee">Trainee</option>
                        <option value="Junior Funded">Junior Funded</option>
                        <option value="Senior Funded">Senior Funded</option>
                        <option value="Risk Officer">Risk Officer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Broker Acct #
                      </label>
                      <input
                        value={newAccNum}
                        onChange={(e) => setNewAccNum(e.target.value)}
                        placeholder="e.g. 315077956"
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Capital ($)
                      </label>
                      <input
                        type="number"
                        required
                        value={newCapital}
                        onChange={(e) => setNewCapital(e.target.value)}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-[#8d94a5] mb-1">
                        Daily Loss Limit %
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        required
                        value={newDll}
                        onChange={(e) => setNewDll(e.target.value)}
                        className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase text-[#8d94a5]">
                        6-Digit Access Key (PIN)
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewDeskPin(randomSixDigit())}
                        className="inline-flex items-center gap-1 text-[11px] text-[#c8a55b] hover:underline"
                      >
                        <Dices className="w-3 h-3" /> Regenerate 6-Digit Key
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={newDeskPin}
                      onChange={(e) => setNewDeskPin(e.target.value)}
                      placeholder="6-digit key (e.g. 482915)"
                      className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-sm font-mono-num tracking-widest text-emerald-300"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#2b3040] text-xs text-[#9ea5b5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#c8a55b] text-[#090a0f] font-semibold text-xs"
                >
                  {submitting
                    ? 'Issuing...'
                    : issueMode === 'bulk'
                      ? 'Issue All & Generate 6-Digit Keys'
                      : 'Create Desk & Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#101218] border border-[#c8a55b]/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif-display text-lg text-white">
                Reset 6-Digit Key — {resetTarget.user.traderId}
              </h3>
              <button onClick={() => setResetTarget(null)} className="text-[#8d94a5]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleResetPin} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#8d94a5]">New 6-Digit Access Key</span>
                <button
                  type="button"
                  onClick={() => setNewPin(randomSixDigit())}
                  className="inline-flex items-center gap-1 text-[11px] text-[#c8a55b] hover:underline"
                >
                  <Dices className="w-3 h-3" /> Generate 6-Digit
                </button>
              </div>
              <input
                type="text"
                required
                minLength={6}
                autoFocus
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="e.g. 641028"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2.5 text-sm font-mono-num tracking-widest text-emerald-300"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-3.5 py-2 rounded-xl border border-[#2b3040] text-xs text-[#9ea5b5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[#c8a55b] text-[#090a0f] font-semibold text-xs"
                >
                  Save New Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
