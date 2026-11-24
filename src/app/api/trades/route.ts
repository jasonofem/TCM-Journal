import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createTradeRecord,
  getUserById,
  getUserByTraderId,
  listImportBatchesByUser,
  listTradesByUser,
} from '@/lib/db';
import { TradeInput } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestedTraderId = req.nextUrl.searchParams.get('traderId');
  let targetUser = user;

  if (requestedTraderId && requestedTraderId !== user.traderId && requestedTraderId !== user.id) {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const found =
      (await getUserByTraderId(requestedTraderId)) || (await getUserById(requestedTraderId));
    if (!found) {
      return NextResponse.json({ error: 'Trader desk not found' }, { status: 404 });
    }
    targetUser = found;
  }

  const [trades, batches] = await Promise.all([
    listTradesByUser(targetUser.id),
    listImportBatchesByUser(targetUser.id),
  ]);

  return NextResponse.json({
    targetUser,
    trades,
    batches,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as TradeInput & { targetTraderId?: string };
    let targetUser = user;
    if (body.targetTraderId && body.targetTraderId !== user.traderId) {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const found = await getUserByTraderId(body.targetTraderId);
      if (!found) {
        return NextResponse.json({ error: 'Target trader not found' }, { status: 404 });
      }
      targetUser = found;
    }

    if (!body.pair || !body.entryDate || !body.entryPrice || !body.lots) {
      return NextResponse.json(
        { error: 'Pair, entry date, lots, and entry price are required.' },
        { status: 400 }
      );
    }

    const trade = await createTradeRecord(targetUser.id, body, {
      timezoneOffsetHours: targetUser.timezoneOffsetHours,
    });
    return NextResponse.json({ trade }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to log trade.' },
      { status: 500 }
    );
  }
}
