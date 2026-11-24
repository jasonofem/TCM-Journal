import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createTradeRecord,
  deleteTradesByUser,
  getUserByTraderId,
  listTradesByUser,
} from '@/lib/db';
import { classifyImportedTrades } from '@/lib/dedupe';
import { EXAMPLE_TRADES } from '@/lib/examples';
import { parsePastedOrTextReport } from '@/lib/import-parser';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action: 'load_examples' | 'wipe_examples' | 'wipe_all' | 'restore_json';
      targetTraderId?: string;
      jsonPayload?: string;
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

    if (body.action === 'load_examples') {
      const existing = await listTradesByUser(targetUser.id);
      let added = 0;
      for (const ex of EXAMPLE_TRADES) {
        const dup = existing.some(
          (t) =>
            t.pair === ex.pair &&
            t.entryDate === ex.entryDate &&
            t.entryPrice === ex.entryPrice
        );
        if (!dup) {
          await createTradeRecord(targetUser.id, ex, {
            timezoneOffsetHours: targetUser.timezoneOffsetHours,
          });
          added++;
        }
      }
      return NextResponse.json({ ok: true, added });
    }

    if (body.action === 'wipe_examples') {
      const deleted = await deleteTradesByUser(targetUser.id, true);
      return NextResponse.json({ ok: true, deleted });
    }

    if (body.action === 'wipe_all') {
      const deleted = await deleteTradesByUser(targetUser.id, false);
      return NextResponse.json({ ok: true, deleted });
    }

    if (body.action === 'restore_json') {
      const parsed = parsePastedOrTextReport(
        body.jsonPayload || '',
        'backup.json',
        targetUser.timezoneOffsetHours
      );
      const existing = await listTradesByUser(targetUser.id);
      const rows = classifyImportedTrades(parsed.trades, existing, {
        setup: 'H1 5050 Bounce',
        timeframe: 'H1',
      });
      let inserted = 0;
      for (const r of rows) {
        if (r.action === 'NEW') {
          await createTradeRecord(
            targetUser.id,
            {
              pair: r.candidate.pair,
              position: r.candidate.position,
              setup: r.setup,
              entryDate: r.candidate.entryDate,
              entryTime: r.candidate.entryTime,
              session: r.session,
              lots: r.candidate.lots,
              riskAmount: r.candidate.riskAmount,
              entryPrice: r.candidate.entryPrice,
              stopLoss: r.candidate.stopLoss,
              takeProfit: r.candidate.takeProfit,
              exitPrice: r.candidate.exitPrice,
              exitDate: r.candidate.exitDate,
              exitTime: r.candidate.exitTime,
              commission: r.candidate.commission,
              swap: r.candidate.swap,
              brokerPnl: r.candidate.brokerPnl,
              brokerTicket: r.candidate.brokerTicket,
              notes: r.candidate.notes,
              mistakes: r.candidate.mistakes,
              source: 'json_import',
            },
            { timezoneOffsetHours: targetUser.timezoneOffsetHours }
          );
          inserted++;
        }
      }
      return NextResponse.json({ ok: true, inserted });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk operation failed' },
      { status: 500 }
    );
  }
}
