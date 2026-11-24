import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPin } from '@/lib/auth';
import { createUserRecord, getUserByTraderId } from '@/lib/db';
import { UserRole } from '@/lib/types';

function generateSixDigitKey(): string {
  return String(crypto.randomInt(100000, 999999));
}

interface SingleTraderPayload {
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
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as SingleTraderPayload & {
      bulk?: SingleTraderPayload[];
    };

    // Bulk creation mode: issues multiple desks with optional auto-generated 6-digit keys
    if (Array.isArray(body.bulk)) {
      const results: Array<{
        traderId: string;
        name: string;
        key: string;
        role: UserRole;
        initialCapital: number;
      }> = [];
      const errors: Array<{ traderId: string; error: string }> = [];

      for (const item of body.bulk) {
        const traderId = (item.traderId || '').trim().toUpperCase();
        const name = (item.name || traderId).trim();
        const pin = (item.pin || '').trim() || generateSixDigitKey();

        if (!traderId || traderId.length < 3) {
          errors.push({ traderId: traderId || '(blank)', error: 'Trader ID must be 3+ chars' });
          continue;
        }
        if (pin.length < 6) {
          errors.push({ traderId, error: 'Access key must be at least 6 digits/characters' });
          continue;
        }
        const dup = await getUserByTraderId(traderId);
        if (dup) {
          errors.push({ traderId, error: `Desk ${traderId} already exists` });
          continue;
        }

        const created = await createUserRecord({
          traderId,
          name,
          email: item.email,
          role: item.role === 'admin' ? 'admin' : 'trader',
          tier: item.tier || (item.role === 'admin' ? 'Risk Officer' : 'Trainee'),
          pinHash: hashPin(pin),
          accountNumber: item.accountNumber,
          accountName: item.accountName || 'Titan Funded Desk',
          initialCapital: Number(item.initialCapital) > 0 ? Number(item.initialCapital) : 5000,
          currency: item.currency || 'USD',
          defaultRiskPct: Number(item.defaultRiskPct) > 0 ? Number(item.defaultRiskPct) : 1.0,
          dailyLossLimitPct:
            Number(item.dailyLossLimitPct) > 0 ? Number(item.dailyLossLimitPct) : 5.0,
          timezoneOffsetHours:
            item.timezoneOffsetHours !== undefined ? Number(item.timezoneOffsetHours) : 1,
        });

        results.push({
          traderId: created.traderId,
          name: created.name,
          key: pin,
          role: created.role,
          initialCapital: created.initialCapital,
        });
      }

      return NextResponse.json({ created: results, errors }, { status: 201 });
    }

    // Single desk mode
    const traderId = (body.traderId || '').trim().toUpperCase();
    const name = (body.name || '').trim();
    const pin = (body.pin || '').trim() || generateSixDigitKey();

    if (!traderId || traderId.length < 3) {
      return NextResponse.json(
        { error: 'Trader ID must be at least 3 characters (e.g. TCM-T-003).' },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: 'Trader name is required.' }, { status: 400 });
    }
    if (pin.length < 6) {
      return NextResponse.json(
        { error: 'Access key must be a 6-digit code (or 6+ characters).' },
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

    return NextResponse.json({ user: created, key: pin }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to issue trader desk.' },
      { status: 500 }
    );
  }
}
