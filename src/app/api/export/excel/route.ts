import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserByTraderId, listTradesByUser } from '@/lib/db';
import { buildTraderWorkbookBuffer } from '@/lib/excel-export';
import { computeJournalMetrics } from '@/lib/trading-math';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let targetUser = user;
  const traderId = req.nextUrl.searchParams.get('traderId');
  if (traderId && traderId !== user.traderId) {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const found = await getUserByTraderId(traderId);
    if (!found) {
      return NextResponse.json({ error: 'Trader desk not found' }, { status: 404 });
    }
    targetUser = found;
  }

  const rawTrades = await listTradesByUser(targetUser.id);
  const { computedTrades, metrics } = computeJournalMetrics(rawTrades, {
    initialCapital: targetUser.initialCapital,
    defaultRiskPct: targetUser.defaultRiskPct,
    breakevenThreshold: targetUser.breakevenThreshold,
    dailyLossLimitPct: targetUser.dailyLossLimitPct,
  });

  const buffer = buildTraderWorkbookBuffer(targetUser, computedTrades, metrics);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `TCM_Journal_${targetUser.traderId}_${dateStr}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
