import { NextRequest, NextResponse } from 'next/server';
import {
  createImportBatchRecord,
  createTradeRecord,
  dbQuery,
  getUserByApiToken,
  listTradesByUser,
  updateTradeRecord,
} from '@/lib/db';
import { classifyImportedTrades } from '@/lib/dedupe';
import { parsePastedOrTextReport } from '@/lib/import-parser';

/**
 * Automated broker/EA webhook endpoint.
 * Authenticate with `Authorization: Bearer tcm_...` or `x-tcm-token: tcm_...`
 * Accepts either:
 *   1. Raw MT4/MT5 HTML / CSV / TSV report payload
 *   2. JSON `{ trades: [...] }` or `{ rawReport: "...", fileName?: "..." }`
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const token = bearerToken || (req.headers.get('x-tcm-token') || '').trim();

  if (!token) {
    return NextResponse.json(
      { error: 'Missing trader sync token (Authorization: Bearer <token> or x-tcm-token).' },
      { status: 401 }
    );
  }

  const user = await getUserByApiToken(token);
  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Invalid or inactive sync token.' }, { status: 403 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    const rawBody = await req.text();
    let reportText = rawBody;
    let fileName = 'webhook-sync';

    if (contentType.includes('application/json')) {
      const json = JSON.parse(rawBody) as {
        rawReport?: string;
        fileName?: string;
        trades?: unknown[];
      };
      if (json.rawReport) {
        reportText = json.rawReport;
        fileName = json.fileName || 'webhook-report';
      } else if (Array.isArray(json.trades)) {
        reportText = JSON.stringify(json.trades);
        fileName = json.fileName || 'webhook-json';
      } else {
        reportText = JSON.stringify([json]);
        fileName = json.fileName || 'webhook-single-trade';
      }
    }

    const parsed = parsePastedOrTextReport(reportText, fileName, user.timezoneOffsetHours);
    const existing = await listTradesByUser(user.id);
    const rows = classifyImportedTrades(parsed.trades, existing, {
      setup: 'H1 5050 Bounce',
      timeframe: null,
    });

    const batch = await createImportBatchRecord({
      userId: user.id,
      fileName,
      sourceType: 'webhook',
      totalParsed: rows.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      reportTimezoneOffset: user.timezoneOffsetHours,
    });

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const c = row.candidate;
      if (row.action === 'NEW') {
        await createTradeRecord(
          user.id,
          {
            pair: c.pair,
            position: c.position,
            setup: row.setup,
            entryDate: c.entryDate,
            entryTime: c.entryTime,
            session: row.session,
            lots: c.lots,
            riskAmount: c.riskAmount,
            entryPrice: c.entryPrice,
            stopLoss: c.stopLoss,
            takeProfit: c.takeProfit,
            exitPrice: c.exitPrice,
            exitDate: c.exitDate,
            exitTime: c.exitTime,
            exitReason: c.exitReason,
            commission: c.commission,
            swap: c.swap,
            brokerPnl: c.brokerPnl,
            brokerTicket: c.brokerTicket,
            notes: c.notes,
            source: 'webhook',
          },
          { importBatchId: batch.id, timezoneOffsetHours: user.timezoneOffsetHours }
        );
        insertedCount++;
      } else if (row.action === 'UPDATE_CLOSE' && row.matchedTradeId) {
        await updateTradeRecord(
          row.matchedTradeId,
          {
            exitPrice: c.exitPrice,
            exitDate: c.exitDate,
            exitTime: c.exitTime,
            exitReason: c.exitReason,
            commission: c.commission,
            swap: c.swap,
            brokerPnl: c.brokerPnl,
            importBatchId: batch.id,
          },
          user.timezoneOffsetHours
        );
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    await dbQuery(
      `UPDATE import_batches SET inserted_count = $1, updated_count = $2, skipped_count = $3 WHERE id = $4`,
      [insertedCount, updatedCount, skippedCount, batch.id]
    );

    return NextResponse.json({
      ok: true,
      traderId: user.traderId,
      detectedFormat: parsed.detectedFormat,
      insertedCount,
      updatedCount,
      skippedCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook ingestion failed' },
      { status: 500 }
    );
  }
}
