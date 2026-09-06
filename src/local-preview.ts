import { WebSocket } from 'ws';
import pino from 'pino';
import { randomBytes } from 'node:crypto';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
} from '@midnight-ntwrk/midnight-js-contracts';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-utils';

(globalThis as any).WebSocket = WebSocket;

import { getConfig } from './config.js';
import { syncWallet, toUserAddressBytes } from './wallet.js';
import { buildProviders } from './providers.js';
import { CompiledEscrow, ledger, zkConfigPath } from './contract.js';
import { normalizedUnshieldedBalances } from './tokens.js';
import {
  PRIVATE_STATE_ID,
  bech32Address,
  buildAndStartWallet,
  ensureFunding,
} from './network.js';

const logger = pino({
  level: 'info',
  transport: { target: 'pino-pretty' },
});

const ZERO_COLOR = new Uint8Array(32);

async function computeHashLock(preimageBytes: Uint8Array): Promise<Uint8Array> {
  const { pureCircuits } = await import('./managed/escrow/contract/index.js');
  const result: any = pureCircuits.hashLockOf(preimageBytes);
  if (result instanceof Uint8Array) return result;
  if (typeof result === 'string') return fromHex(result.replace(/^0x/, ''));
  if (result && typeof (result as any).value !== 'undefined') {
    const value = (result as any).value;
    if (value instanceof Uint8Array) return value;
    if (typeof value === 'string') return fromHex(value.replace(/^0x/, ''));
  }
  throw new Error('Unexpected result from hashLockOf pure circuit');
}

async function readLedger(providers: any, contractAddress: string) {
  const query = await providers.publicDataProvider.queryContractState(
    contractAddress,
  );
  if (!query?.data) throw new Error('Empty contract state from indexer');
  return ledger(query.data);
}

function statusOf(rec: any): string {
  if (typeof rec.status === 'string') return rec.status;
  if (typeof rec.status === 'number') {
    return ['Open', 'Released', 'Refunded'][rec.status] ?? String(rec.status);
  }
  return JSON.stringify(rec.status);
}

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  const pass = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  logger.info(`${pass} ${label}${detail ? ` (${detail})` : ''}`);
}

async function main() {
  const config = getConfig();
  setNetworkId(config.networkId);
  const wallet = await buildAndStartWallet(logger, config);
  try {
    logger.info(`Address: ${await bech32Address(config, wallet)}`);
    const synced = await ensureFunding(logger, wallet, config);
    const address = await bech32Address(config, wallet);
    const providers = buildProviders(wallet, zkConfigPath, config);

    logger.info('--- Deploying escrow contract ---');
    const deployed = await deployContract(providers, {
      compiledContract: CompiledEscrow,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
    const contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`Deployed at ${contractAddress}`);
    check('contract deployed', typeof contractAddress === 'string' && contractAddress.length > 0);

    const amount = 1_500_000n;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const recipient = { bytes: toUserAddressBytes(synced.unshielded) };

    const preimage = randomBytes(32) as Uint8Array;
    const hashLock = await computeHashLock(preimage);

    logger.info('--- Opening escrow #0 (depositing into the contract) ---');
    await submitCallTx(providers, {
      compiledContract: CompiledEscrow,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'openEscrow',
      args: [
        hashLock,
        ZERO_COLOR,
        amount,
        recipient,
        BigInt(nowSeconds + 5 * 60),
        BigInt(nowSeconds + 48 * 60 * 60),
      ],
    });
    let state = await readLedger(providers, contractAddress);
    const rec0 = state.escrows.member(0n) ? state.escrows.lookup(0n) : null;
    check('escrow #0 recorded on-chain', rec0 != null);
    check(
      'escrow #0 is Open',
      rec0 != null && statusOf(rec0) === 'Open',
      rec0 != null ? statusOf(rec0) : undefined,
    );
    check(
      'escrow #0 terms match (amount)',
      rec0 != null && BigInt(rec0.amount ?? 0n) === amount,
      rec0 != null ? BigInt(rec0.amount ?? 0n).toString() : undefined,
    );

    logger.info('--- Negative test: wrong preimage must fail ---');
    const wrong = randomBytes(32) as Uint8Array;
    let wrongPreimageRejected = false;
    try {
      await submitCallTx(providers, {
        compiledContract: CompiledEscrow,
        contractAddress,
        privateStateId: PRIVATE_STATE_ID,
        circuitId: 'release',
        args: [0n, wrong, recipient],
      });
    } catch {
      wrongPreimageRejected = true;
    }
    check('release with wrong preimage rejected', wrongPreimageRejected);

    logger.info('--- Releasing escrow #0 with the correct preimage ---');
    await submitCallTx(providers, {
      compiledContract: CompiledEscrow,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'release',
      args: [0n, preimage, recipient],
    });
    state = await readLedger(providers, contractAddress);
    const rec0after = state.escrows.member(0n) ? state.escrows.lookup(0n) : null;
    check(
      'escrow #0 is Released',
      rec0after != null && statusOf(rec0after) === 'Released',
      rec0after != null ? statusOf(rec0after) : undefined,
    );

    logger.info('--- Negative test: double release must fail ---');
    let doubleReleaseRejected = false;
    try {
      await submitCallTx(providers, {
        compiledContract: CompiledEscrow,
        contractAddress,
        privateStateId: PRIVATE_STATE_ID,
        circuitId: 'release',
        args: [0n, preimage, recipient],
      });
    } catch {
      doubleReleaseRejected = true;
    }
    check('double release rejected', doubleReleaseRejected);

    logger.info('--- Negative test: refund before deadline must fail ---');
    const preimage2 = randomBytes(32) as Uint8Array;
    const hashLock2 = await computeHashLock(preimage2);
    await submitCallTx(providers, {
      compiledContract: CompiledEscrow,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'openEscrow',
      args: [
        hashLock2,
        ZERO_COLOR,
        500_000n,
        recipient,
        BigInt(nowSeconds + 5 * 60),
        BigInt(nowSeconds + 24 * 60 * 60),
      ],
    });
    let earlyRefundRejected = false;
    try {
      await submitCallTx(providers, {
        compiledContract: CompiledEscrow,
        contractAddress,
        privateStateId: PRIVATE_STATE_ID,
        circuitId: 'refund',
        args: [1n],
      });
    } catch {
      earlyRefundRejected = true;
    }
    check('refund before refund deadline rejected', earlyRefundRejected);

    logger.info('--- Wallet balances (NIGHT is the escrow token in this preview) ---');
    const after = await syncWallet(logger, wallet.wallet, 60 * 60_000);
    const balances = normalizedUnshieldedBalances(after);
    for (const k of Object.keys(balances)) {
      logger.info(`  color 0x${k.slice(0, 8)}...: ${balances[k]}`);
    }
    logger.info(`Escrow wallet address: ${address}`);
    logger.info(`Contract address: ${contractAddress}`);

    logger.info(failures === 0
      ? '--- All local preview checks PASSED ---'
      : `--- ${failures} local preview check(s) FAILED ---`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await wallet.stop();
  }
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});