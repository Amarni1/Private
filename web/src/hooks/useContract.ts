import { useState, useCallback } from 'react';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledEscrow } from '../lib/contract';
import { encodeAddress, detectUsdmColor } from '../lib/tokens';
import type { EscrowProviders } from '../lib/providers';
import { getZkConfigProvider } from '../lib/providers';

const PRIVATE_STATE_ID = 'usdm-private-escrow';

export interface ContractState {
  contractAddress: string | null;
  deploying: boolean;
  calling: boolean;
  error: string | null;
}

export function useContract(providers: EscrowProviders | null) {
  const [state, setState] = useState<ContractState>({
    contractAddress: null,
    deploying: false,
    calling: false,
    error: null,
  });

  const deploy = useCallback(async () => {
    if (!providers) return;
    setState((s) => ({ ...s, deploying: true, error: null }));
    try {
      const deployed = await deployContract(providers, {
        compiledContract: CompiledEscrow,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });
      const addr = deployed.deployTxData.public.contractAddress;
      setState({ contractAddress: addr, deploying: false, calling: false, error: null });
      return addr;
    } catch (err: any) {
      setState((s) => ({ ...s, deploying: false, error: err?.message ?? 'Deploy failed' }));
      return null;
    }
  }, [providers]);

  const openEscrow = useCallback(
    async (
      contractAddress: string,
      amount: bigint,
      releaseMinutes: number,
      refundHours: number,
    ) => {
      if (!providers) return null;
      setState((s) => ({ ...s, calling: true, error: null }));
      try {
        const usdmColor = await detectUsdmColor(providers, contractAddress);
        const nowSec = Math.floor(Date.now() / 1000);
        const preimage = crypto.getRandomValues(new Uint8Array(32));
        const { pureCircuits } = await import(
          '../../../src/managed/escrow/contract/index.js'
        );
        const hashLock: Uint8Array = pureCircuits.hashLockOf(preimage);

        const query = await providers.publicDataProvider.queryContractState(
          contractAddress,
        );
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
        }

        await submitCallTx(providers, {
          compiledContract: CompiledEscrow,
          contractAddress,
          privateStateId: PRIVATE_STATE_ID,
          circuitId: 'openEscrow',
          args: [
            hashLock,
            usdmColor,
            amount,
            depositAddr,
            BigInt(nowSec + releaseMinutes * 60),
            BigInt(nowSec + refundHours * 3600),
          ],
        });
        setState((s) => ({ ...s, calling: false }));
        return { preimage: Array.from(preimage) };
      } catch (err: any) {
        setState((s) => ({ ...s, calling: false, error: err?.message ?? 'Open failed' }));
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
    ) => {
      if (!providers) return;
      setState((s) => ({ ...s, calling: true, error: null }));
      try {
        const recipient = encodeAddress(recipientAddress);
        await submitCallTx(providers, {
          compiledContract: CompiledEscrow,
          contractAddress,
          privateStateId: PRIVATE_STATE_ID,
          circuitId: 'release',
          args: [escrowId, preimage, recipient],
        });
        setState((s) => ({ ...s, calling: false }));
      } catch (err: any) {
        setState((s) => ({ ...s, calling: false, error: err?.message ?? 'Release failed' }));
      }
    },
    [providers],
  );

  const refund = useCallback(
    async (contractAddress: string, escrowId: bigint) => {
      if (!providers) return;
      setState((s) => ({ ...s, calling: true, error: null }));
      try {
        await submitCallTx(providers, {
          compiledContract: CompiledEscrow,
          contractAddress,
          privateStateId: PRIVATE_STATE_ID,
          circuitId: 'refund',
          args: [escrowId],
        });
        setState((s) => ({ ...s, calling: false }));
      } catch (err: any) {
        setState((s) => ({ ...s, calling: false, error: err?.message ?? 'Refund failed' }));
      }
    },
    [providers],
  );

  return { ...state, deploy, openEscrow, release, refund };
}
