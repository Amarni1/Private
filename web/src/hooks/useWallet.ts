import { useState, useCallback, useEffect, useRef } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { WalletAddresses, WalletBalances } from '../lib/walletAdapter';
import { getAddresses, getBalances } from '../lib/walletAdapter';
import type { EscrowProviders } from '../lib/providers';
import { buildBrowserProviders } from '../lib/providers';

function log(tag: string, msg: string, data?: unknown) {
  console.log(`[WalletHook ${tag}]`, msg, data ?? '');
}

export interface WalletState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  api: ConnectedAPI | null;
  providers: EscrowProviders | null;
  addresses: WalletAddresses | null;
  balances: WalletBalances | null;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    status: 'disconnected',
    api: null,
    providers: null,
    addresses: null,
    balances: null,
    error: null,
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detectWallets = useCallback(() => {
    const injected = (window as any).midnight;
    if (!injected) {
      log('detect', 'window.midnight not found');
      return [];
    }
    const wallets = Object.values(injected).filter(
      (w: any) => w && typeof w === 'object' && 'connect' in w,
    ) as any[];
    log('detect', `Found ${wallets.length} wallet(s)`);
    return wallets;
  }, []);

  const connect = useCallback(async (networkId: string = 'preview') => {
    log('connect', `Connecting with networkId="${networkId}"...`);
    const wallets = detectWallets();
    if (wallets.length === 0) {
      log('connect', 'No wallets found');
      setState((s) => ({
        ...s,
        status: 'error',
        error: 'No Midnight wallet found. Install Lace extension.',
      }));
      return;
    }

    setState((s) => ({ ...s, status: 'connecting', error: null }));

    try {
      const wallet = wallets[0];
      log('connect', 'Calling wallet.connect...');
      const api = await wallet.connect(networkId);
      log('connect', 'wallet.connect resolved, getting addresses...');
      const addresses = await getAddresses(api);
      log('connect', 'Getting balances...');
      const balances = await getBalances(api);
      log('connect', 'Building providers...');
      const providers = await buildBrowserProviders(api);
      log('connect', 'Connected successfully');

      setState({
        status: 'connected',
        api,
        providers,
        addresses,
        balances,
        error: null,
      });
    } catch (err: any) {
      log('connect', 'Connection FAILED:', err?.message ?? err);
      console.error('[WalletHook connect] Full error:', err);
      setState((s) => ({
        ...s,
        status: 'error',
        error: err?.message ?? 'Connection failed',
      }));
    }
  }, [detectWallets]);

  const refreshBalances = useCallback(async () => {
    if (!state.api) return;
    try {
      const balances = await getBalances(state.api);
      setState((s) => ({ ...s, balances }));
    } catch {}
  }, [state.api]);

  useEffect(() => {
    if (state.status === 'connected') {
      pollingRef.current = setInterval(refreshBalances, 15000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [state.status, refreshBalances]);

  return { ...state, connect, refreshBalances, detectWallets };
}
