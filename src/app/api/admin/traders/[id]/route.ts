import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPin } from '@/lib/auth';
import { deleteUserRecord, getUserById, updateUserRecord } from '@/lib/db';
import { UserRole } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: 'Desk not found' }, { status: 404 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      tier?: string;
      role?: UserRole;
      accountNumber?: string | null;
      accountName?: string;
      initialCapital?: number;
      dailyLossLimitPct?: number;
      defaultRiskPct?: number;
      isActive?: boolean;
      newPin?: string;
    };

    if (body.newPin !== undefined && body.newPin.trim().length < 6) {
      return NextResponse.json(
        { error: 'Access key must be at least 6 characters (e.g. a 6-digit numeric key).' },
        { status: 400 }
      );
    }

    const updated = await updateUserRecord(id, {
      name: body.name,
      tier: body.tier,
      role: body.role,
      accountNumber: body.accountNumber,
      accountName: body.accountName,
      initialCapital: body.initialCapital,
      dailyLossLimitPct: body.dailyLossLimitPct,
      defaultRiskPct: body.defaultRiskPct,
      isActive: body.isActive,
      pinHash: body.newPin ? hashPin(body.newPin.trim()) : undefined,
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update trader desk' },
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
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await context.params;
  if (id === user.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own active Admin desk.' },
      { status: 400 }
    );
  }

  await deleteUserRecord(id);
  return NextResponse.json({ ok: true });
}
