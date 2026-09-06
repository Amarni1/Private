import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  createWalletProvider,
  createMidnightProvider,
  getAddresses,
} from './walletAdapter';

export type EscrowProviders = MidnightProviders<any, any, any>;

let zkConfig: FetchZkConfigProvider<any> | null = null;

export function getZkConfigProvider(): FetchZkConfigProvider<any> {
  if (!zkConfig) {
    zkConfig = new FetchZkConfigProvider<any>(
      window.location.origin,
      fetch.bind(window),
    );
  }
  return zkConfig;
}

export async function buildBrowserProviders(
  api: ConnectedAPI,
): Promise<EscrowProviders> {
  const config = await api.getConfiguration();
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await getAddresses(api);

  setNetworkId(config.networkId as any);

  const zkConfigProvider = getZkConfigProvider();

  const walletProvider = createWalletProvider(
    api,
    shieldedCoinPublicKey,
    shieldedEncryptionPublicKey,
  );
  const midnightProvider = createMidnightProvider(api);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'usdm-escrow-web',
      privateStoragePasswordProvider: () => 'browser-escrow-test',
      accountId: 'default',
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexerUri,
      config.indexerWsUri,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri ?? 'http://127.0.0.1:6300', zkConfigProvider),
    walletProvider,
    midnightProvider,
  };
}
