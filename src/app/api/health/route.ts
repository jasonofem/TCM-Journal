import { NextResponse } from 'next/server';
import { countAdmins, countUsers, getDbMode } from '@/lib/db';

export async function GET() {
  const dbMode = getDbMode();
  if (dbMode === 'unconfigured_vercel') {
    return NextResponse.json({
      ok: false,
      dbMode,
      hasUsers: false,
      hasAdmin: false,
      message: 'Add DATABASE_URL or POSTGRES_URL in Vercel Environment Variables to connect the firm cloud database.',
    });
  }

  try {
    const [totalUsers, totalAdmins] = await Promise.all([countUsers(), countAdmins()]);
    return NextResponse.json({
      ok: true,
      dbMode,
      hasUsers: totalUsers > 0,
      hasAdmin: totalAdmins > 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        dbMode,
        hasUsers: false,
        hasAdmin: false,
        message: err instanceof Error ? err.message : 'Database connection error',
      },
      { status: 500 }
    );
  }
}
