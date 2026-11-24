'use client';

import React, { useMemo, useState } from 'react';
import { BreakdownRow, EquityPoint, FirmEquityPoint } from '@/lib/types';
import { formatMoney, formatR } from '@/lib/format';

export function EquityCurveChart({
  points,
  initialCapital,
  currency,
}: {
  points: EquityPoint[];
  initialCapital: number;
  currency: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-[#6f7687] border border-dashed border-[#242936] rounded-xl">
        No closed trades yet — equity curve plots automatically after your first closed trade.
      </div>
    );
  }

  const allPoints: EquityPoint[] = [
    {
      index: 0,
      label: 'Start',
      date: points[0].date,
      pair: '',
      netPnl: 0,
      cumPnl: 0,
      equity: initialCapital,
      drawdown: 0,
    },
    ...points,
  ];

  const width = 760;
  const height = 220;
  const padL = 58;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const vals = allPoints.map((p) => p.equity);
  const minVal = Math.min(...vals, initialCapital);
  const maxVal = Math.max(...vals, initialCapital);
  const span = Math.max(maxVal - minVal, initialCapital * 0.01, 10);
  const yMin = minVal - span * 0.12;
  const yMax = maxVal + span * 0.12;

  const xFor = (i: number) =>
    allPoints.length <= 1 ? padL : padL + (i / (allPoints.length - 1)) * plotW;
  const yFor = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * plotH;

  const linePath = allPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.equity).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${xFor(allPoints.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const baseY = yFor(initialCapital);
  const latest = allPoints[allPoints.length - 1];
  const isPositive = latest.equity >= initialCapital;
  const strokeColor = isPositive ? '#c8a55b' : '#f87171';

  const activePoint = hoverIdx !== null ? allPoints[hoverIdx] : null;

  return (
    <div className="relative">
      {activePoint && (
        <div className="absolute right-3 top-1 z-10 bg-[#0b0d13]/95 border border-[#c8a55b]/40 rounded-lg px-3 py-1.5 text-[11px] font-mono-num shadow-lg pointer-events-none">
          <div className="text-[#9ea5b5]">
            {activePoint.label} · {activePoint.date}
          </div>
          <div className="text-white font-semibold">
            Equity: {formatMoney(activePoint.equity, currency)}
          </div>
          <div className="text-[#c8a55b]">
            DD: {formatMoney(activePoint.drawdown, currency)} · Trade:{' '}
            {formatMoney(activePoint.netPnl, currency, true)}
          </div>
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="tcmEqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
          const y = padT + t * plotH;
          const v = yMax - t * (yMax - yMin);
          return (
            <g key={idx}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 4"
              />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                fill="#737a8c"
                fontSize="10"
                className="font-mono-num"
              >
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Initial capital baseline */}
        <line
          x1={padL}
          x2={width - padR}
          y1={baseY}
          y2={baseY}
          stroke="rgba(200,165,91,0.3)"
          strokeDasharray="5 5"
        />

        <path d={areaPath} fill="url(#tcmEqGrad)" />
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.2" />

        {allPoints.map((p, i) => (
          <g key={i}>
            <circle
              cx={xFor(i)}
              cy={yFor(p.equity)}
              r={hoverIdx === i ? 5 : allPoints.length > 35 ? 1.8 : 3}
              fill={p.equity >= initialCapital ? '#e5c476' : '#f87171'}
              className="transition-all"
            />
            <rect
              x={xFor(i) - plotW / Math.max(allPoints.length * 2, 10)}
              y={padT}
              width={Math.max(plotW / Math.max(allPoints.length, 4), 10)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          </g>
        ))}

        {/* X labels */}
        <text x={padL} y={height - 6} fill="#737a8c" fontSize="10" className="font-mono-num">
          {allPoints[0].date}
        </text>
        <text
          x={width - padR}
          y={height - 6}
          textAnchor="end"
          fill="#737a8c"
          fontSize="10"
          className="font-mono-num"
        >
          {latest.date}
        </text>
      </svg>
    </div>
  );
}

export function DailyPnlChart({
  days,
  currency,
}: {
  days: Array<{ date: string; pnl: number; count: number }>;
  currency: string;
}) {
  if (days.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-[#6f7687] border border-dashed border-[#242936] rounded-xl">
        No closed trading days yet.
      </div>
    );
  }

  const slice = days.slice(-24);
  const maxAbs = Math.max(...slice.map((d) => Math.abs(d.pnl)), 10);

  return (
    <div className="h-48 flex flex-col justify-between">
      <div className="flex-1 flex items-end gap-1.5 pt-4 pb-2 border-b border-[#242936] relative">
        {slice.map((d) => {
          const pct = Math.max((Math.abs(d.pnl) / maxAbs) * 100, 6);
          const win = d.pnl >= 0;
          return (
            <div
              key={d.date}
              title={`${d.date}: ${formatMoney(d.pnl, currency, true)} (${d.count} trade${d.count === 1 ? '' : 's'})`}
              className="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              <div
                style={{ height: `${pct}%` }}
                className={`w-full max-w-[24px] rounded-t transition-all ${
                  win
                    ? 'bg-emerald-400/75 group-hover:bg-emerald-300'
                    : 'bg-rose-400/75 group-hover:bg-rose-300'
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] font-mono-num text-[#737a8c] pt-1.5">
        <span>{slice[0]?.date}</span>
        <span>Last {slice.length} active days</span>
        <span>{slice[slice.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function HorizontalBreakdownBars({
  rows,
  currency,
}: {
  rows: BreakdownRow[];
  currency: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[#6f7687]">
        No closed trades matching current filters.
      </div>
    );
  }
  const top = rows.slice(0, 8);
  const maxAbs = Math.max(...top.map((r) => Math.abs(r.netPnl)), 10);

  return (
    <div className="space-y-2.5">
      {top.map((r) => {
        const pct = Math.max((Math.abs(r.netPnl) / maxAbs) * 100, 4);
        const pos = r.netPnl >= 0;
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-[#e9e6dd] truncate">{r.label}</span>
                <span className="text-[10px] font-mono-num text-[#7f8698]">
                  {r.trades}T · {r.winRate.toFixed(0)}% WR
                </span>
              </div>
              <span
                className={`font-mono-num font-semibold ${
                  pos ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatMoney(r.netPnl, currency, true)}
              </span>
            </div>
            <div className="h-1.5 bg-[#0c0e14] rounded-full overflow-hidden">
              <div
                style={{ width: `${pct}%` }}
                className={`h-full rounded-full ${
                  pos ? 'bg-gradient-to-r from-[#c8a55b] to-emerald-400' : 'bg-rose-400/80'
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OutcomeDonut({
  wins,
  losses,
  be,
}: {
  wins: number;
  losses: number;
  be: number;
}) {
  const total = wins + losses + be;
  if (total === 0) {
    return (
      <div className="py-8 text-center text-xs text-[#6f7687]">No closed outcomes yet.</div>
    );
  }

  const r = 42;
  const c = 2 * Math.PI * r;
  const winLen = (wins / total) * c;
  const lossLen = (losses / total) * c;
  const beLen = (be / total) * c;

  return (
    <div className="flex items-center gap-6">
      <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0 -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#1b1f2b" strokeWidth="12" />
        {wins > 0 && (
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke="#34d399"
            strokeWidth="12"
            strokeDasharray={`${winLen} ${c}`}
            strokeDashoffset={0}
          />
        )}
        {losses > 0 && (
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke="#fb7185"
            strokeWidth="12"
            strokeDasharray={`${lossLen} ${c}`}
            strokeDashoffset={-winLen}
          />
        )}
        {be > 0 && (
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke="#c8a55b"
            strokeWidth="12"
            strokeDasharray={`${beLen} ${c}`}
            strokeDashoffset={-(winLen + lossLen)}
          />
        )}
      </svg>
      <div className="space-y-2 text-xs flex-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[#cbd0dc]">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Wins
          </span>
          <span className="font-mono-num font-semibold text-white">
            {wins} ({((wins / total) * 100).toFixed(1)}%)
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[#cbd0dc]">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Losses
          </span>
          <span className="font-mono-num font-semibold text-white">
            {losses} ({((losses / total) * 100).toFixed(1)}%)
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[#cbd0dc]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c8a55b]" /> Breakeven
          </span>
          <span className="font-mono-num font-semibold text-white">
            {be} ({((be / total) * 100).toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Fritsch-Carlson monotone cubic interpolation path builder.
 * Produces smooth flowing SVG curves that pass through every exact trade point without overshoot.
 */
function buildMonotoneSpline(coords: Array<{ x: number; y: number }>): string {
  const n = coords.length;
  if (n === 0) return '';
  if (n === 1) return `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  if (n === 2) {
    return `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)} L ${coords[1].x.toFixed(2)} ${coords[1].y.toFixed(2)}`;
  }

  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = new Array(n).fill(0);

  for (let i = 0; i < n - 1; i++) {
    dx.push(Math.max(coords[i + 1].x - coords[i].x, 0.0001));
    dy.push(coords[i + 1].y - coords[i].y);
  }
  const slopes = dy.map((v, i) => v / dx[i]);

  m[0] = slopes[0];
  m[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slopes[i - 1] + slopes[i]) / 2;
    }
  }

  // Clamp tangents to preserve strict monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-6) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / slopes[i];
      const b = m[i + 1] / slopes[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        m[i] = t * a * slopes[i];
        m[i + 1] = t * b * slopes[i];
      }
    }
  }

  let d = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i] / 3;
    const cp1x = coords[i].x + seg;
    const cp1y = coords[i].y + m[i] * seg;
    const cp2x = coords[i + 1].x - seg;
    const cp2y = coords[i + 1].y - m[i + 1] * seg;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${coords[i + 1].x.toFixed(2)} ${coords[i + 1].y.toFixed(2)}`;
  }
  return d;
}

function formatAxisCompact(value: number, mode: 'equity' | 'pnl' | 'roi'): string {
  if (mode === 'roi') {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : mode === 'pnl' && value > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function FirmEquityCurveChart({
  points,
  initialCapital,
  mode = 'equity',
  showDrawdown = true,
  windowLimit = 'ALL',
}: {
  points: FirmEquityPoint[];
  initialCapital: number;
  mode?: 'equity' | 'pnl' | 'roi';
  showDrawdown?: boolean;
  windowLimit?: 'ALL' | '30' | '90';
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const displayPoints = useMemo(() => {
    if (points.length === 0) return [];
    const sliced =
      windowLimit === '30'
        ? points.slice(-30)
        : windowLimit === '90'
          ? points.slice(-90)
          : points;

    const startPoint: FirmEquityPoint =
      windowLimit === 'ALL' || sliced.length === points.length
        ? {
            index: 0,
            label: 'Start',
            date: sliced[0].date,
            datetime: sliced[0].datetime,
            traderIdCode: 'FIRM',
            traderName: 'Allocated Starting Capital',
            pair: 'BASE',
            netPnl: 0,
            cumPnl: 0,
            equity: initialCapital,
            peakEquity: initialCapital,
            drawdown: 0,
            drawdownPct: 0,
          }
        : points[points.length - sliced.length - 1];

    return [startPoint, ...sliced];
  }, [points, initialCapital, windowLimit]);

  if (points.length === 0) {
    return (
      <div className="relative h-64 rounded-2xl border border-dashed border-[#272c3a] bg-[#080a0f]/80 flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        <div
          className="absolute inset-x-10 top-1/2 border-t border-dashed border-[#c8a55b]/35"
          aria-hidden="true"
        />
        <div className="relative z-10 bg-[#0d1017] border border-[#2a2f3e] rounded-xl px-5 py-4 max-w-md shadow-lg">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#c8a55b] font-semibold">
            Baseline Ready · {formatMoney(initialCapital)}
          </div>
          <p className="text-xs text-[#9ca3b5] mt-1.5 leading-relaxed">
            No closed executions across firm desks yet. As soon as any trader closes a trade or
            imports a broker statement, the live total firm equity curve & drawdown trajectory will
            animate here automatically.
          </p>
        </div>
      </div>
    );
  }

  const valueOf = (p: FirmEquityPoint): number => {
    if (mode === 'pnl') return p.cumPnl;
    if (mode === 'roi') return initialCapital > 0 ? (p.cumPnl / initialCapital) * 100 : 0;
    return p.equity;
  };

  const baselineVal = mode === 'equity' ? initialCapital : 0;
  const values = displayPoints.map(valueOf);
  const rawMin =
    windowLimit === 'ALL' ? Math.min(...values, baselineVal) : Math.min(...values);
  const rawMax =
    windowLimit === 'ALL' ? Math.max(...values, baselineVal) : Math.max(...values);
  const fallbackSpan = mode === 'roi' ? 2 : Math.max(initialCapital * 0.02, 100);
  const span = Math.max(rawMax - rawMin, fallbackSpan);
  const yMin = rawMin - span * 0.14;
  const yMax = rawMax + span * 0.16;

  const width = 920;
  const mainH = 228;
  const ddGap = showDrawdown ? 20 : 0;
  const ddH = showDrawdown ? 56 : 0;
  const padL = 68;
  const padR = 26;
  const padT = 18;
  const padB = 26;
  const height = padT + mainH + ddGap + ddH + padB;
  const plotW = width - padL - padR;

  const xFor = (i: number) =>
    displayPoints.length <= 1 ? padL : padL + (i / (displayPoints.length - 1)) * plotW;
  const yFor = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * mainH;

  const coords = displayPoints.map((p, i) => ({
    x: xFor(i),
    y: yFor(valueOf(p)),
  }));

  const linePath = buildMonotoneSpline(coords);
  const baselineY = yFor(baselineVal);
  const floorY = padT + mainH;
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${floorY.toFixed(2)} L ${coords[0].x.toFixed(2)} ${floorY.toFixed(2)} Z`;

  const latest = displayPoints[displayPoints.length - 1];
  const latestVal = valueOf(latest);
  const isUp = latestVal >= baselineVal;
  const peakVal = Math.max(...values);
  const peakY = yFor(peakVal);

  // Drawdown sub-chart coordinates
  const ddTop = padT + mainH + ddGap;
  const maxDdPctInView = Math.max(...displayPoints.map((p) => p.drawdownPct), 1);
  const ddYFor = (ddPct: number) => ddTop + (ddPct / (maxDdPctInView * 1.15)) * ddH;
  const ddCoords = displayPoints.map((p, i) => ({
    x: xFor(i),
    y: ddYFor(p.drawdownPct),
  }));
  const ddLinePath = buildMonotoneSpline(ddCoords);
  const ddAreaPath = `${ddLinePath} L ${ddCoords[ddCoords.length - 1].x.toFixed(2)} ${ddTop.toFixed(2)} L ${ddCoords[0].x.toFixed(2)} ${ddTop.toFixed(2)} Z`;

  const activeIdx = hoverIdx;
  const activePoint = activeIdx !== null ? displayPoints[activeIdx] : null;
  const activeCoord = activeIdx !== null ? coords[activeIdx] : null;
  const tooltipOnLeft = activeCoord ? activeCoord.x > width * 0.62 : false;

  // Pick up to 5 nicely spaced X-axis date ticks
  const tickIndices: number[] = [];
  const tickCount = Math.min(5, displayPoints.length);
  for (let k = 0; k < tickCount; k++) {
    const idx =
      tickCount === 1
        ? 0
        : Math.round((k / (tickCount - 1)) * (displayPoints.length - 1));
    if (!tickIndices.includes(idx)) tickIndices.push(idx);
  }

  function handlePointerMove(clientX: number, svgEl: SVGSVGElement) {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const clamped = Math.max(padL, Math.min(width - padR, svgX));
    const ratio = plotW > 0 ? (clamped - padL) / plotW : 0;
    const idx = Math.round(ratio * (displayPoints.length - 1));
    setHoverIdx(Math.max(0, Math.min(displayPoints.length - 1, idx)));
  }

  const lastCoord = coords[coords.length - 1];
  const strokeMain = isUp ? 'url(#tcmFirmGoldStroke)' : 'url(#tcmFirmRoseStroke)';
  const fillMain = isUp ? 'url(#tcmFirmGoldArea)' : 'url(#tcmFirmRoseArea)';
  const accentColor = isUp ? '#e6c77a' : '#fb7185';

  return (
    <div className="relative select-none">
      {/* Interactive Floating Crosshair Tooltip */}
      {activePoint && activeCoord && (
        <div
          style={{
            left: tooltipOnLeft ? undefined : `${Math.min((activeCoord.x / width) * 100 + 1.5, 68)}%`,
            right: tooltipOnLeft ? `${Math.min(((width - activeCoord.x) / width) * 100 + 1.5, 68)}%` : undefined,
          }}
          className="absolute top-2 z-20 w-60 rounded-xl bg-[#090b10]/95 backdrop-blur-md border border-[#c8a55b]/45 p-3 shadow-[0_14px_34px_rgba(0,0,0,0.65)] pointer-events-none"
        >
          <div className="flex items-center justify-between text-[10px] font-mono-num text-[#8f96a8]">
            <span>{activePoint.index === 0 ? 'STARTING BASELINE' : `EXECUTION ${activePoint.label}`}</span>
            <span>{activePoint.date}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#e6c77a] truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8a55b]" />
              {activePoint.traderIdCode}
              {activePoint.index > 0 ? ` · ${activePoint.pair}` : ''}
            </span>
            {activePoint.index > 0 && (
              <span
                className={`font-mono-num text-[11px] font-semibold ${
                  activePoint.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatMoney(activePoint.netPnl, 'USD', true)}
              </span>
            )}
          </div>
          {activePoint.index > 0 && (
            <div className="text-[10px] text-[#7f8698] truncate">{activePoint.traderName}</div>
          )}

          <div className="mt-2 pt-2 border-t border-[#1e222f] grid grid-cols-2 gap-y-1 text-[11px] font-mono-num">
            <span className="text-[#8d94a5]">Firm Equity</span>
            <span className="text-right text-white font-semibold">
              {formatMoney(activePoint.equity)}
            </span>
            <span className="text-[#8d94a5]">Total Net P&amp;L</span>
            <span
              className={`text-right font-semibold ${
                activePoint.cumPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatMoney(activePoint.cumPnl, 'USD', true)}
            </span>
            <span className="text-[#8d94a5]">Drawdown</span>
            <span
              className={`text-right ${
                activePoint.drawdown < 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {formatMoney(activePoint.drawdown)} ({activePoint.drawdownPct.toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible cursor-crosshair"
        onMouseMove={(e) => handlePointerMove(e.clientX, e.currentTarget)}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.currentTarget);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="tcmFirmGoldStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#b99142" />
            <stop offset="55%" stopColor="#e8c87a" />
            <stop offset="100%" stopColor="#f8e3a8" />
          </linearGradient>
          <linearGradient id="tcmFirmGoldArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8a55b" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#c8a55b" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#090b10" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="tcmFirmRoseStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e11d48" />
            <stop offset="60%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#fda4af" />
          </linearGradient>
          <linearGradient id="tcmFirmRoseArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.28" />
            <stop offset="65%" stopColor="#f43f5e" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#090b10" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="tcmFirmDdFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#e11d48" stopOpacity="0.42" />
          </linearGradient>
          <filter id="tcmFirmLineGlow" x="-10%" y="-25%" width="120%" height="150%">
            <feGaussianBlur stdDeviation="3.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Main Plot Background Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
          const y = padT + t * mainH;
          const v = yMax - t * (yMax - yMin);
          return (
            <g key={idx}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.055)"
                strokeDasharray="3 5"
              />
              <text
                x={padL - 10}
                y={y + 3.5}
                textAnchor="end"
                fill="#7b8294"
                fontSize="10"
                className="font-mono-num"
              >
                {formatAxisCompact(v, mode)}
              </text>
            </g>
          );
        })}

        {/* Allocated Starting Capital / Zero Baseline */}
        {baselineY >= padT && baselineY <= floorY && (
          <g>
            <line
              x1={padL}
              x2={width - padR}
              y1={baselineY}
              y2={baselineY}
              stroke="rgba(200,165,91,0.34)"
              strokeDasharray="6 5"
              strokeWidth="1"
            />
            <rect
              x={padL + 4}
              y={baselineY - 15}
              width="52"
              height="13"
              rx="3"
              fill="#141822"
              stroke="rgba(200,165,91,0.3)"
            />
            <text
              x={padL + 30}
              y={baselineY - 6}
              textAnchor="middle"
              fill="#c8a55b"
              fontSize="8.5"
              className="font-mono-num font-semibold"
            >
              {mode === 'equity' ? 'START' : 'ZERO'}
            </text>
          </g>
        )}

        {/* High-Water Mark Line */}
        {peakVal > baselineVal && peakY >= padT && peakY <= floorY && (
          <g>
            <line
              x1={padL}
              x2={width - padR}
              y1={peakY}
              y2={peakY}
              stroke="rgba(52, 211, 153, 0.25)"
              strokeDasharray="2 5"
              strokeWidth="1"
            />
            <text
              x={width - padR - 4}
              y={Math.max(padT + 9, peakY - 4)}
              textAnchor="end"
              fill="#6ee7b7"
              fontSize="9"
              opacity="0.8"
              className="font-mono-num"
            >
              PEAK {formatAxisCompact(peakVal, mode)}
            </text>
          </g>
        )}

        {/* Equity Area + Glowing Smooth Spline */}
        <path d={areaPath} fill={fillMain} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeMain}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#tcmFirmLineGlow)"
        />

        {/* Subtle Data Nodes when count is small */}
        {displayPoints.length <= 45 &&
          coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={activeIdx === i ? 4.5 : 2.3}
              fill={i === 0 ? '#8d94a5' : accentColor}
              opacity={activeIdx === i ? 1 : 0.72}
            />
          ))}

        {/* Live Endpoint Beacon */}
        <g>
          <circle cx={lastCoord.x} cy={lastCoord.y} r="9" fill={accentColor} opacity="0.16">
            <animate attributeName="r" values="6;12;6" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.28;0.05;0.28" dur="2.6s" repeatCount="indefinite" />
          </circle>
          <circle
            cx={lastCoord.x}
            cy={lastCoord.y}
            r="4"
            fill={accentColor}
            stroke="#090b10"
            strokeWidth="1.8"
          />
        </g>

        {/* Underwater Drawdown Sub-Ribbon */}
        {showDrawdown && (
          <g>
            <line
              x1={padL}
              x2={width - padR}
              y1={ddTop}
              y2={ddTop}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
            <line
              x1={padL}
              x2={width - padR}
              y1={ddTop + ddH}
              y2={ddTop + ddH}
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="2 4"
            />
            <text
              x={padL - 10}
              y={ddTop + 8}
              textAnchor="end"
              fill="#7b8294"
              fontSize="9"
              className="font-mono-num"
            >
              0.0% DD
            </text>
            <text
              x={padL - 10}
              y={ddTop + ddH - 2}
              textAnchor="end"
              fill="#fb7185"
              fontSize="9"
              className="font-mono-num"
            >
              -{maxDdPctInView.toFixed(1)}%
            </text>
            <path d={ddAreaPath} fill="url(#tcmFirmDdFill)" />
            <path d={ddLinePath} fill="none" stroke="#fb7185" strokeWidth="1.4" opacity="0.9" />
          </g>
        )}

        {/* Active Hover Crosshair across Both Bands */}
        {activeCoord && activeIdx !== null && (
          <g pointerEvents="none">
            <line
              x1={activeCoord.x}
              x2={activeCoord.x}
              y1={padT}
              y2={showDrawdown ? ddTop + ddH : floorY}
              stroke="rgba(230, 199, 122, 0.55)"
              strokeDasharray="3 3"
              strokeWidth="1.2"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="7.5"
              fill="rgba(200,165,91,0.2)"
              stroke={accentColor}
              strokeWidth="1.5"
            />
            <circle cx={activeCoord.x} cy={activeCoord.y} r="3.2" fill="#ffffff" />
            {showDrawdown && ddCoords[activeIdx] && (
              <circle
                cx={ddCoords[activeIdx].x}
                cy={ddCoords[activeIdx].y}
                r="3.2"
                fill="#fb7185"
                stroke="#ffffff"
                strokeWidth="1.2"
              />
            )}
          </g>
        )}

        {/* X-Axis Date Labels */}
        {tickIndices.map((idx, i) => {
          const p = displayPoints[idx];
          const x = coords[idx].x;
          const anchor = i === 0 ? 'start' : i === tickIndices.length - 1 ? 'end' : 'middle';
          return (
            <text
              key={idx}
              x={x}
              y={height - 6}
              textAnchor={anchor}
              fill="#757c8e"
              fontSize="10"
              className="font-mono-num"
            >
              {idx === 0 && windowLimit === 'ALL' ? `Start (${p.date})` : p.date}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
