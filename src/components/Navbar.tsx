'use client';

import React from 'react';
import {
  ArrowLeft,
  BarChart3,
  Crown,
  Download,
  FileUp,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Plus,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { UserProfile } from '@/lib/types';

export type AppTab =
  | 'firm'
  | 'dashboard'
  | 'import'
  | 'trades'
  | 'analytics'
  | 'settings';

interface NavbarProps {
  currentUser: UserProfile;
  inspectedUser: UserProfile;
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
  onReturnToOwnDesk: () => void;
  onOpenNewTrade: () => void;
  onExportExcel: () => void;
  onLogout: () => void;
}

export default function Navbar({
  currentUser,
  inspectedUser,
  activeTab,
  onChangeTab,
  onReturnToOwnDesk,
  onOpenNewTrade,
  onExportExcel,
  onLogout,
}: NavbarProps) {
  const isBoss = currentUser.role === 'admin';
  const isInspectingOther = inspectedUser.id !== currentUser.id;

  const tabs: Array<{ id: AppTab; label: string; icon: React.ReactNode; bossOnly?: boolean }> = [
    ...(isBoss
      ? [{ id: 'firm' as AppTab, label: 'Firm Command', icon: <Crown className="w-4 h-4" /> }]
      : []),
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'import', label: 'Auto-Sync', icon: <FileUp className="w-4 h-4" /> },
    { id: 'trades', label: 'Trade Log', icon: <ListOrdered className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="sticky top-0 z-30 backdrop-blur-md bg-[#08090c]/90 border-b border-[#222633]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Left brand */}
        <div className="flex items-center gap-3 min-w-0">
          <img src="/tcm-logo.svg" alt="TCM" className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif-display text-lg sm:text-xl font-semibold text-[#f5f2ea] truncate">
                Titan Capital Markets
              </span>
              {isBoss && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#c8a55b]/15 text-[#e4c277] border border-[#c8a55b]/30">
                  <Crown className="w-3 h-3" /> Boss
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#8d94a5] font-mono-num truncate">
              {currentUser.traderId} · {currentUser.name}
            </div>
          </div>
        </div>

        {/* Center Tabs */}
        <nav className="hidden lg:flex items-center gap-1 bg-[#10131a] p-1 rounded-xl border border-[#232836]">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChangeTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  active
                    ? t.id === 'import'
                      ? 'bg-[#c8a55b] text-[#090a0f] font-semibold shadow-sm'
                      : 'bg-[#1f2432] text-[#f3dfb0] border border-[#c8a55b]/30'
                    : 'text-[#9398a6] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChangeTab('import')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#c8a55b]/15 hover:bg-[#c8a55b]/25 text-[#e3c379] border border-[#c8a55b]/35 transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" />
            Sync Report
          </button>

          <button
            onClick={onOpenNewTrade}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#c8a55b] hover:bg-[#d8b66c] text-[#090a0f] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log Trade</span>
          </button>

          <button
            onClick={onExportExcel}
            title="Download Official TCM Excel Workbook (.xlsx)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#141720] hover:bg-[#1b1f2b] text-[#cdd2df] border border-[#272c3a] transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#c8a55b]" />
            <span className="hidden xl:inline">.XLSX</span>
          </button>

          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-2 rounded-lg text-[#8d94a5] hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/25 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile horizontal nav */}
      <div className="lg:hidden border-t border-[#1b1f2a] px-3 py-1.5 flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChangeTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 flex items-center gap-1.5 ${
                active
                  ? 'bg-[#c8a55b] text-[#090a0f] font-semibold'
                  : 'text-[#9398a6] hover:text-white'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Boss Inspection Context Bar */}
      {isInspectingOther && (
        <div className="bg-gradient-to-r from-[#c8a55b]/20 via-[#c8a55b]/10 to-transparent border-t border-[#c8a55b]/35 px-4 sm:px-6 py-2">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#f1da9f]">
              <ShieldAlert className="w-4 h-4 text-[#c8a55b]" />
              <span>
                <strong>Boss Inspection Mode:</strong> Viewing{' '}
                <span className="font-mono-num font-semibold">{inspectedUser.traderId}</span> ·{' '}
                {inspectedUser.name} ({inspectedUser.tier} · {inspectedUser.accountName})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChangeTab('firm')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0d1016] border border-[#c8a55b]/40 text-[#f1da9f] hover:bg-[#171c26]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Firm Command
              </button>
              <button
                onClick={onReturnToOwnDesk}
                className="px-2.5 py-1 rounded-md text-[#9ea5b5] hover:text-white"
              >
                Switch to My Desk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
