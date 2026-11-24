'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  MessageSquare,
  Search,
  Trash2,
} from 'lucide-react';
import { computeJournalMetrics } from '@/lib/trading-math';
import { ComputedTrade, TradeRecord, UserProfile } from '@/lib/types';
import { formatMoney, formatPips, formatPrice, formatR } from '@/lib/format';

interface TradeLogViewProps {
  user: UserProfile;
  rawTrades: TradeRecord[];
  onSelectTrade: (t: ComputedTrade) => void;
  onEditTrade: (t: ComputedTrade) => void;
  onDeleteTrade: (id: string) => Promise<void>;
}

export default function TradeLogView({
  user,
  rawTrades,
  onSelectTrade,
  onEditTrade,
  onDeleteTrade,
}: TradeLogViewProps) {
  const [statusTab, setStatusTab] = useState<'all' | 'closed' | 'open' | 'qc'>('all');
  const [search, setSearch] = useState('');

  const { computedTrades } = useMemo(
    () =>
      computeJournalMetrics(rawTrades, {
        initialCapital: user.initialCapital,
        defaultRiskPct: user.defaultRiskPct,
        breakevenThreshold: user.breakevenThreshold,
        dailyLossLimitPct: user.dailyLossLimitPct,
      }),
    [rawTrades, user]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...computedTrades]
      .sort((a, b) => b.entryDatetime.localeCompare(a.entryDatetime) || b.sn - a.sn)
      .filter((t) => {
        if (statusTab === 'closed' && t.outcome === 'Open') return false;
        if (statusTab === 'open' && t.outcome !== 'Open') return false;
        if (statusTab === 'qc' && t.flags.length === 0) return false;
        if (q) {
          const hay =
            `${t.pair} ${t.effectiveSetup} ${t.session} ${t.brokerTicket || ''} ${t.notes || ''} ${t.mistakes || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [computedTrades, statusTab, search]);

  function downloadJsonBackup() {
    const blob = new Blob([JSON.stringify({ traderId: user.traderId, trades: rawTrades }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TCM_Backup_${user.traderId}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#101218] border border-[#222634] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {(
            [
              ['all', `All (${computedTrades.length})`],
              ['closed', `Closed (${computedTrades.filter((t) => t.outcome !== 'Open').length})`],
              ['open', `Open (${computedTrades.filter((t) => t.outcome === 'Open').length})`],
              ['qc', `QC Alerts (${computedTrades.filter((t) => t.flags.length > 0).length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setStatusTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusTab === id
                  ? 'bg-[#c8a55b] text-[#090a0f] font-semibold'
                  : 'text-[#8d94a5] hover:text-white bg-[#0a0c10] border border-[#202432]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 flex-1 sm:flex-initial justify-end">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#737a8c] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pair, setup, ticket, notes..."
              className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={downloadJsonBackup}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161a24] border border-[#2a2f3f] text-xs text-[#d6d2c7] hover:border-[#c8a55b]/50"
          >
            <Download className="w-3.5 h-3.5 text-[#c8a55b]" />
            JSON Backup
          </button>
        </div>
      </div>

      <div className="bg-[#101218] border border-[#222634] rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6f7687]">
            No trades match this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#0b0d12] text-[#848b9c] uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3.5 py-3">S/N</th>
                  <th className="px-3.5 py-3">Entry</th>
                  <th className="px-3.5 py-3">Pair</th>
                  <th className="px-3.5 py-3">Side</th>
                  <th className="px-3.5 py-3">Session / Setup</th>
                  <th className="px-3.5 py-3 text-right">Lots</th>
                  <th className="px-3.5 py-3 text-right">Entry / SL / TP</th>
                  <th className="px-3.5 py-3 text-right">Exit</th>
                  <th className="px-3.5 py-3 text-right">Pips</th>
                  <th className="px-3.5 py-3 text-right">R</th>
                  <th className="px-3.5 py-3 text-right">Net P&L</th>
                  <th className="px-3.5 py-3 text-right">Balance</th>
                  <th className="px-3.5 py-3">Flags</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1e29]">
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelectTrade(t)}
                    className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-3.5 py-2.5 font-mono-num text-[#7f8698]">
                      {t.sn}
                      {t.brokerTicket && (
                        <div className="text-[9px] text-[#5e6577]">#{t.brokerTicket}</div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono-num text-[#cbd0dc] whitespace-nowrap">
                      {t.entryDate}
                      <div className="text-[10px] text-[#6d7486]">{t.entryTime}</div>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono-num font-semibold text-white">
                      {t.pair}
                    </td>
                    <td className="px-3.5 py-2.5">
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
                    <td className="px-3.5 py-2.5">
                      <div className="text-[#e7e4dc]">{t.effectiveSetup}</div>
                      <div className="text-[10px] text-[#7f8698]">
                        {t.session}
                        {t.timeframe ? ` · ${t.timeframe}` : ''}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono-num">
                      {t.lots.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono-num whitespace-nowrap">
                      <div className="text-white">{formatPrice(t.entryPrice, t.pair)}</div>
                      <div className="text-[10px] text-[#787f90]">
                        {t.stopLoss ? formatPrice(t.stopLoss, t.pair) : 'No SL'} /{' '}
                        {t.takeProfit ? formatPrice(t.takeProfit, t.pair) : '—'}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono-num whitespace-nowrap">
                      {t.outcome === 'Open' ? (
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px]">
                          OPEN
                        </span>
                      ) : (
                        <>
                          <div className="text-white">{formatPrice(t.exitPrice, t.pair)}</div>
                          <div className="text-[10px] text-[#6d7486]">{t.durationLabel}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono-num text-[#cbd0dc]">
                      {formatPips(t.resultPips)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono-num text-[#c8a55b]">
                      {formatR(t.realizedRr)}
                    </td>
                    <td
                      className={`px-3.5 py-2.5 text-right font-mono-num font-semibold ${
                        t.netPnl === null
                          ? 'text-[#7f8698]'
                          : t.netPnl >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {formatMoney(t.netPnl, user.currency, true)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono-num text-[#cbd0dc]">
                      {formatMoney(t.balanceAfter, user.currency)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1">
                        {t.flags.length > 0 && (
                          <span
                            title={t.flags.map((f) => f.message).join(' | ')}
                            className="p-1 rounded bg-amber-500/15 text-amber-300"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {t.adminReviewNote && (
                          <span
                            title={`Boss Note: ${t.adminReviewNote}`}
                            className="p-1 rounded bg-[#c8a55b]/20 text-[#e7c77a]"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-3.5 py-2.5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onEditTrade(t)}
                        className="text-[11px] text-[#c8a55b] hover:underline mr-2.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete trade #${t.sn} (${t.pair})?`)) {
                            onDeleteTrade(t.id);
                          }
                        }}
                        className="text-[#787f90] hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
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
