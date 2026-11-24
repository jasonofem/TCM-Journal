import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createImportBatchRecord,
  createTradeRecord,
  getUserByTraderId,
  listTradesByUser,
  updateTradeRecord,
} from '@/lib/db';
import { classifyImportedTrades } from '@/lib/dedupe';
import { ClassifiedImportRow, ParsedTradeCandidate, TradingSession } from '@/lib/types';

interface CommitItemInput {
  candidate: ParsedTradeCandidate;
  session?: TradingSession;
  setup?: string;
  timeframe?: string | null;
  include?: boolean;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      fileName?: string;
      sourceType?: string;
      timezoneOffsetHours?: number;
      targetTraderId?: string;
      items?: CommitItemInput[];
    };

    let targetUser = user;
    if (body.targetTraderId && body.targetTraderId !== user.traderId) {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const found = await getUserByTraderId(body.targetTraderId);
      if (!found) {
        return NextResponse.json({ error: 'Target trader not found' }, { status: 404 });
      }
      targetUser = found;
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const selectedItems = items.filter((item) => item.include !== false && item.candidate);

    if (selectedItems.length === 0) {
      return NextResponse.json(
        { error: 'No new or updatable trades selected to sync.' },
        { status: 400 }
      );
    }

    const tzOffset =
      typeof body.timezoneOffsetHours === 'number'
        ? body.timezoneOffsetHours
        : targetUser.timezoneOffsetHours;

    // Server-side re-deduplication right before DB write guarantees idempotency even under double-click!
    const existingTrades = await listTradesByUser(targetUser.id);
    const reclassified: ClassifiedImportRow[] = classifyImportedTrades(
      selectedItems.map((i) => i.candidate),
      existingTrades,
      { setup: 'H1 5050 Bounce', timeframe: null }
    );

    const sourceType = body.sourceType || 'report_import';
    const fileName = body.fileName || 'report-sync';

    const batch = await createImportBatchRecord({
      userId: targetUser.id,
      fileName,
      sourceType,
      totalParsed: items.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      reportTimezoneOffset: tzOffset,
    });

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = items.length - selectedItems.length;

    const sourceLabel = sourceType.toLowerCase().includes('html')
      ? 'html_import'
      : sourceType.toLowerCase().includes('excel') || sourceType.toLowerCase().includes('xlsx')
        ? 'excel_import'
        : sourceType.toLowerCase().includes('json')
          ? 'json_import'
          : 'paste_import';

    for (let i = 0; i < reclassified.length; i++) {
      const row = reclassified[i];
      const userOverrides = selectedItems[i];
      const cand = row.candidate;
      const finalSession = userOverrides.session || row.session;
      const finalSetup = userOverrides.setup || row.setup;
      const finalTimeframe =
        userOverrides.timeframe !== undefined ? userOverrides.timeframe : row.timeframe;

      if (row.action === 'NEW') {
        await createTradeRecord(
          targetUser.id,
          {
            pair: cand.pair,
            position: cand.position,
            setup: finalSetup,
            entryDate: cand.entryDate,
            entryTime: cand.entryTime,
            session: finalSession,
            lots: cand.lots,
            riskAmount: cand.riskAmount,
            entryPrice: cand.entryPrice,
            stopLoss: cand.stopLoss,
            takeProfit: cand.takeProfit,
            exitPrice: cand.exitPrice,
            exitDate: cand.exitDate,
            exitTime: cand.exitTime,
            exitReason: cand.exitReason,
            commission: cand.commission,
            swap: cand.swap,
            brokerPnl: cand.brokerPnl,
            timeframe: finalTimeframe,
            brokerTicket: cand.brokerTicket,
            beforeScreenshot: cand.beforeScreenshot,
            afterScreenshot: cand.afterScreenshot,
            mistakes: cand.mistakes,
            notes: cand.notes,
            source: sourceLabel,
          },
          {
            importBatchId: batch.id,
            timezoneOffsetHours: tzOffset,
          }
        );
        insertedCount++;
      } else if (row.action === 'UPDATE_CLOSE' && row.matchedTradeId) {
        await updateTradeRecord(
          row.matchedTradeId,
          {
            exitPrice: cand.exitPrice,
            exitDate: cand.exitDate,
            exitTime: cand.exitTime,
            exitReason: cand.exitReason,
            commission: cand.commission,
            swap: cand.swap,
            brokerPnl: cand.brokerPnl,
            stopLoss: cand.stopLoss,
            takeProfit: cand.takeProfit,
            importBatchId: batch.id,
          },
          tzOffset
        );
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    // Update batch counts in DB
    const { dbQuery } = await import('@/lib/db');
    await dbQuery(
      `UPDATE import_batches SET inserted_count = $1, updated_count = $2, skipped_count = $3 WHERE id = $4`,
      [insertedCount, updatedCount, skippedCount, batch.id]
    );

    return NextResponse.json({
      ok: true,
      insertedCount,
      updatedCount,
      skippedCount,
      batchId: batch.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to commit imported trades.' },
      { status: 500 }
    );
  }
}
