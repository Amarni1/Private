import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type {
  MidnightProvider,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import {
  Transaction,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';

function log(tag: string, msg: string, data?: unknown) {
  console.log(`[Wallet ${tag}]`, msg, data ?? '');
}

export interface WalletAddresses {
  shieldedAddress: string;
  shieldedCoinPublicKey: string;
  shieldedEncryptionPublicKey: string;
  unshieldedAddress: string;
}

export interface WalletBalances {
  unshielded: Record<string, bigint>;
  shielded: Record<string, bigint>;
}

export async function getAddresses(
  api: ConnectedAPI,
): Promise<WalletAddresses> {
  const [shielded, unshielded] = await Promise.all([
    api.getShieldedAddresses(),
    api.getUnshieldedAddress(),
  ]);
  return {
    shieldedAddress: shielded.shieldedAddress,
    shieldedCoinPublicKey: shielded.shieldedCoinPublicKey,
    shieldedEncryptionPublicKey: shielded.shieldedEncryptionPublicKey,
    unshieldedAddress: unshielded.unshieldedAddress,
  };
}

export async function getBalances(api: ConnectedAPI): Promise<WalletBalances> {
  const [unshielded, shielded] = await Promise.all([
    api.getUnshieldedBalances(),
    api.getShieldedBalances(),
  ]);
  return { unshielded, shielded };
}

export function createWalletProvider(
  api: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
): WalletProvider {
  return {
    getCoinPublicKey: () => coinPublicKey as any,
    getEncryptionPublicKey: () => encryptionPublicKey as any,
    balanceTx: async (tx: UnboundTransaction): Promise<any> => {
      log('balanceTx', 'Serializing unbalanced tx...');
      const serialized = toHex((tx as any).serialize());
      log('balanceTx', 'Calling wallet.balanceUnsealedTransaction...');
      const { tx: balancedHex } =
        await api.balanceUnsealedTransaction(serialized);
      log('balanceTx', 'Balancing succeeded, deserializing...');
      return Transaction.deserialize(
        'signature',
        'proof',
        'binding',
        fromHex(balancedHex),
      );
    },
  };
}

export function createMidnightProvider(api: ConnectedAPI): MidnightProvider {
  return {
    submitTx: async (tx: any): Promise<string> => {
      const hex = toHex(tx.serialize());
      log('submitTx', 'Calling wallet.submitTransaction...');
      await api.submitTransaction(hex);
      const hash = tx.identifiers?.()[0] ?? 'submitted';
      log('submitTx', 'Transaction submitted', { hash });
      return hash;
    },
  };
}
