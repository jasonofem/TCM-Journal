import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie, verifyPin } from '@/lib/auth';
import { getDbMode, getUserWithSecretByTraderId } from '@/lib/db';

export async function POST(req: NextRequest) {
  if (getDbMode() === 'unconfigured_vercel') {
    return NextResponse.json(
      { error: 'Cloud database is not connected yet. Configure DATABASE_URL on Vercel.' },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json()) as { traderId?: string; pin?: string };
    const traderId = (body.traderId || '').trim().toUpperCase();
    const pin = (body.pin || '').trim();

    if (!traderId || !pin) {
      return NextResponse.json(
        { error: 'Trader ID and PIN are required.' },
        { status: 400 }
      );
    }

    const userWithSecret = await getUserWithSecretByTraderId(traderId);
    if (!userWithSecret) {
      return NextResponse.json(
        { error: 'Invalid Trader ID or PIN.' },
        { status: 401 }
      );
    }
    if (!userWithSecret.isActive) {
      return NextResponse.json(
        { error: 'This desk has been deactivated. Contact your Firm Admin.' },
        { status: 403 }
      );
    }
    if (!verifyPin(pin, userWithSecret.pinHash)) {
      return NextResponse.json(
        { error: 'Invalid Trader ID or PIN.' },
        { status: 401 }
      );
    }

    await setSessionCookie(userWithSecret.id, userWithSecret.role);
    const { pinHash: _ignored, ...safeUser } = userWithSecret;
    return NextResponse.json({ user: safeUser });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Login failed.' },
      { status: 500 }
    );
  }
}
