import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';

export const NIGHT_RAW = unshieldedToken().raw;

export function normalizedUnshieldedBalances(state: any): Record<string, bigint> {
  const balances: Record<string, unknown> = state?.unshielded?.balances ?? {};
  const out: Record<string, bigint> = {};
  for (const [key, value] of Object.entries(balances)) {
    const color = normalizeColor(key);
    out[color] = BigInt((value as bigint | number | string | undefined) ?? 0n);
  }
  return out;
}

export function normalizeColor(color: unknown): string {
  if (color instanceof Uint8Array) return toHex(color);
  if (typeof color === 'string') {
    return color.startsWith('0x') ? color.slice(2) : color;
  }
  throw new Error(`Cannot normalize token color of type ${typeof color}`);
}

export function findUsdmBalance(
  balances: Record<string, bigint>,
  usdmColor?: string,
): string | undefined {
  const wanted = usdmColor ? normalizeColor(usdmColor) : undefined;
  const candidates = Object.keys(balances).filter((c) => c !== normalizeColor(NIGHT_RAW));
  if (wanted && (balances[wanted] ?? 0n) > 0n) return wanted;
  return candidates.find((c) => (balances[c] ?? 0n) > 0n);
}

export function describeBalances(balances: Record<string, bigint>): string {
  const lines = Object.entries(balances)
    .sort((a, b) => Number(b[1] - a[1]))
    .map(([color, amount]) => {
      const label =
        normalizeColor(NIGHT_RAW) === color ? `NIGHT ${amount}` : `${color} (unshielded) ${amount}`;
      return `  ${label}`;
    });
  return lines.join('\n');
}