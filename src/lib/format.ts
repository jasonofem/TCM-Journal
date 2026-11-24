import { getPriceDecimals } from './trading-math';

export function formatMoney(
  val: number | null | undefined,
  currency = 'USD',
  showPlus = false
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val < 0 ? '-' : showPlus && val > 0 ? '+' : '';
  const sym =
    currency === 'EUR'
      ? '€'
      : currency === 'GBP'
        ? '£'
        : currency === 'NGN'
          ? '₦'
          : '$';
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${sym}${abs}`;
}

export function formatPrice(val: number | null | undefined, pair: string): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toFixed(getPriceDecimals(pair));
}

export function formatPct(val: number | null | undefined, showPlus = false): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val > 0 && showPlus ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function formatR(val: number | null | undefined, showPlus = true): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val > 0 && showPlus ? '+' : '';
  return `${sign}${val.toFixed(2)}R`;
}

export function formatPips(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toISOString().slice(0, 10);
}
