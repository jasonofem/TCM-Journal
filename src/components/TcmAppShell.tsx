'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ComputedTrade,
  FirmOverviewResponse,
  FirmTraderSummary,
  ImportBatchRecord,
  TradeRecord,
  UserProfile,
} from '@/lib/types';
import AdminCommandView from './AdminCommandView';
import AnalyticsView from './AnalyticsView';
import AutoImportPanel from './AutoImportPanel';
import DashboardView from './DashboardView';
import LoginBoard from './LoginBoard';
import Navbar, { AppTab } from './Navbar';
import SettingsSyncView from './SettingsSyncView';
import TradeLogView from './TradeLogView';
import { TradeFormModal, TradeInspectorDrawer } from './TradeModal';

interface TcmAppShellProps {
  initialUser: UserProfile | null;
  initialDbMode: 'postgres' | 'local_sqlite' | 'unconfigured_vercel';
  initialHasUsers: boolean;
  initialHasAdmin: boolean;
}

export default function TcmAppShell({
  initialUser,
  initialDbMode,
  initialHasUsers,
  initialHasAdmin,
}: TcmAppShellProps) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialUser);
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(initialUser);
  const [activeTab, setActiveTab] = useState<AppTab>(
    initialUser?.role === 'admin' ? 'firm' : 'dashboard'
  );

  const [dbMode] = useState(initialDbMode);
  const [hasUsers, setHasUsers] = useState(initialHasUsers);
  const [hasAdmin, setHasAdmin] = useState(initialHasAdmin);

  const [rawTrades, setRawTrades] = useState<TradeRecord[]>([]);
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [firmOverview, setFirmOverview] = useState<FirmOverviewResponse | null>(null);
  const [loadingFirm, setLoadingFirm] = useState(false);

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState<ComputedTrade | null>(null);
  const [inspectingTrade, setInspectingTrade] = useState<{
    trade: ComputedTrade;
    ownerCurrency: string;
  } | null>(null);

  const fetchDeskData = useCallback(async (targetTraderId: string) => {
    const res = await fetch(`/api/trades?traderId=${encodeURIComponent(targetTraderId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.targetUser) {
      setInspectedUser(data.targetUser);
    }
    setRawTrades(data.trades || []);
    setBatches(data.batches || []);
  }, []);

  const fetchFirmOverview = useCallback(async () => {
    setLoadingFirm(true);
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as FirmOverviewResponse;
        setFirmOverview(data);
      }
    } finally {
      setLoadingFirm(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!currentUser) return;
    const target = inspectedUser || currentUser;
    await fetchDeskData(target.traderId);
    if (currentUser.role === 'admin') {
      await fetchFirmOverview();
    }
  }, [currentUser, inspectedUser, fetchDeskData, fetchFirmOverview]);

  useEffect(() => {
    if (!currentUser) return;
    const targetId = inspectedUser?.traderId || currentUser.traderId;
    fetchDeskData(targetId);
    if (currentUser.role === 'admin') {
      fetchFirmOverview();
    }
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAuthenticated(user: UserProfile) {
    setCurrentUser(user);
    setInspectedUser(user);
    setHasUsers(true);
    if (user.role === 'admin') setHasAdmin(true);
    setActiveTab(user.role === 'admin' ? 'firm' : 'dashboard');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    setInspectedUser(null);
    setRawTrades([]);
    setBatches([]);
    setFirmOverview(null);
  }

  async function handleDeleteTrade(id: string) {
    const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await refreshAll();
    }
  }

  function handleInspectTrader(
    target: FirmTraderSummary['user'],
    goToTab: 'dashboard' | 'import' | 'trades' = 'dashboard'
  ) {
    setInspectedUser({ ...target, apiToken: '' });
    fetchDeskData(target.traderId);
    setActiveTab(goToTab);
  }

  function handleReturnToOwnDesk() {
    if (!currentUser) return;
    setInspectedUser(currentUser);
    fetchDeskData(currentUser.traderId);
    setActiveTab('dashboard');
  }

  function handleExportExcel() {
    if (!inspectedUser) return;
    window.location.href = `/api/export/excel?traderId=${encodeURIComponent(inspectedUser.traderId)}`;
  }

  if (!currentUser || !inspectedUser) {
    return (
      <LoginBoard
        dbMode={dbMode}
        hasUsers={hasUsers}
        hasAdmin={hasAdmin}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#08090c] text-[#f3f1ec] flex flex-col">
      <Navbar
        currentUser={currentUser}
        inspectedUser={inspectedUser}
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'firm' && currentUser.role === 'admin') {
            fetchFirmOverview();
          }
        }}
        onReturnToOwnDesk={handleReturnToOwnDesk}
        onOpenNewTrade={() => {
          setEditingTrade(null);
          setShowOrderModal(true);
        }}
        onExportExcel={handleExportExcel}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'firm' && currentUser.role === 'admin' && (
          <AdminCommandView
            overview={firmOverview}
            loading={loadingFirm}
            onRefresh={fetchFirmOverview}
            onInspectTrader={handleInspectTrader}
            onSelectFirmTrade={(trade, owner) =>
              setInspectingTrade({ trade, ownerCurrency: owner.currency })
            }
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            user={inspectedUser}
            rawTrades={rawTrades}
            onGoToImport={() => setActiveTab('import')}
            onSelectTrade={(t) =>
              setInspectingTrade({ trade: t, ownerCurrency: inspectedUser.currency })
            }
          />
        )}

        {activeTab === 'import' && (
          <AutoImportPanel
            targetUser={inspectedUser}
            batches={batches}
            onCommitted={refreshAll}
          />
        )}

        {activeTab === 'trades' && (
          <TradeLogView
            user={inspectedUser}
            rawTrades={rawTrades}
            onSelectTrade={(t) =>
              setInspectingTrade({ trade: t, ownerCurrency: inspectedUser.currency })
            }
            onEditTrade={(t) => {
              setEditingTrade(t);
              setShowOrderModal(true);
            }}
            onDeleteTrade={handleDeleteTrade}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView user={inspectedUser} rawTrades={rawTrades} />
        )}

        {activeTab === 'settings' && (
          <SettingsSyncView
            currentUser={currentUser}
            targetUser={inspectedUser}
            onUpdated={async () => {
              await refreshAll();
              if (inspectedUser.id === currentUser.id) {
                const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
                if (meRes.ok) {
                  const d = await meRes.json();
                  if (d.user) setCurrentUser(d.user);
                }
              }
            }}
          />
        )}
      </main>

      {showOrderModal && (
        <TradeFormModal
          initialTrade={editingTrade}
          targetUser={inspectedUser}
          onClose={() => {
            setShowOrderModal(false);
            setEditingTrade(null);
          }}
          onSaved={refreshAll}
        />
      )}

      {inspectingTrade && (
        <TradeInspectorDrawer
          trade={inspectingTrade.trade}
          currency={inspectingTrade.ownerCurrency}
          isAdmin={currentUser.role === 'admin'}
          onClose={() => setInspectingTrade(null)}
          onEdit={(t) => {
            setInspectingTrade(null);
            setEditingTrade(t);
            setShowOrderModal(true);
          }}
          onDelete={handleDeleteTrade}
          onRefresh={refreshAll}
        />
      )}
    </div>
  );
}
