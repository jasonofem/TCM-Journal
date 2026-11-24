'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  MessageSquare,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  EMOTIONS,
  EXIT_REASONS,
  FOLLOWED_PLAN_OPTIONS,
  MARKET_CONDITIONS,
  SETUPS,
  TCM_PAIRS,
  TIMEFRAMES,
  TRADING_SESSIONS,
} from '@/lib/trading-math';
import {
  ComputedTrade,
  PositionSide,
  TradeInput,
  TradingSession,
  UserProfile,
} from '@/lib/types';
import { formatMoney, formatPips, formatPrice, formatR } from '@/lib/format';

export function TradeFormModal({
  initialTrade,
  targetUser,
  onClose,
  onSaved,
}: {
  initialTrade?: ComputedTrade | null;
  targetUser: UserProfile;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = Boolean(initialTrade);
  const today = new Date().toISOString().slice(0, 10);
  const nowHm = new Date().toISOString().slice(11, 16);

  const [pair, setPair] = useState(initialTrade?.pair || 'EURUSD');
  const [position, setPosition] = useState<PositionSide>(initialTrade?.position || 'Buy');
  const [setup, setSetup] = useState(initialTrade?.setup || 'H1 5050 Bounce');
  const [customSetup, setCustomSetup] = useState(initialTrade?.customSetup || '');
  const [entryDate, setEntryDate] = useState(initialTrade?.entryDate || today);
  const [entryTime, setEntryTime] = useState(initialTrade?.entryTime?.slice(0, 5) || nowHm);
  const [session, setSession] = useState<TradingSession>(initialTrade?.session || 'London');
  const [lots, setLots] = useState(String(initialTrade?.lots ?? '0.50'));
  const [riskAmount, setRiskAmount] = useState(
    initialTrade?.riskAmount !== null && initialTrade?.riskAmount !== undefined
      ? String(initialTrade.riskAmount)
      : ''
  );
  const [entryPrice, setEntryPrice] = useState(
    initialTrade?.entryPrice ? String(initialTrade.entryPrice) : ''
  );
  const [stopLoss, setStopLoss] = useState(
    initialTrade?.stopLoss ? String(initialTrade.stopLoss) : ''
  );
  const [takeProfit, setTakeProfit] = useState(
    initialTrade?.takeProfit ? String(initialTrade.takeProfit) : ''
  );
  const [exitPrice, setExitPrice] = useState(
    initialTrade?.exitPrice ? String(initialTrade.exitPrice) : ''
  );
  const [exitDate, setExitDate] = useState(initialTrade?.exitDate || '');
  const [exitTime, setExitTime] = useState(initialTrade?.exitTime?.slice(0, 5) || '');
  const [exitReason, setExitReason] = useState(initialTrade?.exitReason || '');
  const [commission, setCommission] = useState(String(initialTrade?.commission ?? '0'));
  const [swap, setSwap] = useState(String(initialTrade?.swap ?? '0'));
  const [brokerPnl, setBrokerPnl] = useState(
    initialTrade?.brokerPnl !== null && initialTrade?.brokerPnl !== undefined
      ? String(initialTrade.brokerPnl)
      : ''
  );
  const [followedPlan, setFollowedPlan] = useState(initialTrade?.followedPlan || 'Yes');
  const [marketCondition, setMarketCondition] = useState(
    initialTrade?.marketCondition || 'Trending'
  );
  const [timeframe, setTimeframe] = useState(initialTrade?.timeframe || 'H1');
  const [emotion, setEmotion] = useState(initialTrade?.emotion || '2 — Composed');
  const [brokerTicket, setBrokerTicket] = useState(initialTrade?.brokerTicket || '');
  const [beforeScreenshot, setBeforeScreenshot] = useState(
    initialTrade?.beforeScreenshot || ''
  );
  const [afterScreenshot, setAfterScreenshot] = useState(
    initialTrade?.afterScreenshot || ''
  );
  const [mistakes, setMistakes] = useState(initialTrade?.mistakes || '');
  const [notes, setNotes] = useState(initialTrade?.notes || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: TradeInput & { targetTraderId?: string } = {
      targetTraderId: targetUser.traderId,
      pair,
      position,
      setup,
      customSetup: setup === 'Other' ? customSetup || null : null,
      entryDate,
      entryTime: entryTime.length === 5 ? `${entryTime}:00` : entryTime,
      session,
      lots: Number(lots),
      riskAmount: riskAmount.trim() ? Number(riskAmount) : null,
      entryPrice: Number(entryPrice),
      stopLoss: stopLoss.trim() ? Number(stopLoss) : null,
      takeProfit: takeProfit.trim() ? Number(takeProfit) : null,
      exitPrice: exitPrice.trim() ? Number(exitPrice) : null,
      exitDate: exitDate.trim() || null,
      exitTime: exitTime.trim() ? (exitTime.length === 5 ? `${exitTime}:00` : exitTime) : null,
      exitReason: exitReason || null,
      commission: Number(commission) || 0,
      swap: Number(swap) || 0,
      brokerPnl: brokerPnl.trim() ? Number(brokerPnl) : null,
      followedPlan: followedPlan || null,
      marketCondition: marketCondition || null,
      timeframe: timeframe || null,
      emotion: emotion || null,
      brokerTicket: brokerTicket.trim() || null,
      beforeScreenshot: beforeScreenshot.trim() || null,
      afterScreenshot: afterScreenshot.trim() || null,
      mistakes: mistakes.trim() || null,
      notes: notes.trim() || null,
      source: 'manual',
    };

    try {
      const res = await fetch(
        isEdit && initialTrade ? `/api/trades/${initialTrade.id}` : '/api/trades',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save trade.');
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError('Network error while saving trade.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#101218] border border-[#c8a55b]/35 rounded-2xl shadow-2xl overflow-hidden my-6">
        <div className="px-6 py-4 bg-[#141720] border-b border-[#232836] flex items-center justify-between">
          <div>
            <h3 className="font-serif-display text-xl text-white">
              {isEdit ? `Edit Trade #${initialTrade?.sn}` : 'Manual Order Ticket'}
            </h3>
            <p className="text-[11px] text-[#8d94a5]">
              Desk: <span className="font-mono-num text-[#c8a55b]">{targetUser.traderId}</span> ·{' '}
              Leave Exit fields blank to log an open running position.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#8d94a5] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Core Execution */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Pair
              </label>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              >
                {TCM_PAIRS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="OTHER">OTHER</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Direction
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as PositionSide)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="Buy">Buy / Long</option>
                <option value="Sell">Sell / Short</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Lots
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Session
              </label>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value as TradingSession)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                {TRADING_SESSIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Entry Date
              </label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Entry Time
              </label>
              <input
                type="time"
                required
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Setup
              </label>
              <select
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                {SETUPS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="">None</option>
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {setup === 'Other' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Custom Setup Label
              </label>
              <input
                type="text"
                value={customSetup}
                onChange={(e) => setCustomSetup(e.target.value)}
                placeholder="e.g. Asian Range Sweep"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
          )}

          {/* Prices & Risk */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Entry Price
              </label>
              <input
                type="number"
                step="any"
                required
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="1.08420"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Stop Loss
              </label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="1.08320"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Take Profit
              </label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="1.08670"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Risk $ Override
              </label>
              <input
                type="number"
                step="0.01"
                value={riskAmount}
                onChange={(e) => setRiskAmount(e.target.value)}
                placeholder="Auto from SL"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
          </div>

          {/* Exit Fields */}
          <div className="p-4 rounded-xl bg-[#0c0e14] border border-[#202533] space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#c8a55b]">
              Exit & Settlement (Leave blank if trade is still open)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Exit Price
                </label>
                <input
                  type="number"
                  step="any"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Exit Date
                </label>
                <input
                  type="date"
                  value={exitDate}
                  onChange={(e) => setExitDate(e.target.value)}
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Exit Time
                </label>
                <input
                  type="time"
                  value={exitTime}
                  onChange={(e) => setExitTime(e.target.value)}
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Exit Reason
                </label>
                <select
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="">—</option>
                  {EXIT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Broker Gross P&L
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={brokerPnl}
                  onChange={(e) => setBrokerPnl(e.target.value)}
                  placeholder="Auto if blank"
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Commission
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Swap
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={swap}
                  onChange={(e) => setSwap(e.target.value)}
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                  Broker Ticket #
                </label>
                <input
                  type="text"
                  value={brokerTicket}
                  onChange={(e) => setBrokerTicket(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
            </div>
          </div>

          {/* Process & Psychology */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Followed Plan?
              </label>
              <select
                value={followedPlan}
                onChange={(e) => setFollowedPlan(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                {FOLLOWED_PLAN_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Market Condition
              </label>
              <select
                value={marketCondition}
                onChange={(e) => setMarketCondition(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                {MARKET_CONDITIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Emotion State
              </label>
              <select
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                {EMOTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Before Screenshot URL
              </label>
              <input
                type="url"
                value={beforeScreenshot}
                onChange={(e) => setBeforeScreenshot(e.target.value)}
                placeholder="https://tradingview.com/x/..."
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                After Screenshot URL
              </label>
              <input
                type="url"
                value={afterScreenshot}
                onChange={(e) => setAfterScreenshot(e.target.value)}
                placeholder="https://tradingview.com/x/..."
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Mistakes / Violations
              </label>
              <textarea
                rows={2}
                value={mistakes}
                onChange={(e) => setMistakes(e.target.value)}
                placeholder="None / Entered early before candle close"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Trade Notes & Thesis
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Thesis, liquidity sweep, management notes..."
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#222634]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#2b3040] text-xs text-[#9ea5b5] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#c8a55b] hover:bg-[#d8b66c] text-[#090a0f] font-semibold text-xs"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Record Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TradeInspectorDrawer({
  trade,
  currency,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
  onRefresh,
}: {
  trade: ComputedTrade;
  currency: string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (t: ComputedTrade) => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [adminNote, setAdminNote] = useState(trade.adminReviewNote || '');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  async function saveAdminNote() {
    setSavingNote(true);
    setNoteSaved(false);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminReviewNote: adminNote.trim() || null }),
      });
      if (res.ok) {
        setNoteSaved(true);
        await onRefresh();
      }
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-[#101218] border-l border-[#c8a55b]/30 h-full overflow-y-auto p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#222634]">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono-num text-xs text-[#8d94a5]">#{trade.sn}</span>
              <h3 className="font-serif-display text-2xl text-white">{trade.pair}</h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  trade.position === 'Buy'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {trade.position.toUpperCase()} {trade.lots.toFixed(2)}L
              </span>
            </div>
            <div className="text-xs font-mono-num text-[#9398a6] mt-1">
              {trade.entryDatetime} · {trade.session} · {trade.effectiveSetup}
              {trade.brokerTicket ? ` · Ticket #${trade.brokerTicket}` : ''}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#8d94a5] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Key Numbers */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#0b0d12] border border-[#222634] rounded-xl p-3">
            <div className="text-[10px] uppercase text-[#7f8698]">Net P&L</div>
            <div
              className={`font-mono-num text-lg font-semibold mt-0.5 ${
                trade.netPnl === null
                  ? 'text-sky-300'
                  : trade.netPnl >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
              }`}
            >
              {trade.outcome === 'Open' ? 'OPEN' : formatMoney(trade.netPnl, currency, true)}
            </div>
          </div>
          <div className="bg-[#0b0d12] border border-[#222634] rounded-xl p-3">
            <div className="text-[10px] uppercase text-[#7f8698]">Realized R</div>
            <div className="font-mono-num text-lg font-semibold text-[#c8a55b] mt-0.5">
              {formatR(trade.realizedRr)}
            </div>
          </div>
          <div className="bg-[#0b0d12] border border-[#222634] rounded-xl p-3">
            <div className="text-[10px] uppercase text-[#7f8698]">Pips</div>
            <div className="font-mono-num text-lg font-semibold text-white mt-0.5">
              {formatPips(trade.resultPips)}
            </div>
          </div>
        </div>

        {/* Execution Detail Grid */}
        <div className="bg-[#0c0e14] border border-[#202533] rounded-xl p-4 grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Entry Price</span>
            <span className="font-mono-num text-white">{formatPrice(trade.entryPrice, trade.pair)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Exit Price</span>
            <span className="font-mono-num text-white">{formatPrice(trade.exitPrice, trade.pair)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Stop Loss</span>
            <span className="font-mono-num text-rose-300">{formatPrice(trade.stopLoss, trade.pair)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Take Profit</span>
            <span className="font-mono-num text-emerald-300">
              {formatPrice(trade.takeProfit, trade.pair)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Planned RR</span>
            <span className="font-mono-num text-[#cbd0dc]">
              {trade.plannedRr !== null ? `1:${trade.plannedRr.toFixed(2)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Duration</span>
            <span className="font-mono-num text-[#cbd0dc]">{trade.durationLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Risk $</span>
            <span className="font-mono-num text-[#cbd0dc]">
              {formatMoney(trade.computedRiskAmount, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Comm / Swap</span>
            <span className="font-mono-num text-[#cbd0dc]">
              {formatMoney(trade.commission + trade.swap, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Source</span>
            <span className="font-mono-num text-[#c8a55b]">{trade.source}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7f8698]">Balance After</span>
            <span className="font-mono-num text-white">
              {formatMoney(trade.balanceAfter, currency)}
            </span>
          </div>
        </div>

        {/* QC Flags */}
        {trade.flags.length > 0 && (
          <div className="space-y-1.5">
            {trade.flags.map((flag, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 border ${
                  flag.level === 'error'
                    ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
                    : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{flag.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Notes & Screenshots */}
        {(trade.notes || trade.mistakes || trade.beforeScreenshot || trade.afterScreenshot) && (
          <div className="space-y-2.5 text-xs bg-[#0c0e14] border border-[#202533] rounded-xl p-4">
            {trade.mistakes && (
              <div>
                <div className="text-[10px] uppercase text-rose-300 font-semibold">Mistakes</div>
                <p className="text-[#dad6cb] mt-0.5">{trade.mistakes}</p>
              </div>
            )}
            {trade.notes && (
              <div>
                <div className="text-[10px] uppercase text-[#8d94a5] font-semibold">Trader Notes</div>
                <p className="text-[#dad6cb] mt-0.5 whitespace-pre-wrap">{trade.notes}</p>
              </div>
            )}
            {(trade.beforeScreenshot || trade.afterScreenshot) && (
              <div className="flex gap-3 pt-1">
                {trade.beforeScreenshot && (
                  <a
                    href={trade.beforeScreenshot}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#c8a55b] underline"
                  >
                    Before Chart ↗
                  </a>
                )}
                {trade.afterScreenshot && (
                  <a
                    href={trade.afterScreenshot}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#c8a55b] underline"
                  >
                    After Chart ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Boss / Risk Officer Review Note */}
        {(isAdmin || trade.adminReviewNote) && (
          <div className="bg-[#151824] border border-[#c8a55b]/35 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#e6c77b]">
              <MessageSquare className="w-4 h-4" />
              Boss / Risk Desk Feedback
            </div>
            {isAdmin ? (
              <>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Write desk review or coaching feedback on this execution..."
                  className="w-full bg-[#090b10] border border-[#2c3140] focus:border-[#c8a55b] rounded-lg p-2.5 text-xs text-white focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  {noteSaved ? (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#7f8698]">Visible to trader</span>
                  )}
                  <button
                    type="button"
                    onClick={saveAdminNote}
                    disabled={savingNote}
                    className="px-3 py-1.5 rounded-lg bg-[#c8a55b] text-[#090a0f] font-semibold text-xs"
                  >
                    {savingNote ? 'Saving...' : 'Save Review Note'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#f0e6cc] whitespace-pre-wrap">
                {trade.adminReviewNote}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[#222634]">
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(`Delete trade #${trade.sn} (${trade.pair})?`)) {
                await onDelete(trade.id);
                onClose();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/35 text-xs text-rose-300 hover:bg-rose-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Trade
          </button>
          <button
            type="button"
            onClick={() => onEdit(trade)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c8a55b] text-[#090a0f] font-semibold text-xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Trade
          </button>
        </div>
      </div>
    </div>
  );
}
