import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool as PgPool } from 'pg';
import {
  ImportBatchRecord,
  TradeInput,
  TradeRecord,
  UserProfile,
  UserRole,
} from './types';
import { buildTradeFingerprint } from './dedupe';
import {
  getDayOfWeekFromDate,
  normalizePair,
  normalizeSession,
  normalizeSetup,
} from './trading-math';

export type DbMode = 'postgres' | 'local_sqlite' | 'unconfigured_vercel';

function getPgUrl(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL ||
    null
  );
}

export function getDbMode(): DbMode {
  if (getPgUrl()) return 'postgres';
  if (process.env.VERCEL === '1') return 'unconfigured_vercel';
  return 'local_sqlite';
}

interface SqliteDbLike {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): { changes: number };
  };
}

let pgPool: PgPool | null = null;
let sqliteDb: SqliteDbLike | null = null;
let schemaInitialized = false;
let schemaPromise: Promise<void> | null = null;

async function getPgPool(): Promise<PgPool> {
  if (pgPool) return pgPool;
  const connStr = getPgUrl();
  if (!connStr) {
    throw new Error(
      'No Postgres database URL configured. Add DATABASE_URL or POSTGRES_URL in Vercel Environment Variables.'
    );
  }
  const { Pool } = await import('pg');
  const isLocal =
    connStr.includes('localhost') ||
    connStr.includes('127.0.0.1') ||
    connStr.includes('sslmode=disable');

  pgPool = new Pool({
    connectionString: connStr,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 20000,
  });
  return pgPool;
}

