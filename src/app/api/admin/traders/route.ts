import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPin } from '@/lib/auth';
import { createUserRecord, getUserByTraderId } from '@/lib/db';
import { UserRole } from '@/lib/types';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      traderId?: string;
      name?: string;
      email?: string | null;
      role?: UserRole;
      tier?: string;
      pin?: string;
      accountNumber?: string | null;
      accountName?: string;
      initialCapital?: number;
      currency?: string;
      defaultRiskPct?: number;
      dailyLossLimitPct?: number;
      timezoneOffsetHours?: number;
    };

    const traderId = (body.traderId || '').trim().toUpperCase();
    const name = (body.name || '').trim();
    const pin = (body.pin || '').trim();

    if (!traderId || traderId.length < 3) {
      return NextResponse.json(
        { error: 'Trader ID must be at least 3 characters (e.g. TCM-T-003).' },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: 'Trader name is required.' }, { status: 400 });
    }
    if (pin.length < 4) {
      return NextResponse.json(
        { error: 'Temporary PIN must be at least 4 characters (6+ recommended).' },
        { status: 400 }
      );
    }

    const existing = await getUserByTraderId(traderId);
    if (existing) {
      return NextResponse.json(
        { error: `Desk ${traderId} already exists.` },
        { status: 409 }
      );
    }

    const created = await createUserRecord({
      traderId,
      name,
      email: body.email,
      role: body.role === 'admin' ? 'admin' : 'trader',
      tier: body.tier || (body.role === 'admin' ? 'Risk Officer' : 'Trainee'),
      pinHash: hashPin(pin),
      accountNumber: body.accountNumber,
      accountName: body.accountName || 'Titan Funded Desk',
      initialCapital: Number(body.initialCapital) > 0 ? Number(body.initialCapital) : 5000,
      currency: body.currency || 'USD',
      defaultRiskPct: Number(body.defaultRiskPct) > 0 ? Number(body.defaultRiskPct) : 1.0,
      dailyLossLimitPct:
        Number(body.dailyLossLimitPct) > 0 ? Number(body.dailyLossLimitPct) : 5.0,
      timezoneOffsetHours:
        body.timezoneOffsetHours !== undefined ? Number(body.timezoneOffsetHours) : 1,
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to issue trader desk.' },
      { status: 500 }
    );
  }
}
