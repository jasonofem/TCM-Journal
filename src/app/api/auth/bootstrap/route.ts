import { NextRequest, NextResponse } from 'next/server';
import { hashPin, setSessionCookie } from '@/lib/auth';
import { countAdmins, createUserRecord, getDbMode, getUserByTraderId } from '@/lib/db';

export async function POST(req: NextRequest) {
  if (getDbMode() === 'unconfigured_vercel') {
    return NextResponse.json(
      { error: 'Cloud database is not connected yet. Configure DATABASE_URL on Vercel.' },
      { status: 503 }
    );
  }

  try {
    const existingAdmins = await countAdmins();
    if (existingAdmins > 0) {
      return NextResponse.json(
        { error: 'Firm Admin already exists. Sign in with your Admin Trader ID & PIN.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      traderId?: string;
      name?: string;
      pin?: string;
      secret?: string;
      initialCapital?: number;
      currency?: string;
    };

    const envSecret = (process.env.ADMIN_BOOTSTRAP_SECRET || '').trim();
    if (envSecret && (body.secret || '').trim() !== envSecret) {
      return NextResponse.json(
        { error: 'Invalid bootstrap secret.' },
        { status: 403 }
      );
    }

    const traderId = (body.traderId || '').trim().toUpperCase();
    const name = (body.name || '').trim();
    const pin = (body.pin || '').trim();

    if (!traderId || traderId.length < 3) {
      return NextResponse.json(
        { error: 'Admin Trader ID must be at least 3 characters (e.g. TCM-ADMIN).' },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: 'Admin name is required.' }, { status: 400 });
    }
    if (pin.length < 6) {
      return NextResponse.json(
        { error: 'Admin PIN must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const dup = await getUserByTraderId(traderId);
    if (dup) {
      return NextResponse.json(
        { error: 'That Trader ID is already taken.' },
        { status: 409 }
      );
    }

    const admin = await createUserRecord({
      traderId,
      name,
      role: 'admin',
      tier: 'Head of Trading',
      pinHash: hashPin(pin),
      accountName: 'Titan Capital Markets — Firm Master',
      initialCapital: Number(body.initialCapital) > 0 ? Number(body.initialCapital) : 10000,
      currency: body.currency || 'USD',
    });

    await setSessionCookie(admin.id, admin.role);
    return NextResponse.json({ user: admin }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Admin setup failed.' },
      { status: 500 }
    );
  }
}
