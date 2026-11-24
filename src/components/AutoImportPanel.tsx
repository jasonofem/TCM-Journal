'use client';

import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  FileUp,
  History,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { SETUPS, TIMEFRAMES, TRADING_SESSIONS } from '@/lib/trading-math';
import {
  ClassifiedImportRow,
  ImportBatchRecord,
  ImportPreviewResponse,
  TradingSession,
  UserProfile,
} from '@/lib/types';
import { formatMoney, formatPrice, formatRelativeTime } from '@/lib/format';

interface AutoImportPanelProps {
  targetUser: UserProfile;
  batches: ImportBatchRecord[];
  onCommitted: () => Promise<void> | void;
}

export default function AutoImportPanel({
  targetUser,
  batches,
  onCommitted,
}: AutoImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rawText, setRawText] = useState('');
  const [timezoneOffsetHours, setTimezoneOffsetHours] = useState<number>(
    targetUser.timezoneOffsetHours ?? 1
  );
  const [defaultSetup, setDefaultSetup] = useState<string>('H1 5050 Bounce');
  const [defaultTimeframe, setDefaultTimeframe] = useState<string>('H1');

  const [scanning, setScanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [rows, setRows] = useState<ClassifiedImportRow[]>([]);
  const [rowFilter, setRowFilter] = useState<'all' | 'actionable' | 'duplicates'>('all');

  async function scanFile(file: File) {
    setError(null);
    setSuccessMsg(null);
    setScanning(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('targetTraderId', targetUser.traderId);
      form.append('timezoneOffsetHours', String(timezoneOffsetHours));
      form.append('defaultSetup', defaultSetup);
      form.append('defaultTimeframe', defaultTimeframe);

      const res = await fetch('/api/trades/import/preview', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as ImportPreviewResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Failed to parse report.');
        return;
      }
      setPreview(data);
      setRows(data.items || []);
    } catch {
      setError('Failed to upload and parse report file.');
    } finally {
      setScanning(false);
    }
  }

  async function scanPastedText() {
    if (!rawText.trim()) {
      setError('Paste MT4/MT5 HTML source, Excel rows, CSV, or JSON first.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setScanning(true);
    try {
      const res = await fetch('/api/trades/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          fileName: 'pasted-broker-report.txt',
          targetTraderId: targetUser.traderId,
          timezoneOffsetHours,
          defaultSetup,
          defaultTimeframe,
        }),
      });
      const data = (await res.json()) as ImportPreviewResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Could not parse pasted text.');
        return;
      }
      setPreview(data);
      setRows(data.items || []);
    } catch {
      setError('Network error while scanning report.');
    } finally {
      setScanning(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    const selected = rows.filter((r) => r.include && r.action !== 'SKIP_DUPLICATE');
    if (selected.length === 0) {
      setError('All parsed trades are already in the journal or unchecked.');
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      const res = await fetch('/api/trades/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: preview.fileName,
          sourceType: preview.detectedFormat,
          timezoneOffsetHours,
          targetTraderId: targetUser.traderId,
          items: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to commit trades.');
        return;
      }
      setSuccessMsg(
        `Synced cleanly into ${targetUser.traderId}: +${data.insertedCount} new added, ${data.updatedCount} open position(s) closed, ${data.skippedCount} duplicate(s) skipped.`
      );
      setPreview(null);
      setRows([]);
      setRawText('');
      await onCommitted();
    } catch {
      setError('Network error while committing trades.');
    } finally {
      setCommitting(false);
    }
  }

  function toggleRowInclude(idx: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, include: !r.include } : r))
    );
  }

  function updateRowField(
    idx: number,
    field: 'session' | 'setup' | 'timeframe',
    value: string
  ) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              [field]:
                field === 'session'
                  ? (value as TradingSession)
                  : field === 'timeframe'
                    ? value || null
                    : value,
            }
          : r
      )
    );
  }

  const actionableCount = rows.filter((r) => r.include && r.action !== 'SKIP_DUPLICATE').length;
  const displayedRows = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => {
      if (rowFilter === 'actionable') return r.action !== 'SKIP_DUPLICATE';
      if (rowFilter === 'duplicates') return r.action === 'SKIP_DUPLICATE';
      return true;
    });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="tcm-kpi-card rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[#c8a55b] font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Automated Trade Ingestion & Deduplication
          </div>
          <h2 className="font-serif-display text-2xl sm:text-3xl text-white mt-1">
            Upload or Paste Any Broker Report
          </h2>
          <p className="text-xs sm:text-sm text-[#9398a6] mt-1 max-w-3xl">
            Drop an <strong>MT4 HTML Statement</strong>, <strong>MT5 Trade History Report</strong>{' '}
            (UTF-16LE HTML or Excel), <strong>TCM Excel Workbook</strong>, or{' '}
            <strong>CSV/TSV</strong>. We fingerprint every ticket, timestamp, price, and lot size so
            you can re-upload your full month statement every day and <strong>only new trades</strong>{' '}
            (or newly closed open trades) are synced.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs bg-[#0b0d12] border border-[#242936] rounded-xl px-4 py-2.5 shrink-0">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="text-[#9398a6]">Target Desk</div>
            <div className="font-mono-num font-semibold text-white">
              {targetUser.traderId} · {targetUser.name}
            </div>
          </div>
        </div>
      </div>

      {/* Parsing Defaults Bar */}
      <div className="bg-[#101218] border border-[#222634] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-[#8d94a5] mb-1">
            Report Server Timezone (for Session Tagging)
          </label>
          <select
            value={timezoneOffsetHours}
            onChange={(e) => setTimezoneOffsetHours(Number(e.target.value))}
            className="w-full bg-[#090b10] border border-[#262b38] rounded-lg px-3 py-2 text-xs text-white focus:border-[#c8a55b] focus:outline-none"
          >
            <option value={0}>UTC+0 (London GMT)</option>
            <option value={1}>UTC+1 (WAT Lagos / BST)</option>
            <option value={2}>UTC+2 (Broker Server EET Winter)</option>
            <option value={3}>UTC+3 (Broker Server EEST Summer)</option>
            <option value={-5}>UTC-5 (New York EST)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-[#8d94a5] mb-1">
            Default Setup (when report has none)
          </label>
          <select
            value={defaultSetup}
            onChange={(e) => setDefaultSetup(e.target.value)}
            className="w-full bg-[#090b10] border border-[#262b38] rounded-lg px-3 py-2 text-xs text-white focus:border-[#c8a55b] focus:outline-none"
          >
            {SETUPS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-[#8d94a5] mb-1">
            Default Timeframe
          </label>
          <select
            value={defaultTimeframe}
            onChange={(e) => setDefaultTimeframe(e.target.value)}
            className="w-full bg-[#090b10] border border-[#262b38] rounded-lg px-3 py-2 text-xs text-white focus:border-[#c8a55b] focus:outline-none"
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

      {/* Feedback Alerts */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Dual Dropzone + Paste Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Drop File */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) scanFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-7 flex flex-col items-center justify-center text-center transition-all min-h-[220px] ${
            dragOver
              ? 'border-[#c8a55b] bg-[#c8a55b]/10'
              : 'border-[#2a3040] bg-[#101218] hover:border-[#c8a55b]/60 hover:bg-[#13161f]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.xlsx,.xls,.csv,.tsv,.txt,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) scanFile(f);
              e.target.value = '';
            }}
          />
          <div className="w-12 h-12 rounded-2xl bg-[#c8a55b]/15 border border-[#c8a55b]/35 flex items-center justify-center mb-3">
            {scanning ? (
              <RefreshCw className="w-6 h-6 text-[#c8a55b] animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6 text-[#c8a55b]" />
            )}
          </div>
          <div className="text-sm font-semibold text-white">
            Drop Broker Statement or Excel File Here
          </div>
          <p className="text-xs text-[#8d94a5] mt-1 max-w-sm">
            Supports <span className="text-[#d9c18a]">MT4 .htm/.html</span>,{' '}
            <span className="text-[#d9c18a]">MT5 .html / .xlsx</span>,{' '}
            <span className="text-[#d9c18a]">TCM / C5_TradeLog .xlsx</span>,{' '}
            <span className="text-[#d9c18a]">.csv</span>, and{' '}
            <span className="text-[#d9c18a]">.json</span>.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#191d28] border border-[#2c3244] text-xs text-[#e5e2da]">
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#c8a55b]" />
            Choose File from Device
          </span>
        </div>

        {/* Paste Anything */}
        <div className="bg-[#101218] border border-[#222634] rounded-2xl p-5 flex flex-col justify-between min-h-[220px]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <ClipboardPaste className="w-4 h-4 text-[#c8a55b]" />
              Or Paste HTML / Copied Broker Rows / Excel / CSV
            </div>
            {rawText && (
              <button
                type="button"
                onClick={() => setRawText('')}
                className="text-[11px] text-[#7f8698] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Paste raw MT4/MT5 HTML source, or copy rows directly from MT4/MT5/Excel:\n2026.11.20 08:15:00\t84920145\tEURUSD\tbuy\t0.50\t1.08420\t1.08320\t1.08670\t2026.11.20 11:40:00\t1.08670\t0.00\t0.00\t125.00`}
            rows={6}
            className="w-full flex-1 bg-[#090b10] border border-[#262b38] focus:border-[#c8a55b] rounded-xl p-3 text-xs font-mono-num text-[#e7e4dc] placeholder:text-[#555c6e] focus:outline-none resize-none"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#7d8496]">
              Dry-run preview runs before writing anything to DB.
            </span>
            <button
              type="button"
              onClick={scanPastedText}
              disabled={scanning || !rawText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c8a55b] hover:bg-[#d8b66c] disabled:opacity-45 text-[#090a0f] font-semibold text-xs transition-all"
            >
              <FileUp className="w-3.5 h-3.5" />
              {scanning ? 'Scanning...' : 'Scan & Deduplicate'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Table */}
      {preview && (
        <div className="bg-[#101218] border border-[#c8a55b]/40 rounded-2xl overflow-hidden shadow-[0_16px_50px_rgba(0,0,0,0.5)]">
          <div className="p-5 bg-[#131722] border-b border-[#232836] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-[#c8a55b]/20 text-[#e7c77a] border border-[#c8a55b]/35 text-[11px] font-semibold">
                  {preview.detectedFormat}
                </span>
                <span className="text-xs font-mono-num text-[#b8becb]">{preview.fileName}</span>
                {preview.accountMeta.accountNumber && (
                  <span className="text-xs font-mono-num text-[#8d94a5]">
                    · Acct #{preview.accountMeta.accountNumber}
                    {preview.accountMeta.reportedBalance !== null
                      ? ` · Bal ${formatMoney(preview.accountMeta.reportedBalance, targetUser.currency)}`
                      : ''}
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs font-mono-num">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  +{preview.stats.newCount} New Trades
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#c8a55b]/15 text-[#e6c677] border border-[#c8a55b]/35">
                  {preview.stats.updateCount} Open → Closed Updates
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#1c202c] text-[#9ea5b5] border border-[#2b3040]">
                  {preview.stats.duplicateCount} Already in Journal (Skipped)
                </span>
                {preview.stats.ignoredRows > 0 && (
                  <span className="text-[11px] text-[#787f90]">
                    ({preview.stats.ignoredRows} balance/pending rows ignored)
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setRows([]);
                }}
                className="px-3.5 py-2 rounded-xl border border-[#2c3140] text-xs text-[#9ea5b5] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing || actionableCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#c8a55b] to-[#dfb96c] text-[#090a0f] font-semibold text-xs hover:brightness-110 disabled:opacity-45 shadow-[0_6px_20px_rgba(200,165,91,0.25)]"
              >
                <CheckCircle2 className="w-4 h-4" />
                {committing
                  ? 'Syncing...'
                  : actionableCount > 0
                    ? `Commit ${actionableCount} Trade${actionableCount === 1 ? '' : 's'} to Journal`
                    : 'Everything Already Synced'}
              </button>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-200">
              {preview.warnings.join(' · ')}
            </div>
          )}

          {/* Filter pills */}
          <div className="px-5 py-2.5 border-b border-[#1d212e] flex items-center gap-2 text-xs">
            {(
              [
                ['all', `All Parsed (${rows.length})`],
                [
                  'actionable',
                  `New & Updates (${preview.stats.newCount + preview.stats.updateCount})`,
                ],
                ['duplicates', `Duplicates (${preview.stats.duplicateCount})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRowFilter(id)}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  rowFilter === id
                    ? 'bg-[#c8a55b]/20 text-[#e7c77a] border border-[#c8a55b]/35 font-medium'
                    : 'text-[#8e95a6] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto max-h-[460px]">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-[#0b0d12] text-[#848b9c] uppercase text-[10px] tracking-wider z-10">
                <tr>
                  <th className="px-3 py-2.5">Sync</th>
                  <th className="px-3 py-2.5">Action / Dedupe Status</th>
                  <th className="px-3 py-2.5">Ticket</th>
                  <th className="px-3 py-2.5">Entry Time</th>
                  <th className="px-3 py-2.5">Pair</th>
                  <th className="px-3 py-2.5">Side</th>
                  <th className="px-3 py-2.5 text-right">Lots</th>
                  <th className="px-3 py-2.5 text-right">Entry → Exit</th>
                  <th className="px-3 py-2.5 text-right">Broker P&L</th>
                  <th className="px-3 py-2.5">Session</th>
                  <th className="px-3 py-2.5">Setup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1e29]">
                {displayedRows.map(({ r, idx }) => {
                  const isDup = r.action === 'SKIP_DUPLICATE';
                  return (
                    <tr
                      key={r.candidate.tempId + idx}
                      className={isDup ? 'opacity-55 bg-[#0c0e13]' : 'hover:bg-white/[0.02]'}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          disabled={isDup}
                          checked={r.include && !isDup}
                          onChange={() => toggleRowInclude(idx)}
                          className="accent-[#c8a55b] w-3.5 h-3.5"
                        />
                      </td>
                      <td className="px-3 py-2.5 max-w-[230px]">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            r.action === 'NEW'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : r.action === 'UPDATE_CLOSE'
                                ? 'bg-[#c8a55b]/20 text-[#e7c77a]'
                                : 'bg-[#202533] text-[#8d94a5]'
                          }`}
                        >
                          {r.action === 'NEW'
                            ? 'NEW TRADE'
                            : r.action === 'UPDATE_CLOSE'
                              ? 'CLOSE OPEN'
                              : 'DUPLICATE'}
                        </span>
                        <div className="text-[10px] text-[#7f8698] mt-0.5 truncate" title={r.reason}>
                          {r.reason}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono-num text-[#9398a6]">
                        {r.candidate.brokerTicket || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono-num text-[#cbd0dc] whitespace-nowrap">
                        {r.candidate.entryDatetime}
                      </td>
                      <td className="px-3 py-2.5 font-mono-num font-semibold text-white">
                        {r.candidate.pair}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            r.candidate.position === 'Buy'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {r.candidate.position.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num">
                        {r.candidate.lots.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num whitespace-nowrap text-[#cbd0dc]">
                        {formatPrice(r.candidate.entryPrice, r.candidate.pair)} →{' '}
                        {r.candidate.isOpen ? (
                          <span className="text-sky-300">OPEN</span>
                        ) : (
                          formatPrice(r.candidate.exitPrice, r.candidate.pair)
                        )}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono-num font-semibold ${
                          r.candidate.brokerPnl === null
                            ? 'text-[#7f8698]'
                            : r.candidate.brokerPnl >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {formatMoney(r.candidate.brokerPnl, targetUser.currency, true)}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          disabled={isDup}
                          value={r.session}
                          onChange={(e) => updateRowField(idx, 'session', e.target.value)}
                          className="bg-[#090b10] border border-[#262b38] rounded px-2 py-1 text-[11px] text-white"
                        >
                          {TRADING_SESSIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          disabled={isDup}
                          value={r.setup}
                          onChange={(e) => updateRowField(idx, 'setup', e.target.value)}
                          className="bg-[#090b10] border border-[#262b38] rounded px-2 py-1 text-[11px] text-white"
                        >
                          {SETUPS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Sync History */}
      <div className="bg-[#101218] border border-[#222634] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e222f] flex items-center gap-2">
          <History className="w-4 h-4 text-[#c8a55b]" />
          <h3 className="text-sm font-semibold text-white">Sync Audit History</h3>
        </div>
        {batches.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#6f7687]">
            No automated sync batches recorded yet on this desk.
          </div>
        ) : (
          <div className="divide-y divide-[#1a1e29]">
            {batches.map((b) => (
              <div
                key={b.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-medium text-white">{b.fileName}</div>
                  <div className="text-[11px] text-[#7f8698]">
                    {b.sourceType} · TZ UTC+{b.reportTimezoneOffset} · {formatRelativeTime(b.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono-num">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                    +{b.insertedCount} added
                  </span>
                  {b.updatedCount > 0 && (
                    <span className="px-2 py-0.5 rounded bg-[#c8a55b]/20 text-[#e7c77a]">
                      {b.updatedCount} closed
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-[#1b1f2b] text-[#8d94a5]">
                    {b.skippedCount} skipped
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
