import { useState, useCallback } from 'react';

export interface TxEntry {
  id: string;
  type: 'deploy' | 'open' | 'release' | 'refund';
  txHash: string;
  contractAddress: string;
  timestamp: number;
  detail: string;
  status: 'submitted' | 'confirmed' | 'failed';
  error?: string;
}

const STORAGE_KEY = 'usdm-escrow-tx-history';

function loadHistory(): TxEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: TxEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useTransactionHistory() {
  const [entries, setEntries] = useState<TxEntry[]>(loadHistory);

  const addEntry = useCallback(
    (entry: Omit<TxEntry, 'id' | 'timestamp'>) => {
      const newEntry: TxEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      setEntries((prev) => {
        const next = [newEntry, ...prev];
        saveHistory(next);
        return next;
      });
      return newEntry.id;
    },
    [],
  );

  const updateEntry = useCallback((id: string, updates: Partial<TxEntry>) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...updates } : e));
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { entries, addEntry, updateEntry, clearHistory };
}
