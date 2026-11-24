import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserByTraderId, listTradesByUser } from '@/lib/db';
import { classifyImportedTrades } from '@/lib/dedupe';
import { parsePastedOrTextReport, parseReportBuffer } from '@/lib/import-parser';
import { ImportPreviewResponse } from '@/lib/types';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let fileName = 'pasted-report.txt';
    let targetTraderId: string | null = null;
    let timezoneOffsetHours = user.timezoneOffsetHours;
    let defaultSetup = 'H1 5050 Bounce';
    let defaultTimeframe: string | null = 'H1';
    let parsed;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      const rawText = formData.get('rawText');
      targetTraderId = (formData.get('targetTraderId') as string) || null;
      const tzParam = formData.get('timezoneOffsetHours');
      if (tzParam !== null && tzParam !== '') timezoneOffsetHours = Number(tzParam);
      if (formData.get('defaultSetup')) defaultSetup = String(formData.get('defaultSetup'));
      if (formData.get('defaultTimeframe') !== null) {
        defaultTimeframe = String(formData.get('defaultTimeframe')) || null;
      }

      if (file && file instanceof File) {
        fileName = file.name || 'uploaded-report';
        const arrayBuf = await file.arrayBuffer();
        parsed = parseReportBuffer(Buffer.from(arrayBuf), fileName, timezoneOffsetHours);
      } else if (typeof rawText === 'string' && rawText.trim()) {
        parsed = parsePastedOrTextReport(rawText, fileName, timezoneOffsetHours);
      } else {
        return NextResponse.json(
          { error: 'Please upload a report file (.html, .htm, .xlsx, .csv) or paste report text.' },
          { status: 400 }
        );
      }
    } else {
      const body = (await req.json()) as {
        rawText?: string;
        fileName?: string;
        targetTraderId?: string;
        timezoneOffsetHours?: number;
        defaultSetup?: string;
        defaultTimeframe?: string | null;
      };
      fileName = body.fileName || 'pasted-report.txt';
      targetTraderId = body.targetTraderId || null;
      if (typeof body.timezoneOffsetHours === 'number') {
        timezoneOffsetHours = body.timezoneOffsetHours;
      }
      if (body.defaultSetup) defaultSetup = body.defaultSetup;
      if (body.defaultTimeframe !== undefined) defaultTimeframe = body.defaultTimeframe;

      parsed = parsePastedOrTextReport(body.rawText || '', fileName, timezoneOffsetHours);
    }

    let targetUser = user;
    if (targetTraderId && targetTraderId !== user.traderId) {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const found = await getUserByTraderId(targetTraderId);
      if (!found) {
        return NextResponse.json({ error: 'Target trader not found' }, { status: 404 });
      }
      targetUser = found;
    }

    const existingTrades = await listTradesByUser(targetUser.id);
    const rows = classifyImportedTrades(parsed.trades, existingTrades, {
      setup: defaultSetup,
      timeframe: defaultTimeframe,
    });

    const stats = {
      totalParsed: rows.length,
      newCount: rows.filter((r) => r.action === 'NEW').length,
      updateCount: rows.filter((r) => r.action === 'UPDATE_CLOSE').length,
      duplicateCount: rows.filter((r) => r.action === 'SKIP_DUPLICATE').length,
      ignoredRows: parsed.ignoredRows,
    };

    const response: ImportPreviewResponse = {
      fileName,
      detectedFormat: parsed.detectedFormat,
      accountMeta: parsed.accountMeta,
      stats,
      warnings: parsed.warnings,
      items: rows,
    };

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse trade report.' },
      { status: 500 }
    );
  }
}
