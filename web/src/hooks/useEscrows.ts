import { useState, useCallback } from 'react';
import { ledger } from '../lib/tokens';
import type { EscrowRecord, EscrowStatus } from '../lib/tokens';
import type { EscrowProviders } from '../lib/providers';

function log(tag: string, msg: string, data?: unknown) {
  console.log(`[Escrows ${tag}]`, msg, data ?? '');
}

export interface Escrow {
  id: bigint;
  hashLock: Uint8Array;
  tokenColor: Uint8Array;
  amount: bigint;
  depositor: { bytes: Uint8Array };
  releaseDeadline: bigint;
  refundDeadline: bigint;
  status: EscrowStatus;
}

const STATUS_LABELS = ['Open', 'Released', 'Refunded'] as const;

export function statusLabel(s: EscrowStatus): string {
  return STATUS_LABELS[s as number] ?? 'Unknown';
}

export function useEscrows(providers: EscrowProviders | null) {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (contractAddress: string) => {
      if (!providers) return;
      setLoading(true);
      setError(null);
      log('refresh', 'Querying contract state...', { contractAddress });
      try {
        const query = await providers.publicDataProvider.queryContractState(
          contractAddress,
        );
        if (!query?.data) {
          log('refresh', 'No on-chain state found');
          setEscrows([]);
          setLoading(false);
          return;
        }
        log('refresh', 'Got chain state, decoding ledger...');
        const decoded = ledger(query.data);
        const result: Escrow[] = [];
        const escrowsMap = decoded.escrows;
        const nextId = Number(decoded.nextId ?? 0n);
        log('refresh', `nextId=${nextId}`);
        for (let i = 0; i < nextId; i++) {
          const id = BigInt(i);
          if (escrowsMap.member(id)) {
            const rec = escrowsMap.lookup(id) as unknown as EscrowRecord;
            log('refresh', `Escrow #${i}:`, {
              status: rec.status,
              amount: rec.amount?.toString(),
              tokenColor: Array.from(rec.tokenColor ?? []).map(b => b.toString(16).padStart(2, '0')).join(''),
            });
            result.push({
              id,
              hashLock: rec.hashLock,
              tokenColor: rec.tokenColor,
              amount: rec.amount,
              depositor: rec.depositor,
              releaseDeadline: rec.releaseDeadline,
              refundDeadline: rec.refundDeadline,
              status: rec.status,
            });
          }
        }
        log('refresh', `Found ${result.length} escrows`);
        setEscrows(result);
      } catch (err: any) {
        const msg = err?.message ?? 'Failed to read escrows';
        log('refresh', 'ERROR:', msg);
        console.error('[Escrows] Full error:', err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [providers],
  );

  return { escrows, loading, error, refresh };
}
