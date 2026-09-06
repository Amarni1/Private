import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

export type StoredEscrow = {
  preimage: string;
  amount: string;
  tokenColor: string;
  releaseDeadline: string;
  refundDeadline: string;
  depositor: string;
};

export type EscrowState = {
  network: string;
  contractAddress?: string;
  escrows: Record<string, StoredEscrow>;
};

const STATE_FILE = 'escrow-state.json';

export function loadState(network: string): EscrowState {
  if (!existsSync(STATE_FILE)) {
    return { network, escrows: {} };
  }
  const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as EscrowState;
  if (parsed.network !== network) {
    throw new Error(
      `escrow-state.json was created for network '${parsed.network}' but you are on '${network}'. ` +
        `Use a different working directory or delete the file.`,
    );
  }
  return parsed;
}

export function saveState(state: EscrowState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function newPreimage(): string {
  return toHex(randomBytes(32));
}

export function getContractAddress(state: EscrowState): string {
  if (!state.contractAddress) {
    throw new Error('No contract deployed yet. Run `npm run deploy` first.');
  }
  return state.contractAddress;
}