import { type EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { filter, timeout as rxTimeout } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import type { Logger } from 'pino';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from './wallet.js';
import { type NetworkConfig } from './config.js';

export const PRIVATE_STATE_ID = 'usdm-private-escrow';

export function makeEnv(config: NetworkConfig): EnvironmentConfiguration {
  return {
    walletNetworkId: config.networkId,
    networkId: config.networkId,
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    nodeWS: config.nodeWS,
    faucet: config.faucet,
    proofServer: config.proofServer,
  };
}

function localGenesisSeed(): string {
  return '0'.repeat(63) + '1';
}

export function walletSecret(config: NetworkConfig): WalletSecret {
  const fromEnv = process.env['MIDNIGHT_SEED'];
  if (fromEnv) return { kind: 'seed', value: fromEnv };
  if (config.networkId === 'undeployed') {
    return { kind: 'seed', value: localGenesisSeed() };
  }
  throw new Error(
    'Set MIDNIGHT_SEED to your wallet seed (hex, no 0x prefix). Generate one with: openssl rand -hex 32',
  );
}

export async function buildAndStartWallet(
  logger: Logger,
  config: NetworkConfig,
) {
  const wallet = await MidnightWalletProvider.build(
    logger,
    makeEnv(config),
    walletSecret(config),
  );
  await wallet.start();
  return wallet;
}

export async function bech32Address(
  config: NetworkConfig,
  wallet: MidnightWalletProvider,
): Promise<string> {
  const state = await firstValueFrom(wallet.wallet.state());
  return UnshieldedAddress.codec.encode(
    config.networkId,
    state.unshielded.address,
  ).asString();
}

async function waitForFirstNight(
  logger: Logger,
  wallet: MidnightWalletProvider,
): Promise<void> {
  const nightRaw = unshieldedToken().raw;
  logger.info('Waiting for NIGHT to arrive...');
  await firstValueFrom(
    wallet.wallet.state().pipe(
      filter((s: any) => (s.unshielded.balances[nightRaw] ?? 0n) > 0n),
      rxTimeout({ each: 30 * 60_000 }),
    ),
  );
  logger.info('NIGHT received.');
}

async function waitForDust(
  logger: Logger,
  wallet: MidnightWalletProvider,
): Promise<void> {
  logger.info('Waiting for DUST to be generated from your NIGHT...');
  const deadline = Date.now() + 30 * 60_000;
  let dustBalance = 0n;
  while (Date.now() < deadline) {
    const s = await firstValueFrom(wallet.wallet.state());
    try {
      dustBalance = s.dust.balance(new Date());
    } catch {
      dustBalance = 0n;
    }
    if (dustBalance > 0n) break;
    logger.info(`  dust balance: ${dustBalance}`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
  if (dustBalance <= 0n) {
    throw new Error('Timed out waiting for DUST to be generated.');
  }
  logger.info(`DUST available: ${dustBalance}`);
}

async function registerDust(
  logger: Logger,
  wallet: MidnightWalletProvider,
): Promise<void> {
  const nightRaw = unshieldedToken().raw;
  logger.info('Waiting for the unshielded channel to sync...');
  const syncedState = await firstValueFrom(
    wallet.wallet.state().pipe(
      filter((s: any) => s.unshielded.progress?.isStrictlyComplete() === true),
      rxTimeout({ each: 30 * 60_000 }),
    ),
  );
  logger.info('Unshielded channel synced.');
  const unregistered = syncedState.unshielded.availableCoins.filter(
    (coin: any) =>
      coin.utxo.type === nightRaw &&
      coin.meta.registeredForDustGeneration === false,
  );
  if (unregistered.length === 0) {
    logger.info('NIGHT is already registered for DUST generation.');
    return;
  }
  logger.info(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation...`);
  const recipe = await wallet.wallet.registerNightUtxosForDustGeneration(
    unregistered,
    wallet.unshieldedKeystore.getPublicKey(),
    (payload: Uint8Array) => wallet.unshieldedKeystore.signData(payload),
  );
  const finalized = await wallet.wallet.finalizeRecipe(recipe);
  const txId = await wallet.wallet.submitTransaction(finalized);
  logger.info(`DUST registration submitted: ${txId}`);
  await waitForDust(logger, wallet);
}

export async function ensureFunding(
  logger: Logger,
  wallet: MidnightWalletProvider,
  config: NetworkConfig,
) {
  await waitForFirstNight(logger, wallet);
  await registerDust(logger, wallet);
  return syncWallet(logger, wallet.wallet, 60 * 60_000);
}