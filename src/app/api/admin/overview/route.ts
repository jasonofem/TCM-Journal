import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listAllTrades,
  listRecentFirmBatches,
  listUsers,
} from '@/lib/db';
import { computeJournalMetrics } from '@/lib/trading-math';
import {
  ComputedTrade,
  FirmOverviewResponse,
  FirmTraderSummary,
  TradeRecord,
} from '@/lib/types';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const [users, allTrades, recentBatches] = await Promise.all([
      listUsers(),
      listAllTrades(),
      listRecentFirmBatches(),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const tradesByUser = new Map<string, TradeRecord[]>();
    for (const t of allTrades) {
      const arr = tradesByUser.get(t.userId);
      if (arr) arr.push(t);
      else tradesByUser.set(t.userId, [t]);
    }

    const userMap = new Map(users.map((u) => [u.id, u]));
    const lastBatchByUser = new Map<string, string>();
    for (const b of recentBatches) {
      if (!lastBatchByUser.has(b.userId)) {
        lastBatchByUser.set(b.userId, b.createdAt);
      }
    }

    const allComputedWithMeta: Array<
      ComputedTrade & { traderIdCode: string; traderName: string }
    > = [];

    let totalInitialCapital = 0;
    let totalCurrentEquity = 0;
    let combinedNetPnl = 0;
    let combinedClosedTrades = 0;
    let combinedOpenTrades = 0;
    let totalFirmWins = 0;
    let totalFirmLosses = 0;
    let totalFirmGrossProfit = 0;
    let totalFirmGrossLoss = 0;
    let dllBreachCount = 0;
    let tradesToday = 0;

    const traders: FirmTraderSummary[] = users.map((u) => {
      const uTrades = tradesByUser.get(u.id) || [];
      const { computedTrades, metrics } = computeJournalMetrics(uTrades, {
        initialCapital: u.initialCapital,
        defaultRiskPct: u.defaultRiskPct,
        breakevenThreshold: u.breakevenThreshold,
        dailyLossLimitPct: u.dailyLossLimitPct,
        timezoneOffsetHours: u.timezoneOffsetHours,
      });

      const noSlCount = computedTrades.filter(
        (t) => t.stopLoss === null || t.stopLoss <= 0
      ).length;

      const lastTradeDate =
        computedTrades.length > 0
          ? computedTrades
              .map((t) => t.exitDate || t.entryDate)
              .sort()
              .pop() || null
          : null;

      tradesToday += computedTrades.filter(
        (t) => t.entryDate === todayStr || t.exitDate === todayStr
      ).length;

      totalInitialCapital += u.initialCapital;
      totalCurrentEquity += metrics.currentEquity;
      combinedNetPnl += metrics.totalNetPnl;
      combinedClosedTrades += metrics.closedCount;
      combinedOpenTrades += metrics.openCount;
      totalFirmWins += metrics.wins;
      totalFirmLosses += metrics.losses;
      totalFirmGrossProfit += metrics.grossProfit;
      totalFirmGrossLoss += metrics.grossLoss;
      if (metrics.dllBreachedToday) dllBreachCount++;

      for (const ct of computedTrades) {
        allComputedWithMeta.push({
          ...ct,
          traderIdCode: u.traderId,
          traderName: u.name,
        });
      }

      const { apiToken: _hidden, ...safeUser } = u;

      return {
        user: safeUser,
        metrics: {
          totalTrades: computedTrades.length,
          closedTrades: metrics.closedCount,
          openTrades: metrics.openCount,
          wins: metrics.wins,
          losses: metrics.losses,
          breakeven: metrics.breakeven,
          winRate: metrics.winRate,
          totalNetPnl: metrics.totalNetPnl,
          currentEquity: metrics.currentEquity,
          roiPct: metrics.roiPct,
          profitFactor: metrics.profitFactor,
          maxDrawdownPct: metrics.maxDrawdownPct,
          todayPnl: metrics.todayPnl,
          todayLossPct: metrics.todayLossPct,
          dllBreachedToday: metrics.dllBreachedToday,
          noSlCount,
          lastTradeDate,
          lastSyncAt: lastBatchByUser.get(u.id) || null,
        },
      };
    });

    allComputedWithMeta.sort((a, b) => b.entryDatetime.localeCompare(a.entryDatetime));

    const decided = totalFirmWins + totalFirmLosses;
    const firmWinRate = decided > 0 ? (totalFirmWins / decided) * 100 : null;
    const firmProfitFactor =
      totalFirmGrossLoss > 0
        ? totalFirmGrossProfit / totalFirmGrossLoss
        : totalFirmGrossProfit > 0
          ? null
          : null;

    const overview: FirmOverviewResponse = {
      firmTotals: {
        traderCount: users.filter((u) => u.role === 'trader').length,
        activeTraders: users.filter((u) => u.role === 'trader' && u.isActive).length,
        totalInitialCapital,
        totalCurrentEquity,
        combinedNetPnl,
        combinedClosedTrades,
        combinedOpenTrades,
        firmWinRate,
        firmProfitFactor,
        dllBreachCount,
        tradesToday,
      },
      traders,
      recentFirmTrades: allComputedWithMeta.slice(0, 100),
      recentBatches: recentBatches.map((b) => {
        const owner = userMap.get(b.userId);
        return {
          ...b,
          traderIdCode: owner?.traderId || '—',
          traderName: owner?.name || 'Unknown',
        };
      }),
    };

    return NextResponse.json(overview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load firm overview.' },
      { status: 500 }
    );
  }
}
