import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { countAdmins, countUsers, getDbMode } from '@/lib/db';

export async function GET() {
  const dbMode = getDbMode();
  if (dbMode === 'unconfigured_vercel') {
    return NextResponse.json({
      user: null,
      dbMode,
      hasUsers: false,
      hasAdmin: false,
    });
  }

  try {
    const [user, totalUsers, totalAdmins] = await Promise.all([
      getCurrentUser(),
      countUsers(),
      countAdmins(),
    ]);
    return NextResponse.json({
      user,
      dbMode,
      hasUsers: totalUsers > 0,
      hasAdmin: totalAdmins > 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        user: null,
        dbMode,
        hasUsers: false,
        hasAdmin: false,
        error: err instanceof Error ? err.message : 'Database check failed',
      },
      { status: 500 }
    );
  }
}
