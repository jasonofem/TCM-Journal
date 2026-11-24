'use client';

import React, { useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Download,
  KeyRound,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Webhook,
} from 'lucide-react';
import { UserProfile } from '@/lib/types';
import {
  generateMt5EaCode,
  generateMt5PythonScript,
} from '@/lib/mt5-sync-scripts';

interface SettingsSyncViewProps {
  currentUser: UserProfile;
  targetUser: UserProfile;
  onUpdated: () => Promise<void> | void;
}

export default function SettingsSyncView({
  currentUser,
  targetUser,
  onUpdated,
}: SettingsSyncViewProps) {
  const isSelf = currentUser.id === targetUser.id;
  const [name, setName] = useState(targetUser.name);
  const [accountNumber, setAccountNumber] = useState(targetUser.accountNumber || '');
  const [accountName, setAccountName] = useState(targetUser.accountName);
  const [initialCapital, setInitialCapital] = useState(String(targetUser.initialCapital));
  const [currency, setCurrency] = useState(targetUser.currency);
  const [defaultRiskPct, setDefaultRiskPct] = useState(String(targetUser.defaultRiskPct));
  const [breakevenThreshold, setBreakevenThreshold] = useState(
    String(targetUser.breakevenThreshold)
  );
  const [dailyLossLimitPct, setDailyLossLimitPct] = useState(
    String(targetUser.dailyLossLimitPct)
  );
  const [timezoneOffsetHours, setTimezoneOffsetHours] = useState(
    String(targetUser.timezoneOffsetHours)
  );

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/ingest/webhook`
      : '/api/ingest/webhook';

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    setErrMsg(null);
    setBusy(true);
    try {
      const endpoint = isSelf ? '/api/settings' : `/api/admin/traders/${targetUser.id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          accountNumber: accountNumber.trim() || null,
          accountName,
          initialCapital: Number(initialCapital),
          currency,
          defaultRiskPct: Number(defaultRiskPct),
          breakevenThreshold: Number(breakevenThreshold),
          dailyLossLimitPct: Number(dailyLossLimitPct),
          timezoneOffsetHours: Number(timezoneOffsetHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error || 'Failed to save settings.');
        return;
      }
      setStatusMsg('Desk settings updated.');
      await onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    setErrMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error || 'Could not change PIN.');
        return;
      }
      setCurrentPin('');
      setNewPin('');
      setStatusMsg('Desk PIN updated successfully.');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'load_examples' | 'wipe_examples' | 'wipe_all') {
    if (
      action === 'wipe_all' &&
      !window.confirm(`Permanently delete ALL trades on ${targetUser.traderId}?`)
    ) {
      return;
    }
    setStatusMsg(null);
    setErrMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/trades/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetTraderId: targetUser.traderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error || 'Action failed.');
        return;
      }
      setStatusMsg(
        action === 'load_examples'
          ? `Loaded ${data.added} example trade(s).`
          : `Removed ${data.deleted} trade(s).`
      );
      await onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreJson(file: File) {
    const text = await file.text();
    setBusy(true);
    setStatusMsg(null);
    setErrMsg(null);
    try {
      const res = await fetch('/api/trades/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore_json',
          targetTraderId: targetUser.traderId,
          jsonPayload: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error || 'Restore failed.');
        return;
      }
      setStatusMsg(`Restored ${data.inserted} non-duplicate trade(s) from JSON backup.`);
      await onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function regenerateWebhookToken() {
    setBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateToken: true }),
      });
      if (res.ok) {
        setStatusMsg('Rotated API Sync Token. Re-download your MT5 EA or Python script with the new token.');
        await onUpdated();
      }
    } finally {
      setBusy(false);
    }
  }

  function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function testWebhookPing() {
    setStatusMsg(null);
    setErrMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/ingest/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tcm-token': targetUser.apiToken,
        },
        body: JSON.stringify({ fileName: 'mt5-ping-test', trades: [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error || 'Webhook ping failed.');
        return;
      }
      setStatusMsg(`Live MT5 Webhook verified for ${data.traderId} — ready for zero-export sync!`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Desk Identity & Risk Rules */}
        <form
          onSubmit={saveProfile}
          className="bg-[#101218] border border-[#222634] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-[#1e222f] pb-3">
            <Shield className="w-4 h-4 text-[#c8a55b]" />
            <h3 className="text-sm font-semibold text-white">
              Desk Configuration ({targetUser.traderId})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Trader Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Broker Account #
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 315077956"
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Account Label
              </label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Initial Capital
              </label>
              <input
                type="number"
                step="1"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="NGN">NGN (₦)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Default Risk %
              </label>
              <input
                type="number"
                step="0.1"
                value={defaultRiskPct}
                onChange={(e) => setDefaultRiskPct(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Daily Loss Limit %
              </label>
              <input
                type="number"
                step="0.5"
                value={dailyLossLimitPct}
                onChange={(e) => setDailyLossLimitPct(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
                Breakeven Band (±$)
              </label>
              <input
                type="number"
                step="0.5"
                value={breakevenThreshold}
                onChange={(e) => setBreakevenThreshold(e.target.value)}
                className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#8d94a5] mb-1">
              Default Report Timezone
            </label>
            <select
              value={timezoneOffsetHours}
              onChange={(e) => setTimezoneOffsetHours(e.target.value)}
              className="w-full bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="0">UTC+0 (London GMT)</option>
              <option value="1">UTC+1 (WAT Lagos / BST)</option>
              <option value="2">UTC+2 (Broker Server EET)</option>
              <option value="3">UTC+3 (Broker Server EEST)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c8a55b] text-[#090a0f] font-semibold text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            Save Desk Settings
          </button>
        </form>

        {/* Webhook Sync + Security */}
        <div className="space-y-6">
          <div className="bg-[#101218] border border-[#222634] rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e222f] pb-3">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-[#c8a55b]" />
                <h3 className="text-sm font-semibold text-white">
                  Zero-Export MT5 Live Auto-Sync
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={testWebhookPing}
                  className="text-[11px] text-emerald-300 hover:underline flex items-center gap-1"
                >
                  <Activity className="w-3 h-3" /> Test Ping
                </button>
                {isSelf && (
                  <button
                    type="button"
                    onClick={regenerateWebhookToken}
                    className="text-[11px] text-[#c8a55b] hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Rotate Token
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-[#8d94a5]">
              Attach once to MetaTrader 5 so every open position, SL/TP edit, and closed trade syncs
              automatically with zero manual exporting. Your personal token is pre-filled inside both
              downloads below.
            </p>
            <div className="bg-[#090b10] border border-[#262b38] rounded-xl p-3 font-mono-num text-[11px] text-[#d9d4c8] space-y-1.5">
              <div>
                <span className="text-[#7f8698]">POST </span>
                <span className="text-[#c8a55b] break-all">{webhookUrl}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="text-[#7f8698]">x-tcm-token: </span>
                  {targetUser.apiToken}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(targetUser.apiToken);
                    setCopiedToken(true);
                    setTimeout(() => setCopiedToken(false), 1800);
                  }}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded bg-[#181c26] text-[10px] text-[#c8a55b]"
                >
                  {copiedToken ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedToken ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#090b10] border border-[#c8a55b]/30 p-3.5 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#e6c77a]">
                    Option A — MT5 Expert Advisor
                  </div>
                  <p className="text-[11px] text-[#8d94a5] mt-1 leading-relaxed">
                    Runs directly inside MetaTrader 5 (Windows, Mac, or VPS). Drop on 1 chart to
                    sync your whole account automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      'TCM_LiveSync.mq5',
                      generateMt5EaCode({
                        webhookUrl,
                        apiToken: targetUser.apiToken,
                        traderId: targetUser.traderId,
                      })
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#c8a55b] hover:bg-[#d8b76e] text-[#090a0f] font-semibold text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download TCM_LiveSync.mq5
                </button>
              </div>

              <div className="rounded-xl bg-[#090b10] border border-[#262b38] p-3.5 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">
                    Option B — Windows Python Watcher
                  </div>
                  <p className="text-[11px] text-[#8d94a5] mt-1 leading-relaxed">
                    No MetaEditor or MT5 settings needed. Polls your open MT5 terminal every 15s via
                    the official MetaTrader5 package.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      'tcm_mt5_autosync.py',
                      generateMt5PythonScript({
                        webhookUrl,
                        apiToken: targetUser.apiToken,
                        traderId: targetUser.traderId,
                      })
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#161a24] border border-[#2c3140] hover:border-[#c8a55b]/50 text-white font-semibold text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-[#c8a55b]" />
                  Download tcm_mt5_autosync.py
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-[#0b0d13] border border-[#1d212d] px-3.5 py-2.5 text-[11px] text-[#9398a6] space-y-1">
              <div className="font-semibold text-[#d6d2c7]">Quick Setup (MT5 Expert Advisor):</div>
              <div>
                1. In MT5 open <span className="text-white">Tools → Options → Expert Advisors</span>,
                enable <span className="text-white">Allow WebRequest for listed URL</span>, and add{' '}
                <span className="font-mono-num text-[#c8a55b]">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://tcmjournaldesk.vercel.app'}
                </span>
              </div>
              <div>
                2. Press <span className="text-white">F4</span> (MetaEditor) →{' '}
                <span className="text-white">File → Open Data Folder → MQL5/Experts/</span>, save{' '}
                <span className="font-mono-num text-white">TCM_LiveSync.mq5</span>, press{' '}
                <span className="text-white">F7</span> to compile, then drag onto any chart with{' '}
                <span className="text-emerald-300">Algo Trading</span> on.
              </div>
            </div>
          </div>

          {isSelf && (
            <form
              onSubmit={handleChangePin}
              className="bg-[#101218] border border-[#222634] rounded-2xl p-6 space-y-3"
            >
              <div className="flex items-center gap-2 border-b border-[#1e222f] pb-3">
                <KeyRound className="w-4 h-4 text-[#c8a55b]" />
                <h3 className="text-sm font-semibold text-white">Change 6-Digit Access Key (PIN)</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  required
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="Current Key / PIN"
                  className="bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="New 6-Digit Key (6+ chars)"
                  className="bg-[#090b10] border border-[#272c3a] rounded-lg px-3 py-2 text-xs font-mono-num text-white"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-[#1c212e] border border-[#c8a55b]/40 text-xs text-[#e8c87a] hover:bg-[#c8a55b]/15"
              >
                Update Key
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Data Tools */}
      <div className="bg-[#101218] border border-[#222634] rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Journal Data Utilities</h3>
          <p className="text-xs text-[#8d94a5]">
            Restore a JSON backup (deduplicated) or test with sample trades.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#161a24] border border-[#2c3140] text-xs text-white hover:border-[#c8a55b]/50">
            <Upload className="w-3.5 h-3.5 text-[#c8a55b]" />
            Restore JSON
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleRestoreJson(f);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => runBulk('load_examples')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#161a24] border border-[#2c3140] text-xs text-[#e6c77b]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Load Sample Trades
          </button>
          <button
            type="button"
            onClick={() => runBulk('wipe_examples')}
            className="px-3.5 py-2 rounded-xl bg-[#161a24] border border-[#2c3140] text-xs text-[#9ea5b5] hover:text-white"
          >
            Clear Samples
          </button>
          <button
            type="button"
            onClick={() => runBulk('wipe_all')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-500/35 text-xs text-rose-300 hover:bg-rose-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Wipe Desk Trades
          </button>
        </div>
      </div>
    </div>
  );
}
