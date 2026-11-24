import React from 'react';
import TcmAppShell from '@/components/TcmAppShell';
import { getCurrentUser } from '@/lib/auth';
import { countAdmins, countUsers, getDbMode } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const dbMode = getDbMode();
  let user = null;
  let hasUsers = false;
  let hasAdmin = false;

  if (dbMode !== 'unconfigured_vercel') {
    try {
      const [u, uCount, aCount] = await Promise.all([
        getCurrentUser(),
        countUsers(),
        countAdmins(),
      ]);
      user = u;
      hasUsers = uCount > 0;
      hasAdmin = aCount > 0;
    } catch {
      // Surface gracefully in UI
    }
  }

  return (
    <TcmAppShell
      initialUser={user}
      initialDbMode={dbMode}
      initialHasUsers={hasUsers}
      initialHasAdmin={hasAdmin}
    />
  );
}
