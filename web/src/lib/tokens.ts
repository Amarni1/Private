import { ledger } from '../../../src/managed/escrow/contract/index.js';

export { ledger };
export type { Ledger, EscrowRecord, EscrowStatus } from '../../../src/managed/escrow/contract/index.js';

import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';

const USDM_COLOR_FALLBACK = new Uint8Array(32);

function log(tag: string, msg: string, data?: unknown) {
  console.log(`[Tokens ${tag}]`, msg, data ?? '');
}

export function encodeAddress(address: string): { bytes: Uint8Array } {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < Math.min(address.length, 64); i += 2) {
    bytes[i / 2] = parseInt(address.substring(i, i + 2), 16);
  }
  return { bytes };
}

export function decodeAddress(encoded: { bytes: Uint8Array }): string {
  return toHex(encoded.bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function detectUsdmColor(
  providers: any,
  contractAddress: string,
  walletBalances?: Record<string, bigint>,
): Promise<Uint8Array> {
  log('detect', 'Detecting USDM color...');

  // 1) Try to get from existing on-chain contract state
  try {
    const query = await providers.publicDataProvider.queryContractState(contractAddress);
    if (query?.data) {
      const decoded = ledger(query.data);
      const escrows = decoded.escrows;
      for (const [, rec] of escrows as any) {
        if (rec.tokenColor) {
          const hex = bytesToHex(rec.tokenColor);
          log('detect', 'Got USDM color from chain state:', hex);
          return rec.tokenColor;
        }
      }
    }
  } catch (e) {
    log('detect', 'Chain state query failed:', e);
  }

  // 2) Try to find from wallet balances (non-zero colors)
  if (walletBalances) {
    const allColors = Object.keys(walletBalances).filter(
      (k) => k !== '0'.repeat(64),
    );
    log('detect', 'Wallet token colors:', allColors);
    if (allColors.length > 0) {
      const colorBytes = new Uint8Array(32);
      const hex = allColors[0];
      for (let i = 0; i < Math.min(hex.length, 64); i += 2) {
        colorBytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      log('detect', 'Using first wallet token color:', hex);
      return colorBytes;
    }
  }

  log('detect', 'WARNING: Using zero fallback color — USDM transfer may fail');
  return USDM_COLOR_FALLBACK;
}