function getSqliteDb(): SqliteDbLike {
  if (sqliteDb) return sqliteDb;
  const dataDir = path.join(process.cwd(), '.data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'tcm-journal.db');
  // Indirect require so Next/Turbopack doesn't try to statically bundle node:sqlite for edge/serverless
  const dynamicRequire = eval('require') as NodeRequire;
  const { DatabaseSync } = dynamicRequire('node:sqlite') as {
    DatabaseSync: new (filePath: string) => SqliteDbLike;
  };
  sqliteDb = new DatabaseSync(dbPath);
  return sqliteDb;
}

function toSqliteParams(sql: string, params: unknown[]): { sql: string; expandedParams: unknown[] } {
  const expandedParams: unknown[] = [];
  const convertedSql = sql.replace(/\$(\d+)/g, (_, numStr) => {
    const idx = Number(numStr) - 1;
    const val = params[idx];
    if (typeof val === 'boolean') expandedParams.push(val ? 1 : 0);
    else if (val === undefined) expandedParams.push(null);
    else expandedParams.push(val);
    return '?';
  });
  return { sql: convertedSql, expandedParams };
}

export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const mode = getDbMode();
  if (mode === 'unconfigured_vercel') {
    throw new Error(
      'Database not configured on Vercel. Please add DATABASE_URL (Neon or Supabase Postgres) in Vercel Project Environment Variables.'
    );
  }

  if (mode === 'postgres') {
    const pool = await getPgPool();
    const res = await pool.query(sql, params);
    return res.rows as T[];
  }

  const db = getSqliteDb();
  const { sql: sqliteSql, expandedParams } = toSqliteParams(sql, params);
  const trimmed = sqliteSql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.includes('RETURNING')) {
    return db.prepare(sqliteSql).all(...expandedParams) as T[];
  }
  db.prepare(sqliteSql).run(...expandedParams);
  return [];
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    trader_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'trader',
    tier TEXT NOT NULL DEFAULT 'Trader',
    pin_hash TEXT NOT NULL,
    account_number TEXT,
    account_name TEXT NOT NULL DEFAULT 'Firm Funded Desk',
    initial_capital DOUBLE PRECISION NOT NULL DEFAULT 10000,
    currency TEXT NOT NULL DEFAULT 'USD',
    default_risk_pct DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    breakeven_threshold DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    daily_loss_limit_pct DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    timezone_offset_hours INTEGER NOT NULL DEFAULT 1,
    api_token TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    total_parsed INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    report_timezone_offset INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sn INTEGER NOT NULL,
    pair TEXT NOT NULL,
    position TEXT NOT NULL,
    setup TEXT NOT NULL,
    custom_setup TEXT,
    entry_date TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    entry_datetime TEXT NOT NULL,
    day_of_week TEXT NOT NULL,
    session TEXT NOT NULL,
    lots DOUBLE PRECISION NOT NULL,
    risk_amount DOUBLE PRECISION,
    risk_pct DOUBLE PRECISION,
    entry_price DOUBLE PRECISION NOT NULL,
    stop_loss DOUBLE PRECISION,
    take_profit DOUBLE PRECISION,
    exit_price DOUBLE PRECISION,
    exit_date TEXT,
    exit_time TEXT,
    exit_datetime TEXT,
    exit_reason TEXT,
    commission DOUBLE PRECISION NOT NULL DEFAULT 0,
    swap DOUBLE PRECISION NOT NULL DEFAULT 0,
    broker_pnl DOUBLE PRECISION,
    followed_plan TEXT,
    market_condition TEXT,
    timeframe TEXT,
    emotion TEXT,
    broker_ticket TEXT,
    fingerprint TEXT NOT NULL,
    chart_url TEXT,
    before_screenshot TEXT,
    after_screenshot TEXT,
    mistakes TEXT,
    mae_pips DOUBLE PRECISION,
    mfe_pips DOUBLE PRECISION,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    import_batch_id TEXT,
    admin_review_note TEXT,
    admin_reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trades_fingerprint ON trades(user_id, fingerprint)`,
  `CREATE INDEX IF NOT EXISTS idx_trades_ticket ON trades(user_id, broker_ticket)`,
  `CREATE INDEX IF NOT EXISTS idx_batches_user_id ON import_batches(user_id)`,
];

export async function ensureSchema(): Promise<void> {
  if (schemaInitialized) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const mode = getDbMode();
    if (mode === 'unconfigured_vercel') return;

    if (mode === 'postgres') {
      const pool = await getPgPool();
      for (const stmt of SCHEMA_STATEMENTS) {
        await pool.query(stmt);
      }
    } else {
      const db = getSqliteDb();
      db.exec('PRAGMA foreign_keys = ON;');
      for (const stmt of SCHEMA_STATEMENTS) {
        db.exec(stmt);
      }
    }
    schemaInitialized = true;
  })();

  try {
    await schemaPromise;
  } finally {
    schemaPromise = null;
  }
}

function mapUser(row: Record<string, unknown>): UserProfile & { pinHash: string } {
  return {
    id: String(row.id),
    traderId: String(row.trader_id),
    name: String(row.name),
    email: row.email ? String(row.email) : null,
    role: (String(row.role) === 'admin' ? 'admin' : 'trader') as UserRole,
    tier: String(row.tier || 'Trader'),
    pinHash: String(row.pin_hash),
    accountNumber: row.account_number ? String(row.account_number) : null,
    accountName: String(row.account_name || 'Firm Funded Desk'),
    initialCapital: Number(row.initial_capital ?? 10000),
    currency: String(row.currency || 'USD'),
    defaultRiskPct: Number(row.default_risk_pct ?? 1.0),
    breakevenThreshold: Number(row.breakeven_threshold ?? 1.0),
    dailyLossLimitPct: Number(row.daily_loss_limit_pct ?? 5.0),
    timezoneOffsetHours: Number(row.timezone_offset_hours ?? 1),
    apiToken: String(row.api_token),
    isActive: Number(row.is_active) === 1 || row.is_active === true,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapTrade(row: Record<string, unknown>): TradeRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sn: Number(row.sn),
    pair: String(row.pair),
    position: String(row.position) === 'Sell' ? 'Sell' : 'Buy',
    setup: String(row.setup),
    customSetup: row.custom_setup ? String(row.custom_setup) : null,
    entryDate: String(row.entry_date),
    entryTime: String(row.entry_time),
    entryDatetime: String(row.entry_datetime),
    dayOfWeek: String(row.day_of_week),
    session: (String(row.session) as TradeRecord['session']) || 'London',
    lots: Number(row.lots),
    riskAmount: numOrNull(row.risk_amount),
    riskPct: numOrNull(row.risk_pct),
    entryPrice: Number(row.entry_price),
    stopLoss: numOrNull(row.stop_loss),
    takeProfit: numOrNull(row.take_profit),
    exitPrice: numOrNull(row.exit_price),
    exitDate: row.exit_date ? String(row.exit_date) : null,
    exitTime: row.exit_time ? String(row.exit_time) : null,
    exitDatetime: row.exit_datetime ? String(row.exit_datetime) : null,
    exitReason: row.exit_reason ? String(row.exit_reason) : null,
    commission: Number(row.commission ?? 0),
    swap: Number(row.swap ?? 0),
    brokerPnl: numOrNull(row.broker_pnl),
    followedPlan: row.followed_plan ? String(row.followed_plan) : null,
    marketCondition: row.market_condition ? String(row.market_condition) : null,
    timeframe: row.timeframe ? String(row.timeframe) : null,
    emotion: row.emotion ? String(row.emotion) : null,
    brokerTicket: row.broker_ticket ? String(row.broker_ticket) : null,
    fingerprint: String(row.fingerprint),
    chartUrl: row.chart_url ? String(row.chart_url) : null,
    beforeScreenshot: row.before_screenshot ? String(row.before_screenshot) : null,
    afterScreenshot: row.after_screenshot ? String(row.after_screenshot) : null,
    mistakes: row.mistakes ? String(row.mistakes) : null,
    maePips: numOrNull(row.mae_pips),
    mfePips: numOrNull(row.mfe_pips),
    notes: row.notes ? String(row.notes) : null,
    source: (String(row.source || 'manual') as TradeRecord['source']),
    importBatchId: row.import_batch_id ? String(row.import_batch_id) : null,
    adminReviewNote: row.admin_review_note ? String(row.admin_review_note) : null,
    adminReviewedAt: row.admin_reviewed_at ? String(row.admin_reviewed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapBatch(row: Record<string, unknown>): ImportBatchRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fileName: String(row.file_name),
    sourceType: String(row.source_type),
    totalParsed: Number(row.total_parsed ?? 0),
    insertedCount: Number(row.inserted_count ?? 0),
    updatedCount: Number(row.updated_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
    reportTimezoneOffset: Number(row.report_timezone_offset ?? 1),
    createdAt: String(row.created_at),
  };
}

export async function countUsers(): Promise<number> {
  const rows = await dbQuery<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM users');
  return Number(rows[0]?.cnt ?? 0);
}

export async function countAdmins(): Promise<number> {
  const rows = await dbQuery<{ cnt: number | string }>(
    `SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'`
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function listUsers(): Promise<UserProfile[]> {
  const rows = await dbQuery('SELECT * FROM users ORDER BY role ASC, created_at ASC');
  return rows.map((r) => {
    const { pinHash: _ignored, ...rest } = mapUser(r);
    return rest;
  });
}

