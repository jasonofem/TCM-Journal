import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPin, verifyPin } from '@/lib/auth';
import { getUserWithSecretByTraderId, updateUserRecord } from '@/lib/db';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { currentPin?: string; newPin?: string };
    const currentPin = (body.currentPin || '').trim();
    const newPin = (body.newPin || '').trim();

    if (newPin.length < 6) {
      return NextResponse.json(
        { error: 'New PIN must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const withSecret = await getUserWithSecretByTraderId(user.traderId);
    if (!withSecret || !verifyPin(currentPin, withSecret.pinHash)) {
      return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 400 });
    }

    await updateUserRecord(user.id, { pinHash: hashPin(newPin) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update PIN.' },
      { status: 500 }
    );
  }
}
