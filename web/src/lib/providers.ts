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

function log(tag: string, msg: string, data?: unknown) {
  console.log(`[Providers ${tag}]`, msg, data ?? '');
}

export type EscrowProviders = MidnightProviders<any, any, any>;

let zkConfig: FetchZkConfigProvider<any> | null = null;

export function getZkConfigProvider(): FetchZkConfigProvider<any> {
  if (!zkConfig) {
    zkConfig = new FetchZkConfigProvider<any>(
      `${window.location.origin}/managed/escrow`,
      fetch.bind(window),
    );
  }
  return zkConfig;
}

export async function buildBrowserProviders(
  api: ConnectedAPI,
): Promise<EscrowProviders> {
  log('build', 'Fetching wallet configuration...');
  const config = await api.getConfiguration();
  log('build', 'Wallet config received', {
    networkId: config.networkId,
    indexerUri: config.indexerUri,
    indexerWsUri: config.indexerWsUri,
    proverServerUri: config.proverServerUri,
  });

  log('build', 'Getting wallet addresses...');
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await getAddresses(api);
  log('build', 'Addresses obtained');

  setNetworkId(config.networkId as any);

  const zkConfigProvider = getZkConfigProvider();
  log('build', 'ZK config provider ready (fetching from browser)');

  const proofServerUri = config.proverServerUri ?? 'http://127.0.0.1:6300';
  log('build', 'Proof server URI:', proofServerUri);

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
    proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
    walletProvider,
    midnightProvider,
  };
}
