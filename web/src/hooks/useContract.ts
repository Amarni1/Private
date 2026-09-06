import { useState, useCallback } from 'react';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledEscrow } from '../lib/contract';
import { encodeAddress, detectUsdmColor } from '../lib/tokens';
import type { EscrowProviders } from '../lib/providers';

const PRIVATE_STATE_ID = 'usdm-private-escrow';

function log(tag: string, msg: string, data?: unknown) {
  console.log(`[Escrow ${tag}]`, msg, data ?? '');
}

function extractError(err: unknown): string {
  if (err instanceof Error) {
    const inner = (err as any).cause;
    if (inner instanceof Error) return `${err.message} → ${extractError(inner)}`;
    if (inner) return `${err.message} → ${String(inner)}`;
    return err.message;
  }
  return String(err);
}

export interface ContractState {
  contractAddress: string | null;
  deploying: boolean;
  calling: boolean;
  error: string | null;
}

export interface DeployResult {
  contractAddress: string;
  txHash: string;
}

export interface OpenResult {
  preimage: number[];
  txHash: string;
}

export function useContract(providers: EscrowProviders | null) {
  const [state, setState] = useState<ContractState>({
    contractAddress: null,
    deploying: false,
    calling: false,
    error: null,
  });

  const deploy = useCallback(async (): Promise<DeployResult | null> => {
    if (!providers) {
      log('deploy', 'No providers — wallet not connected or Lace not detected');
      return null;
    }
    setState((s) => ({ ...s, deploying: true, error: null }));
    log('deploy', 'Starting deploy...');
    try {
      log('deploy', 'Calling deployContract...');
      const deployed = await deployContract(providers, {
        compiledContract: CompiledEscrow,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      } as any);
      const txData = (deployed as any).deployTxData?.public ?? {};
      const addr = txData.contractAddress;
      const txHash = txData.txHash ?? 'unknown';
      log('deploy', 'Deploy succeeded', { contractAddress: addr, txHash });
      setState({ contractAddress: addr, deploying: false, calling: false, error: null });
      return { contractAddress: addr, txHash };
    } catch (err: any) {
      const msg = extractError(err);
      log('deploy', 'Deploy FAILED', msg);
      console.error('[Escrow deploy] Full error:', err);
      setState((s) => ({ ...s, deploying: false, error: msg }));
      return null;
    }
  }, [providers]);

  const openEscrow = useCallback(
    async (
      contractAddress: string,
      amount: bigint,
      releaseMinutes: number,
      refundHours: number,
    ): Promise<OpenResult | null> => {
      if (!providers) {
        log('open', 'No providers');
        return null;
      }
      setState((s) => ({ ...s, calling: true, error: null }));
      log('open', 'Starting openEscrow...', { contractAddress, amount: amount.toString() });
      try {
        log('open', 'Detecting USDM color...');
        const usdmColor = await detectUsdmColor(providers, contractAddress);
        log('open', 'USDM color:', usdmColor);

        const nowSec = Math.floor(Date.now() / 1000);
        const preimage = crypto.getRandomValues(new Uint8Array(32));
        log('open', 'Computing hashLock...');
        const { pureCircuits } = await import(
          '../../../src/managed/escrow/contract/index.js'
        );
        const hashLock: Uint8Array = pureCircuits.hashLockOf(preimage);
        log('open', 'hashLock computed');

        log('open', 'Querying on-chain state for depositor address...');
        const query = await providers.publicDataProvider.queryContractState(contractAddress);
        let depositAddr = { bytes: new Uint8Array(32) };
        if (query?.data) {
          const { ledger } = await import(
            '../../../src/managed/escrow/contract/index.js'
          );
          const decoded = ledger(query.data);
          const escrows = decoded.escrows;
          for (const [, rec] of escrows as any) {
            if (rec.depositor) {
              depositAddr = rec.depositor;
              break;
            }
          }
          log('open', 'Got depositor address from chain');
        } else {
          log('open', 'No on-chain state yet, using zero depositor');
        }

        const args = [
          hashLock,
          usdmColor,
          amount,
          depositAddr,
          BigInt(nowSec + releaseMinutes * 60),
          BigInt(nowSec + refundHours * 3600),
        ];
        log('open', 'Calling submitCallTx (proof generation + balance + sign)...', {
          circuitId: 'openEscrow',
          argsCount: args.length,
        });

        const result = await submitCallTx(providers, {
          compiledContract: CompiledEscrow,
          contractAddress,
          privateStateId: PRIVATE_STATE_ID,
          circuitId: 'openEscrow',
          args: args as any,
        });

        const txHash = (result as any)?.txHash
          ?? (result as any)?.public?.txHash
          ?? (result as any)?.identifiers?.()?.[0]
          ?? 'submitted';
        log('open', 'openEscrow succeeded', { txHash });
        setState((s) => ({ ...s, calling: false }));
        return { preimage: Array.from(preimage), txHash };
      } catch (err: any) {
        const msg = extractError(err);
        log('open', 'openEscrow FAILED', msg);
        console.error('[Escrow open] Full error:', err);
        setState((s) => ({ ...s, calling: false, error: msg }));
        return null;
      }
    },
    [providers],
  );

  const release = useCallback(
    async (
      contractAddress: string,
      escrowId: bigint,
      preimage: Uint8Array,
      recipientAddress: string,
    ): Promise<string | null> => {
      if (!providers) return null;
      setState((s) => ({ ...s, calling: true, error: null }));
      log('release', 'Starting release...', { escrowId: escrowId.toString() });
      try {
        const recipient = encodeAddress(recipientAddress);
        log('release', 'Recipient encoded, calling submitCallTx...');
        const result = await submitCallTx(providers, {
          compiledContract: CompiledEscrow,
          contractAddress,
          privateStateId: PRIVATE_STATE_ID,
          circuitId: 'release',
          args: [escrowId, preimage, recipient] as any,
        });
        const txHash = (result as any)?.txHash
          ?? (result as any)?.public?.txHash
          ?? (result as any)?.identifiers?.()?.[0]
          ?? 'submitted';
        log('release', 'Release succeeded', { txHash });
        setState((s) => ({ ...s, calling: false }));
        return txHash;
      } catch (err: any) {
        const msg = extractError(err);
        log('release', 'Release FAILED', msg);
        console.error('[Escrow release] Full error:', err);
        setState((s) => ({ ...s, calling: false, error: msg }));
        return null;
      }
    },
    [providers],
  );

  const refund = useCallback(
    async (contractAddress: string, escrowId: bigint): Promise<string | null> => {
      if (!providers) return null;
      setState((s) => ({ ...s, calling: true, error: null }));
      log('refund', 'Starting refund...', { escrowId: escrowId.toString() });
      try {
        const result = await submitCallTx(providers, {
          compiledContract: CompiledEscrow,
          contractAddress,
          privateStateId: PRIVATE_STATE_ID,
          circuitId: 'refund',
          args: [escrowId] as any,
        });
        const txHash = (result as any)?.txHash
          ?? (result as any)?.public?.txHash
          ?? (result as any)?.identifiers?.()?.[0]
          ?? 'submitted';
        log('refund', 'Refund succeeded', { txHash });
        setState((s) => ({ ...s, calling: false }));
        return txHash;
      } catch (err: any) {
        const msg = extractError(err);
        log('refund', 'Refund FAILED', msg);
        console.error('[Escrow refund] Full error:', err);
        setState((s) => ({ ...s, calling: false, error: msg }));
        return null;
      }
    },
    [providers],
  );

  return { ...state, deploy, openEscrow, release, refund };
}
