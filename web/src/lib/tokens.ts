import { ledger } from '../../../src/managed/escrow/contract/index.js';

export { ledger };
export type { Ledger, EscrowRecord, EscrowStatus } from '../../../src/managed/escrow/contract/index.js';

import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';

const USDM_COLOR_FALLBACK = new Uint8Array(32);

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

export async function detectUsdmColor(
  providers: any,
  contractAddress: string,
): Promise<Uint8Array> {
  try {
    const query = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    if (query?.data) {
      const decoded = ledger(query.data);
      const escrows = decoded.escrows;
      for (const [, rec] of escrows as any) {
        if (rec.tokenColor) return rec.tokenColor;
      }
    }
  } catch {}
  return USDM_COLOR_FALLBACK;
}
