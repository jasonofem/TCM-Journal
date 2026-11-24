import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  deleteTradeRecord,
  getTradeById,
  getUserById,
  updateTradeRecord,
} from '@/lib/db';
import { TradeInput } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getTradeById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  }

  if (existing.userId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as Partial<TradeInput> & {
      adminReviewNote?: string | null;
    };

    // Non-admin cannot set adminReviewNote
    if (user.role !== 'admin') {
      delete body.adminReviewNote;
    }

    const owner = await getUserById(existing.userId);
    const updated = await updateTradeRecord(
      id,
      body,
      owner?.timezoneOffsetHours ?? user.timezoneOffsetHours
    );
    return NextResponse.json({ trade: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update trade' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getTradeById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  }

  if (existing.userId !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deleteTradeRecord(id);
  return NextResponse.json({ ok: true });
}
