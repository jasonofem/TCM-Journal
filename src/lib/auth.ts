import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getUserById } from './db';
import { UserProfile } from './types';

export const SESSION_COOKIE_NAME = 'tcm_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

function getAuthSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) {
    return process.env.AUTH_SECRET;
  }
  // Stable deterministic fallback derived from environment so local dev works out of the box
  const seed = process.env.DATABASE_URL || process.env.VERCEL_URL || 'tcm-journal-local-dev-secret-v2';
  return crypto.createHash('sha256').update(`tcm-secret:${seed}`).digest('hex');
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

interface SessionPayload {
  uid: string;
  role: string;
  exp: number;
}

export function signSessionToken(userId: string, role: string): string {
  const payload: SessionPayload = {
    uid: userId,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(body)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.uid || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = verifySessionToken(rawToken);
  if (!payload) return null;
  try {
    const user = await getUserById(payload.uid);
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string, role: string): Promise<void> {
  const token = signSessionToken(userId, role);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.VERCEL === '1',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
