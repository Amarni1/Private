import { useState, useCallback } from 'react';
import { ledger } from '../lib/tokens';
import type { EscrowRecord, EscrowStatus } from '../lib/tokens';
import type { EscrowProviders } from '../lib/providers';

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
      try {
        const query = await providers.publicDataProvider.queryContractState(
          contractAddress,
        );
        if (!query?.data) {
          setEscrows([]);
          setLoading(false);
          return;
        }
        const decoded = ledger(query.data);
        const result: Escrow[] = [];
        const escrowsMap = decoded.escrows;
        const nextId = Number(decoded.nextId ?? 0n);
        for (let i = 0; i < nextId; i++) {
          const id = BigInt(i);
          if (escrowsMap.member(id)) {
            const rec = escrowsMap.lookup(id) as unknown as EscrowRecord;
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
        setEscrows(result);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to read escrows');
      } finally {
        setLoading(false);
      }
    },
    [providers],
  );

  return { escrows, loading, error, refresh };
}
