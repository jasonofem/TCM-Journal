'use client';

import React, { useState } from 'react';
import { BreakdownRow, EquityPoint } from '@/lib/types';
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
