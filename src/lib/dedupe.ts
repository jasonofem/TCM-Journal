import { getPriceDecimals, normalizePair } from './trading-math';
import {
  ClassifiedImportRow,
  ParsedTradeCandidate,
  PositionSide,
  TradeRecord,
} from './types';

export function buildTradeFingerprint(input: {
  pair: string;
  position: PositionSide;
  entryDatetime: string;
  entryPrice: number;
  lots: number;
}): string {
  const pair = normalizePair(input.pair);
  const decimals = getPriceDecimals(pair);
  const dt = (input.entryDatetime || '').trim().slice(0, 19);
  const priceStr = Number(input.entryPrice || 0).toFixed(decimals);
  const lotsStr = Number(input.lots || 0).toFixed(2);
  return `${pair}|${input.position}|${dt}|${priceStr}|${lotsStr}`;
}

export function buildLooseFingerprint(input: {
  pair: string;
  position: PositionSide;
  entryDate: string;
  entryTime: string;
  entryPrice: number;
  lots: number;
}): string {
  // Minute-level match for Excel/CSV exports that drop seconds (HH:MM vs HH:MM:SS)
  const pair = normalizePair(input.pair);
  const decimals = getPriceDecimals(pair);
  const hm = `${input.entryDate} ${(input.entryTime || '00:00').slice(0, 5)}`;
  const priceStr = Number(input.entryPrice || 0).toFixed(decimals);
  const lotsStr = Number(input.lots || 0).toFixed(2);
  return `${pair}|${input.position}|${hm}|${priceStr}|${lotsStr}`;
}

function approxSameNumber(a: number | null, b: number | null, tol = 0.0001): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tol;
}

export function classifyImportedTrades(
  candidates: ParsedTradeCandidate[],
  existingTrades: TradeRecord[],
  defaults: { setup: string; timeframe: string | null }
): ClassifiedImportRow[] {
  const byTicket = new Map<string, TradeRecord[]>();
  const byFingerprint = new Map<string, TradeRecord>();
  const byLooseFingerprint = new Map<string, TradeRecord>();

  for (const t of existingTrades) {
    if (t.brokerTicket && t.brokerTicket.trim()) {
      const key = t.brokerTicket.trim();
      const arr = byTicket.get(key);
      if (arr) arr.push(t);
      else byTicket.set(key, [t]);
    }
    if (t.fingerprint) {
      byFingerprint.set(t.fingerprint, t);
    }
    const fp = buildTradeFingerprint({
      pair: t.pair,
      position: t.position,
      entryDatetime: t.entryDatetime,
      entryPrice: t.entryPrice,
      lots: t.lots,
    });
    byFingerprint.set(fp, t);
    byLooseFingerprint.set(
      buildLooseFingerprint({
        pair: t.pair,
        position: t.position,
        entryDate: t.entryDate,
        entryTime: t.entryTime,
        entryPrice: t.entryPrice,
        lots: t.lots,
      }),
      t
    );
  }

  // Also deduplicate within the incoming file itself
  const seenInBatch = new Set<string>();

  return candidates.map((cand) => {
    const chosenSession = cand.session || 'London';
    const chosenSetup = cand.setup || defaults.setup || 'H1 5050 Bounce';
    const chosenTimeframe = defaults.timeframe || null;

    const batchKey = cand.brokerTicket
      ? `T:${cand.brokerTicket}|${cand.lots.toFixed(2)}|${cand.exitDatetime || 'OPEN'}`
      : `F:${cand.fingerprint}`;

    if (seenInBatch.has(batchKey)) {
      return {
        candidate: cand,
        action: 'SKIP_DUPLICATE',
        reason: 'Duplicate row within this uploaded report',
        matchedTradeId: null,
        matchedTradeSn: null,
        session: chosenSession,
        setup: chosenSetup,
        timeframe: chosenTimeframe,
        include: false,
      };
    }
    seenInBatch.add(batchKey);

    let matched: TradeRecord | null = null;
    let matchBasis = '';

    // 1. Broker ticket / Position ID match
    if (cand.brokerTicket && byTicket.has(cand.brokerTicket.trim())) {
      const ticketMatches = byTicket.get(cand.brokerTicket.trim())!;
      // Handle potential partial closes sharing a Position ID by checking lots & exitDatetime if multiple
      const exactSameExec = ticketMatches.find(
        (m) =>
          approxSameNumber(m.lots, cand.lots, 0.005) &&
          (!m.exitDatetime || !cand.exitDatetime || m.exitDatetime === cand.exitDatetime)
      );
      if (exactSameExec) {
        matched = exactSameExec;
        matchBasis = `Ticket #${cand.brokerTicket}`;
      } else if (ticketMatches.length === 1 && ticketMatches[0].exitPrice === null && !cand.isOpen) {
        matched = ticketMatches[0];
        matchBasis = `Ticket #${cand.brokerTicket}`;
      }
    }

    // 2. Exact canonical fingerprint match
    if (!matched && byFingerprint.has(cand.fingerprint)) {
      matched = byFingerprint.get(cand.fingerprint)!;
      matchBasis = 'Exact pair + entry time + price + lots';
    }

    // 3. Minute-level match (when CSV/Excel truncates seconds)
    if (!matched) {
      const loose = buildLooseFingerprint({
        pair: cand.pair,
        position: cand.position,
        entryDate: cand.entryDate,
        entryTime: cand.entryTime,
        entryPrice: cand.entryPrice,
        lots: cand.lots,
      });
      if (byLooseFingerprint.has(loose)) {
        matched = byLooseFingerprint.get(loose)!;
        matchBasis = 'Pair + entry minute + price + lots';
      }
    }

    if (matched) {
      const existingWasOpen = matched.exitPrice === null || !matched.exitDate;
      if (existingWasOpen && !cand.isOpen && cand.exitPrice !== null) {
        return {
          candidate: cand,
          action: 'UPDATE_CLOSE',
          reason: `Matches open trade #${matched.sn} (${matchBasis}) — will close with exit ${cand.exitPrice}`,
          matchedTradeId: matched.id,
          matchedTradeSn: matched.sn,
          session: matched.session || chosenSession,
          setup: matched.setup || chosenSetup,
          timeframe: matched.timeframe || chosenTimeframe,
          include: true,
        };
      }

      return {
        candidate: cand,
        action: 'SKIP_DUPLICATE',
        reason: `Already recorded as #${matched.sn} (${matchBasis})`,
        matchedTradeId: matched.id,
        matchedTradeSn: matched.sn,
        session: matched.session || chosenSession,
        setup: matched.setup || chosenSetup,
        timeframe: matched.timeframe || chosenTimeframe,
        include: false,
      };
    }

    return {
      candidate: cand,
      action: 'NEW',
      reason: cand.isOpen ? 'New open position' : 'New closed trade',
      matchedTradeId: null,
      matchedTradeSn: null,
      session: chosenSession,
      setup: chosenSetup,
      timeframe: chosenTimeframe,
      include: true,
    };
  });
}
