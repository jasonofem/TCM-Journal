'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { UserProfile } from '@/lib/types';

interface LoginBoardProps {
  dbMode: 'postgres' | 'local_sqlite' | 'unconfigured_vercel';
  hasUsers: boolean;
  hasAdmin: boolean;
  onAuthenticated: (user: UserProfile) => void;
}

export default function LoginBoard({
  dbMode,
  hasAdmin,
  onAuthenticated,
}: LoginBoardProps) {
  const [mode, setMode] = useState<'login' | 'bootstrap'>(hasAdmin ? 'login' : 'bootstrap');

  // Login fields
  const [traderId, setTraderId] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Bootstrap Admin fields
  const [adminId, setAdminId] = useState('TCM-BOSS');
  const [adminName, setAdminName] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [initialCapital, setInitialCapital] = useState('10000');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traderId: traderId.trim().toUpperCase(), pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to sign in.');
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError('Network error while connecting to TCM Desk.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traderId: adminId.trim().toUpperCase(),
          name: adminName.trim(),
          pin: adminPin,
          secret: bootstrapSecret.trim(),
          initialCapital: Number(initialCapital) || 10000,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to initialize Firm Admin.');
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError('Network error while initializing Firm Admin.');
    } finally {
      setLoading(false);
    }
  }

  const dbUnconfigured = dbMode === 'unconfigured_vercel';

  return (
    <div className="tcm-obsidian-grid min-h-screen w-full flex flex-col justify-between px-4 py-8 sm:px-6">
      {/* Top quiet institutional header */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between text-xs text-[#9398a6]">
        <div className="flex items-center gap-2.5">
          <img src="/tcm-logo.svg" alt="Titan Capital Markets" className="w-7 h-7" />
          <span className="tracking-[0.22em] uppercase text-[#c8a55b] font-medium">
            Titan Capital Markets
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono-num">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              dbUnconfigured
                ? 'bg-amber-400 animate-pulse'
                : 'bg-emerald-400'
            }`}
          />
          <span>
            {dbMode === 'postgres'
              ? 'Cloud Database Online'
              : dbMode === 'local_sqlite'
                ? 'Local Desk DB Ready'
                : 'Cloud DB Not Linked'}
          </span>
        </div>
      </header>

      {/* Centered Clean Desk Access Card */}
      <main className="w-full max-w-[440px] mx-auto my-8">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#12151d] border border-[#c8a55b]/30 shadow-[0_0_40px_rgba(200,165,91,0.12)] mb-4">
            <img src="/tcm-logo.svg" alt="TCM Crest" className="w-9 h-9" />
          </div>
          <h1 className="font-serif-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#f6f3eb]">
            Desk Access
          </h1>
          <p className="mt-1.5 text-sm text-[#9398a6]">
            {hasAdmin
              ? 'Enter your Trader ID and PIN to access your execution journal.'
              : 'Initialize the Firm Boss / Admin desk to begin onboarding traders.'}
          </p>
        </div>

        {dbUnconfigured && (
          <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 leading-relaxed">
            <div className="flex items-center gap-2 font-semibold text-amber-300 mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Vercel Postgres Database Required
            </div>
            Add a <code className="font-mono-num bg-black/40 px-1.5 py-0.5 rounded">DATABASE_URL</code>{' '}
            (Neon or Supabase Postgres) in Vercel Project Settings → Environment Variables and redeploy.
            Local storage fallback is intentionally disabled so firm data never disappears.
          </div>
        )}

        <div className="tcm-kpi-card rounded-2xl p-6 sm:p-7 shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
          {/* Show clean pill switcher ONLY when no admin has been created yet */}
          {!hasAdmin && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0a0c10] border border-[#222633] mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('bootstrap');
                  setError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'bootstrap'
                    ? 'bg-[#c8a55b] text-[#0b0c10] shadow-sm font-semibold'
                    : 'text-[#9398a6] hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Initialize Boss Desk
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'login'
                    ? 'bg-[#c8a55b] text-[#0b0c10] shadow-sm font-semibold'
                    : 'text-[#9398a6] hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Sign In
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9398a6] mb-1.5">
                  Trader / Admin ID
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-[#c8a55b]/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={traderId}
                    onChange={(e) => setTraderId(e.target.value.toUpperCase())}
                    placeholder="e.g. TCM-T-003 or TCM-BOSS"
                    className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-xl pl-10 pr-4 py-3 text-sm font-mono-num uppercase tracking-wider text-white placeholder:text-[#555c6e] placeholder:normal-case placeholder:tracking-normal focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9398a6] mb-1.5">
                  Desk PIN
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#c8a55b]/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPin ? 'text' : 'password'}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your PIN"
                    className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-xl pl-10 pr-11 py-3 text-sm font-mono-num text-white placeholder:text-[#555c6e] focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737a8c] hover:text-[#c8a55b] p-1"
                    aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || dbUnconfigured}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#c8a55b] via-[#d7b56b] to-[#b99246] text-[#090a0f] font-semibold text-sm tracking-wide hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_8px_24px_rgba(200,165,91,0.22)]"
              >
                {loading ? 'Verifying Credentials...' : 'Enter Trading Desk'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleBootstrap} className="space-y-3.5">
              <div className="rounded-lg bg-[#c8a55b]/10 border border-[#c8a55b]/25 px-3 py-2 text-[11px] text-[#e7cf98] flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#c8a55b]" />
                First-time setup: creates the Boss / Admin account with full firm-wide oversight.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.12em] text-[#9398a6] mb-1">
                    Boss ID
                  </label>
                  <input
                    type="text"
                    required
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value.toUpperCase())}
                    placeholder="TCM-BOSS"
                    className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-xl px-3.5 py-2.5 text-sm font-mono-num uppercase text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.12em] text-[#9398a6] mb-1">
                    Desk Capital ($)
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(e.target.value)}
                    className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-xl px-3.5 py-2.5 text-sm font-mono-num text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.12em] text-[#9398a6] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Jason Ofem"
                  className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-[#555c6e] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.12em] text-[#9398a6] mb-1">
                  Master PIN (6+ characters)
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    placeholder="Choose a secure 6+ char PIN"
                    className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-xl px-3.5 pr-10 py-2.5 text-sm font-mono-num text-white placeholder:text-[#555c6e] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737a8c] hover:text-[#c8a55b]"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.12em] text-[#9398a6] mb-1">
                  Bootstrap Secret <span className="text-[#5e6577] normal-case">(only if set in env)</span>
                </label>
                <input
                  type="password"
                  value={bootstrapSecret}
                  onChange={(e) => setBootstrapSecret(e.target.value)}
                  placeholder="Leave blank unless ADMIN_BOOTSTRAP_SECRET is set"
                  className="w-full bg-[#090b10] border border-[#272c3a] focus:border-[#c8a55b] rounded-xl px-3.5 py-2.5 text-sm font-mono-num text-white placeholder:text-[#555c6e] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || dbUnconfigured}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#c8a55b] via-[#d7b56b] to-[#b99246] text-[#090a0f] font-semibold text-sm tracking-wide hover:brightness-110 disabled:opacity-50 transition-all shadow-[0_8px_24px_rgba(200,165,91,0.22)]"
              >
                {loading ? 'Creating Firm Master...' : 'Create Boss Desk & Enter'}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Quiet minimal footer */}
      <footer className="max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#666d7e]">
        <div className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-[#c8a55b]/60" />
          <span>Encrypted Server Session · Auto-Deduplicated MT4 / MT5 / Excel Ingestion</span>
        </div>
        <span>Need desk credentials? Contact your Firm Head of Trading.</span>
      </footer>
    </div>
  );
}