export async function getUserWithSecretByTraderId(
  traderId: string
): Promise<(UserProfile & { pinHash: string }) | null> {
  const rows = await dbQuery('SELECT * FROM users WHERE UPPER(trader_id) = UPPER($1) LIMIT 1', [
    traderId.trim(),
  ]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  const rows = await dbQuery('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  if (!rows[0]) return null;
  const { pinHash: _ignored, ...rest } = mapUser(rows[0]);
  return rest;
}

export async function getUserByTraderId(traderId: string): Promise<UserProfile | null> {
  const rows = await dbQuery('SELECT * FROM users WHERE UPPER(trader_id) = UPPER($1) LIMIT 1', [
    traderId.trim(),
  ]);
  if (!rows[0]) return null;
  const { pinHash: _ignored, ...rest } = mapUser(rows[0]);
  return rest;
}

export async function getUserByApiToken(token: string): Promise<UserProfile | null> {
  const rows = await dbQuery('SELECT * FROM users WHERE api_token = $1 LIMIT 1', [token.trim()]);
  if (!rows[0]) return null;
  const { pinHash: _ignored, ...rest } = mapUser(rows[0]);
  return rest;
}

export async function createUserRecord(input: {
  traderId: string;
  name: string;
  email?: string | null;
  role: UserRole;
  tier?: string;
  pinHash: string;
  accountNumber?: string | null;
  accountName?: string;
  initialCapital?: number;
  currency?: string;
  defaultRiskPct?: number;
  breakevenThreshold?: number;
  dailyLossLimitPct?: number;
  timezoneOffsetHours?: number;
}): Promise<UserProfile> {
  const id = crypto.randomUUID();
  const apiToken = `tcm_${crypto.randomBytes(24).toString('hex')}`;
  const now = new Date().toISOString();
  const normalizedTraderId = input.traderId.trim().toUpperCase();

  await dbQuery(
    `INSERT INTO users (
      id, trader_id, name, email, role, tier, pin_hash, account_number, account_name,
      initial_capital, currency, default_risk_pct, breakeven_threshold, daily_loss_limit_pct,
      timezone_offset_hours, api_token, is_active, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      id,
      normalizedTraderId,
      input.name.trim(),
      input.email?.trim() || null,
      input.role,
      input.tier?.trim() || (input.role === 'admin' ? 'Head of Trading' : 'Trader'),
      input.pinHash,
      input.accountNumber?.trim() || null,
      input.accountName?.trim() || 'Titan Funded Desk',
      input.initialCapital ?? 10000,
      input.currency || 'USD',
      input.defaultRiskPct ?? 1.0,
      input.breakevenThreshold ?? 1.0,
      input.dailyLossLimitPct ?? 5.0,
      input.timezoneOffsetHours ?? 1,
      apiToken,
      1,
      now,
      now,
    ]
  );

  const created = await getUserById(id);
  if (!created) throw new Error('Failed to create user');
  return created;
}

export async function updateUserRecord(
  id: string,
  patch: Partial<{
    name: string;
    email: string | null;
    role: UserRole;
    tier: string;
    pinHash: string;
    accountNumber: string | null;
    accountName: string;
    initialCapital: number;
    currency: string;
    defaultRiskPct: number;
    breakevenThreshold: number;
    dailyLossLimitPct: number;
    timezoneOffsetHours: number;
    apiToken: string;
    isActive: boolean;
  }>
): Promise<UserProfile | null> {
  const existing = await dbQuery('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  if (!existing[0]) return null;
  const cur = mapUser(existing[0]);
  const now = new Date().toISOString();

  await dbQuery(
    `UPDATE users SET
      name = $1,
      email = $2,
      role = $3,
      tier = $4,
      pin_hash = $5,
      account_number = $6,
      account_name = $7,
      initial_capital = $8,
      currency = $9,
      default_risk_pct = $10,
      breakeven_threshold = $11,
      daily_loss_limit_pct = $12,
      timezone_offset_hours = $13,
      api_token = $14,
      is_active = $15,
      updated_at = $16
    WHERE id = $17`,
    [
      patch.name !== undefined ? patch.name.trim() : cur.name,
      patch.email !== undefined ? patch.email : cur.email,
      patch.role !== undefined ? patch.role : cur.role,
      patch.tier !== undefined ? patch.tier : cur.tier,
      patch.pinHash !== undefined ? patch.pinHash : cur.pinHash,
      patch.accountNumber !== undefined ? patch.accountNumber : cur.accountNumber,
      patch.accountName !== undefined ? patch.accountName : cur.accountName,
      patch.initialCapital !== undefined ? patch.initialCapital : cur.initialCapital,
      patch.currency !== undefined ? patch.currency : cur.currency,
      patch.defaultRiskPct !== undefined ? patch.defaultRiskPct : cur.defaultRiskPct,
      patch.breakevenThreshold !== undefined ? patch.breakevenThreshold : cur.breakevenThreshold,
      patch.dailyLossLimitPct !== undefined ? patch.dailyLossLimitPct : cur.dailyLossLimitPct,
      patch.timezoneOffsetHours !== undefined ? patch.timezoneOffsetHours : cur.timezoneOffsetHours,
      patch.apiToken !== undefined ? patch.apiToken : cur.apiToken,
      patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : cur.isActive ? 1 : 0,
      now,
      id,
    ]
  );

  return getUserById(id);
}

export async function deleteUserRecord(id: string): Promise<void> {
  await dbQuery('DELETE FROM trades WHERE user_id = $1', [id]);
  await dbQuery('DELETE FROM import_batches WHERE user_id = $1', [id]);
  await dbQuery('DELETE FROM users WHERE id = $1', [id]);
}

export async function listTradesByUser(userId: string): Promise<TradeRecord[]> {
  const rows = await dbQuery(
    'SELECT * FROM trades WHERE user_id = $1 ORDER BY entry_datetime ASC, sn ASC',
    [userId]
  );
  return rows.map(mapTrade);
}

export async function listAllTrades(): Promise<TradeRecord[]> {
  const rows = await dbQuery('SELECT * FROM trades ORDER BY entry_datetime DESC, sn DESC');
  return rows.map(mapTrade);
}

export async function getTradeById(id: string): Promise<TradeRecord | null> {
  const rows = await dbQuery('SELECT * FROM trades WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ? mapTrade(rows[0]) : null;
}

async function getNextSn(userId: string): Promise<number> {
  const rows = await dbQuery<{ max_sn: number | string | null }>(
    'SELECT MAX(sn) as max_sn FROM trades WHERE user_id = $1',
    [userId]
  );
  return Number(rows[0]?.max_sn ?? 0) + 1;
}

export async function createTradeRecord(
  userId: string,
  input: TradeInput,
  options?: { importBatchId?: string | null; snOverride?: number; timezoneOffsetHours?: number }
): Promise<TradeRecord> {
  const id = crypto.randomUUID();
  const sn = options?.snOverride ?? (await getNextSn(userId));
  const now = new Date().toISOString();
  const pair = normalizePair(input.pair);
  const entryTime = (input.entryTime || '12:00').length === 5 ? `${input.entryTime}:00` : input.entryTime;
  const entryDatetime = `${input.entryDate} ${entryTime}`;
  const exitTime =
    input.exitDate && input.exitTime
      ? input.exitTime.length === 5
        ? `${input.exitTime}:00`
        : input.exitTime
      : input.exitDate
        ? '12:00:00'
        : null;
  const exitDatetime = input.exitDate && exitTime ? `${input.exitDate} ${exitTime}` : null;
  const dayOfWeek = getDayOfWeekFromDate(input.entryDate);
  const session = normalizeSession(
    input.session,
    entryTime,
    options?.timezoneOffsetHours ?? 1
  );
  const normSetup = normalizeSetup(input.customSetup ? input.customSetup : input.setup);
  const finalSetup = input.setup && input.setup !== 'Other' ? input.setup : normSetup.setup;
  const finalCustom =
    input.customSetup !== undefined ? input.customSetup : normSetup.customSetup;

  const fingerprint = buildTradeFingerprint({
    pair,
    position: input.position,
    entryDatetime,
    entryPrice: input.entryPrice,
    lots: input.lots,
  });

  await dbQuery(
    `INSERT INTO trades (
      id, user_id, sn, pair, position, setup, custom_setup,
      entry_date, entry_time, entry_datetime, day_of_week, session,
      lots, risk_amount, risk_pct, entry_price, stop_loss, take_profit,
      exit_price, exit_date, exit_time, exit_datetime, exit_reason,
      commission, swap, broker_pnl, followed_plan, market_condition,
      timeframe, emotion, broker_ticket, fingerprint, chart_url,
      before_screenshot, after_screenshot, mistakes, mae_pips, mfe_pips,
      notes, source, import_batch_id, admin_review_note, admin_reviewed_at,
      created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28,
      $29,$30,$31,$32,$33,
      $34,$35,$36,$37,$38,
      $39,$40,$41,$42,$43,
      $44,$45
    )`,
    [
      id,
      userId,
      sn,
      pair,
      input.position,
      finalSetup,
      finalCustom,
      input.entryDate,
      entryTime,
      entryDatetime,
      dayOfWeek,
      session,
      input.lots,
      input.riskAmount ?? null,
      input.riskPct ?? null,
      input.entryPrice,
      input.stopLoss ?? null,
      input.takeProfit ?? null,
      input.exitPrice ?? null,
      input.exitDate ?? null,
      exitTime,
      exitDatetime,
      input.exitReason ?? null,
      input.commission ?? 0,
      input.swap ?? 0,
      input.brokerPnl ?? null,
      input.followedPlan ?? null,
      input.marketCondition ?? null,
      input.timeframe ?? null,
      input.emotion ?? null,
      input.brokerTicket ?? null,
      fingerprint,
      input.chartUrl ?? null,
      input.beforeScreenshot ?? null,
      input.afterScreenshot ?? null,
      input.mistakes ?? null,
      input.maePips ?? null,
      input.mfePips ?? null,
      input.notes ?? null,
      input.source ?? 'manual',
      options?.importBatchId ?? null,
      null,
      null,
      now,
      now,
    ]
  );

  const created = await getTradeById(id);
  if (!created) throw new Error('Failed to insert trade');
  return created;
}

export async function updateTradeRecord(
  id: string,
  patch: Partial<TradeInput> & { adminReviewNote?: string | null; importBatchId?: string | null },
  timezoneOffsetHours = 1
): Promise<TradeRecord | null> {
  const cur = await getTradeById(id);
  if (!cur) return null;

  const pair = patch.pair !== undefined ? normalizePair(patch.pair) : cur.pair;
  const position = patch.position !== undefined ? patch.position : cur.position;
  const entryDate = patch.entryDate !== undefined ? patch.entryDate : cur.entryDate;
  const rawEntryTime = patch.entryTime !== undefined ? patch.entryTime : cur.entryTime;
  const entryTime = rawEntryTime.length === 5 ? `${rawEntryTime}:00` : rawEntryTime;
  const entryDatetime = `${entryDate} ${entryTime}`;
  const dayOfWeek = getDayOfWeekFromDate(entryDate);
  const session =
    patch.session !== undefined
      ? normalizeSession(patch.session, entryTime, timezoneOffsetHours)
      : cur.session;
  const entryPrice = patch.entryPrice !== undefined ? patch.entryPrice : cur.entryPrice;
  const lots = patch.lots !== undefined ? patch.lots : cur.lots;

  const exitDate = patch.exitDate !== undefined ? patch.exitDate : cur.exitDate;
  const rawExitTime = patch.exitTime !== undefined ? patch.exitTime : cur.exitTime;
  const exitTime =
    exitDate && rawExitTime
      ? rawExitTime.length === 5
        ? `${rawExitTime}:00`
        : rawExitTime
      : exitDate
        ? '12:00:00'
        : null;
  const exitDatetime = exitDate && exitTime ? `${exitDate} ${exitTime}` : null;

  const fingerprint = buildTradeFingerprint({
    pair,
    position,
    entryDatetime,
    entryPrice,
    lots,
  });

  const now = new Date().toISOString();
  const adminReviewedAt =
    patch.adminReviewNote !== undefined ? now : cur.adminReviewedAt;

  await dbQuery(
    `UPDATE trades SET
      pair = $1, position = $2, setup = $3, custom_setup = $4,
      entry_date = $5, entry_time = $6, entry_datetime = $7, day_of_week = $8, session = $9,
      lots = $10, risk_amount = $11, risk_pct = $12, entry_price = $13, stop_loss = $14, take_profit = $15,
      exit_price = $16, exit_date = $17, exit_time = $18, exit_datetime = $19, exit_reason = $20,
      commission = $21, swap = $22, broker_pnl = $23, followed_plan = $24, market_condition = $25,
      timeframe = $26, emotion = $27, broker_ticket = $28, fingerprint = $29, chart_url = $30,
      before_screenshot = $31, after_screenshot = $32, mistakes = $33, mae_pips = $34, mfe_pips = $35,
      notes = $36, import_batch_id = $37, admin_review_note = $38, admin_reviewed_at = $39, updated_at = $40
    WHERE id = $41`,
    [
      pair,
      position,
      patch.setup !== undefined ? patch.setup : cur.setup,
      patch.customSetup !== undefined ? patch.customSetup : cur.customSetup,
      entryDate,
      entryTime,
      entryDatetime,
      dayOfWeek,
      session,
      lots,
      patch.riskAmount !== undefined ? patch.riskAmount : cur.riskAmount,
      patch.riskPct !== undefined ? patch.riskPct : cur.riskPct,
      entryPrice,
      patch.stopLoss !== undefined ? patch.stopLoss : cur.stopLoss,
      patch.takeProfit !== undefined ? patch.takeProfit : cur.takeProfit,
      patch.exitPrice !== undefined ? patch.exitPrice : cur.exitPrice,
      exitDate,
      exitTime,
      exitDatetime,
      patch.exitReason !== undefined ? patch.exitReason : cur.exitReason,
      patch.commission !== undefined ? patch.commission : cur.commission,
      patch.swap !== undefined ? patch.swap : cur.swap,
      patch.brokerPnl !== undefined ? patch.brokerPnl : cur.brokerPnl,
      patch.followedPlan !== undefined ? patch.followedPlan : cur.followedPlan,
      patch.marketCondition !== undefined ? patch.marketCondition : cur.marketCondition,
      patch.timeframe !== undefined ? patch.timeframe : cur.timeframe,
      patch.emotion !== undefined ? patch.emotion : cur.emotion,
      patch.brokerTicket !== undefined ? patch.brokerTicket : cur.brokerTicket,
      fingerprint,
      patch.chartUrl !== undefined ? patch.chartUrl : cur.chartUrl,
      patch.beforeScreenshot !== undefined ? patch.beforeScreenshot : cur.beforeScreenshot,
      patch.afterScreenshot !== undefined ? patch.afterScreenshot : cur.afterScreenshot,
      patch.mistakes !== undefined ? patch.mistakes : cur.mistakes,
      patch.maePips !== undefined ? patch.maePips : cur.maePips,
      patch.mfePips !== undefined ? patch.mfePips : cur.mfePips,
      patch.notes !== undefined ? patch.notes : cur.notes,
      patch.importBatchId !== undefined ? patch.importBatchId : cur.importBatchId,
      patch.adminReviewNote !== undefined ? patch.adminReviewNote : cur.adminReviewNote,
      adminReviewedAt,
      now,
      id,
    ]
  );

  return getTradeById(id);
}

export async function deleteTradeRecord(id: string): Promise<void> {
  await dbQuery('DELETE FROM trades WHERE id = $1', [id]);
}

export async function deleteTradesByUser(userId: string, onlyExamples = false): Promise<number> {
  if (onlyExamples) {
    const existing = await dbQuery<{ cnt: number | string }>(
      `SELECT COUNT(*) as cnt FROM trades WHERE user_id = $1 AND (source = 'example' OR notes LIKE '%EXAMPLE%')`,
      [userId]
    );
    await dbQuery(
      `DELETE FROM trades WHERE user_id = $1 AND (source = 'example' OR notes LIKE '%EXAMPLE%')`,
      [userId]
    );
    return Number(existing[0]?.cnt ?? 0);
  }
  const existing = await dbQuery<{ cnt: number | string }>(
    'SELECT COUNT(*) as cnt FROM trades WHERE user_id = $1',
    [userId]
  );
  await dbQuery('DELETE FROM trades WHERE user_id = $1', [userId]);
  return Number(existing[0]?.cnt ?? 0);
}

export async function createImportBatchRecord(input: {
  userId: string;
  fileName: string;
  sourceType: string;
  totalParsed: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  reportTimezoneOffset: number;
}): Promise<ImportBatchRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbQuery(
    `INSERT INTO import_batches (
      id, user_id, file_name, source_type, total_parsed,
      inserted_count, updated_count, skipped_count, report_timezone_offset, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      input.userId,
      input.fileName,
      input.sourceType,
      input.totalParsed,
      input.insertedCount,
      input.updatedCount,
      input.skippedCount,
      input.reportTimezoneOffset,
      now,
    ]
  );
  const rows = await dbQuery('SELECT * FROM import_batches WHERE id = $1 LIMIT 1', [id]);
  return mapBatch(rows[0]);
}

export async function listImportBatchesByUser(userId: string): Promise<ImportBatchRecord[]> {
  const rows = await dbQuery(
    'SELECT * FROM import_batches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [userId]
  );
  return rows.map(mapBatch);
}

export async function listRecentFirmBatches(): Promise<ImportBatchRecord[]> {
  const rows = await dbQuery('SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 40');
  return rows.map(mapBatch);
}
