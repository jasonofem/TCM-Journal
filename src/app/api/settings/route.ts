import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { updateUserRecord } from '@/lib/db';

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string | null;
      accountNumber?: string | null;
      accountName?: string;
      initialCapital?: number;
      currency?: string;
      defaultRiskPct?: number;
      breakevenThreshold?: number;
      dailyLossLimitPct?: number;
      timezoneOffsetHours?: number;
      regenerateToken?: boolean;
    };

    const updated = await updateUserRecord(user.id, {
      name: body.name,
      email: body.email,
      accountNumber: body.accountNumber,
      accountName: body.accountName,
      initialCapital:
        body.initialCapital !== undefined ? Math.max(1, Number(body.initialCapital)) : undefined,
      currency: body.currency,
      defaultRiskPct:
        body.defaultRiskPct !== undefined ? Math.max(0.05, Number(body.defaultRiskPct)) : undefined,
      breakevenThreshold:
        body.breakevenThreshold !== undefined
          ? Math.max(0, Number(body.breakevenThreshold))
          : undefined,
      dailyLossLimitPct:
        body.dailyLossLimitPct !== undefined
          ? Math.max(0.1, Number(body.dailyLossLimitPct))
          : undefined,
      timezoneOffsetHours:
        body.timezoneOffsetHours !== undefined ? Number(body.timezoneOffsetHours) : undefined,
      apiToken: body.regenerateToken
        ? `tcm_${crypto.randomBytes(24).toString('hex')}`
        : undefined,
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save settings' },
      { status: 500 }
    );
  }
}
