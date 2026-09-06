import { WebSocket } from 'ws';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
} from '@midnight-ntwrk/midnight-js-contracts';
import { UnshieldedAddress, MidnightBech32m } from '@midnight-ntwrk/wallet-sdk';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-utils';

(globalThis as any).WebSocket = WebSocket;

import { getConfig } from './config.js';
import { syncWallet, toUserAddressBytes } from './wallet.js';
import { buildProviders, type EscrowProviders } from './providers.js';
import { CompiledEscrow, ledger, zkConfigPath } from './contract.js';
import {
  describeBalances,
  findUsdmBalance,
  normalizedUnshieldedBalances,
} from './tokens.js';
import {
  PRIVATE_STATE_ID,
  bech32Address,
  buildAndStartWallet,
  ensureFunding,
} from './network.js';
import {
  getContractAddress,
  loadState,
  newPreimage,
  saveState,
  type EscrowState,
  type StoredEscrow,
} from './state.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

function exactDashArg(value: string): string | undefined {
  return value.startsWith('--') ? value.slice(2) : undefined;
}

function parseArgs(argv: string[]): { command: string; flags: Map<string, string> } {
  const flags = new Map<string, string>();
  let command = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const flagName = exactDashArg(arg);
    if (flagName) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags.set(flagName, next);
        i++;
      } else {
        flags.set(flagName, 'true');
      }
    } else if (!command) {
      command = arg;
    }
  }
  return { command, flags };
}

const USAGE = `Usage: tsx src/cli.ts <command> [options]

Commands:
  fund                       Build the wallet, print its address, wait for NIGHT,
                             and register DUST so fees can be paid.
  deploy                     Deploy the escrow contract and record its address.
  open --amount <raw> [opts] Create an escrow. Deposits USDM into the contract
                             in the same transaction (requires the wallet to
                             hold USDM).
  release --id <n> [opts]    Prove the preimage on-chain and pay the recipient
                             the escrow amount in USDM.
  refund --id <n>            After the refund deadline, return the escrowed USDM
                             to the depositor.
  status --id <n>            Read an escrow record from the contract.
  list                       List all escrow records.
  balances                   Show the wallet's unshielded balances.

Options:
  --amount <raw>        Amount in raw units (USDM has 6 decimals).
  --color <hex>         USDM token color (32-byte hex). Auto-discovered from the
                        wallet when omitted.
  --id <n>              Escrow id.
  --preimage <hex>      Buyer secret (32-byte hex). Defaults to the secret stored
                        locally when the escrow was opened.
  --recipient <bech32>  Bech32 recipient for release. Defaults to this wallet.
  --release-minutes <m> Release deadline offset (default 60).
  --refund-hours <h>    Refund deadline offset (default 48).

Environment:
  MIDNIGHT_NETWORK      local | preview (default) | preprod
  MIDNIGHT_SEED         Wallet seed hex (no 0x). Required except on local.
  MIDNIGHT_PROOF_SERVER Proof server URL (default http://127.0.0.1:6300)
  USDM_TOKEN_COLOR      32-byte USDM token color on this network.
`;

function toBigInt(value: string, ctx: string): bigint {
  const n = BigInt(value);
  if (n < 0n) throw new Error(`${ctx} must be non-negative`);
  return n;
}

function asBytes32(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return fromHex(value.replace(/^0x/, ''));
  throw new Error(`Expected 32-byte value, got ${typeof value}`);
}

function displayUserAddress(value: any): string {
  if (value == null) return '(none)';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const bytes = value.bytes ?? value.data ?? value.addressHex;
    if (bytes instanceof Uint8Array) return toHex(bytes);
    if (typeof bytes === 'string') return bytes;
  }
  return JSON.stringify(value);
}

function readStatus(value: any): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return ['Open', 'Released', 'Refunded'][value] ?? String(value);
  }
  if (typeof value === 'object' && value != null) {
    const tag = value.tag ?? value.value ?? value.caseName;
    if (typeof tag === 'string') return tag;
  }
  return JSON.stringify(value);
}

function readRecord(escrowId: number | bigint, rec: any) {
  const deadline = (v: any) => {
    const n = BigInt(v ?? 0n);
    return `${n} (${new Date(Number(n) * 1000).toISOString()})`;
  };
  const bytes = (v: any) =>
    v instanceof Uint8Array ? toHex(v) : typeof v === 'string' ? v : String(v);
  return {
    id: escrowId,
    status: readStatus(rec.status),
    hashLock: bytes(rec.hashLock),
    tokenColor: bytes(rec.tokenColor),
    amount: BigInt(rec.amount ?? 0n).toString(),
    depositor: displayUserAddress(rec.depositor),
    releaseDeadline: deadline(rec.releaseDeadline),
    refundDeadline: deadline(rec.refundDeadline),
  };
}

async function listEscrows(): Promise<Array<{ id: number; record: any }>> {
  const config = getConfig();
  const state = loadState(config.networkId);
  const contractAddress = getContractAddress(state);
  const wallet = await buildAndStartWallet(logger, config);
  await syncWallet(logger, wallet.wallet);
  const providers = buildProviders(wallet, zkConfigPath, config);
  const query = await providers.publicDataProvider.queryContractState(
    contractAddress,
  );
  const decoded = ledger(query!.data);
  const nextId = BigInt(decoded.nextId ?? 0n);
  const escrows = decoded.escrows as any;
  const records: Array<{ id: number; record: any }> = [];
  for (let i = 0; i < Number(nextId); i++) {
    const rec =
      typeof escrows.get === 'function'
        ? escrows.get(BigInt(i))
        : (escrows as any)[String(i)];
    if (rec != null) records.push({ id: i, record: rec });
  }
  await wallet.stop();
  return records;
}

async function statusCommand(flags: Map<string, string>) {
  const id = toBigInt(flags.get('id') ?? '', '--id');
  const records = await listEscrows();
  const found = records.find((r) => BigInt(r.id) === id);
  if (!found) {
    logger.error(`Escrow ${id} does not exist or has been finalized.`);
    return;
  }
  logger.info(`Escrow ${id}:`);
  const printed = readRecord(found.id, found.record);
  for (const [key, value] of Object.entries(printed)) {
    logger.info(`  ${key}: ${value}`);
  }
}

async function listCommand() {
  const records = await listEscrows();
  if (records.length === 0) {
    logger.info('No escrows on-chain.');
    return;
  }
  for (const { id, record } of records) {
    const printed = readRecord(id, record);
    logger.info(
      `#${printed.id} ${printed.status} amount=${printed.amount} color=${printed.tokenColor.slice(0, 8)}...`,
    );
  }
}

async function fundCommand() {
  const config = getConfig();
  const wallet = await buildAndStartWallet(logger, config);
  try {
    const addr = await bech32Address(config, wallet);
    logger.info(`Fund this address with tNIGHT, then this continues: ${addr}`);
    await ensureFunding(logger, wallet, config);
  } finally {
    await wallet.stop();
  }
}

async function deployCommand() {
  const config = getConfig();
  const state = loadState(config.networkId);
  const wallet = await buildAndStartWallet(logger, config);
  try {
    await ensureFunding(logger, wallet, config);
    const providers = buildProviders(wallet, zkConfigPath, config);
    logger.info('Deploying escrow contract...');
    const deployed = await deployContract(providers, {
      compiledContract: CompiledEscrow,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
    const contractAddress = deployed.deployTxData.public.contractAddress;
    state.contractAddress = contractAddress;
    saveState(state);
    logger.info(`Deployed at ${contractAddress}`);
  } finally {
    await wallet.stop();
  }
}

async function openCommand(flags: Map<string, string>) {
  const config = getConfig();
  const state = loadState(config.networkId);
  const contractAddress = getContractAddress(state);
  const amount = toBigInt(flags.get('amount') ?? '', '--amount');
  if (amount <= 0n) throw new Error('--amount must be greater than zero');
  const releaseMinutes = Number(flags.get('release-minutes') ?? '60');
  const refundHours = Number(flags.get('refund-hours') ?? '48');
  const wallet = await buildAndStartWallet(logger, config);
  try {
    const synced = await ensureFunding(logger, wallet, config);
    const balances = normalizedUnshieldedBalances(synced);
    const usdmColorHex = (flags.get('color') ?? process.env['USDM_TOKEN_COLOR'] ?? '')
      || findUsdmBalance(balances);
    if (!usdmColorHex) {
      throw new Error(
        'Could not find USDM in this wallet. Bridge USDM to this address first ' +
          '(or pass --color). Balances:\n' + describeBalances(balances),
      );
    }
    const usdmBalance = balances[usdmColorHex] ?? 0n;
    if (usdmBalance < amount) {
      throw new Error(
        `Wallet holds only ${usdmBalance} of USDM color ${usdmColorHex}; cannot escrow ${amount}.`,
      );
    }
    const preimage = flags.get('preimage') ?? newPreimage();
    const hashLock = asBytes32(await computeHashLock(fromHex(preimage)));
    const colorBytes = asBytes32(usdmColorHex);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const releaseDeadline = nowSeconds + releaseMinutes * 60;
    const refundDeadline = nowSeconds + refundHours * 60 * 60;
    const depositorBytes = toUserAddressBytes(synced.unshielded);

    const providers = buildProviders(wallet, zkConfigPath, config);
    const before = await readLedgerNextId(providers, contractAddress);
    logger.info('Opening escrow and depositing USDM into the contract...');
    await submitCallTx(providers, {
      compiledContract: CompiledEscrow,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'openEscrow',
      args: [
        hashLock,
        colorBytes,
        amount,
        { bytes: depositorBytes },
        BigInt(releaseDeadline),
        BigInt(refundDeadline),
      ],
    });
    const after = await readLedgerNextId(providers, contractAddress);
    const newId = Number(after) - 1;
    const stored: StoredEscrow = {
      preimage,
      amount: amount.toString(),
      tokenColor: usdmColorHex,
      releaseDeadline: String(releaseDeadline),
      refundDeadline: String(refundDeadline),
      depositor: await bech32Address(config, wallet),
    };
    state.escrows[String(newId)] = stored;
    saveState(state);
    logger.info(
      `Escrow ${newId} opened, amount=${amount} USDM color=${usdmColorHex.slice(0, 8)}... preimage=${preimage.slice(0, 8)}...`,
    );
  } finally {
    await wallet.stop();
  }
}

async function readLedgerNextId(
  providers: EscrowProviders,
  contractAddress: string,
): Promise<bigint> {
  const query = await providers.publicDataProvider.queryContractState(contractAddress);
  const decoded = ledger(query!.data);
  return BigInt(decoded.nextId ?? 0n);
}

async function computeHashLock(preimageBytes: Uint8Array): Promise<Uint8Array> {
  const { pureCircuits } = await import('./managed/escrow/contract/index.js');
  const result: any = pureCircuits.hashLockOf(preimageBytes);
  if (result instanceof Uint8Array) return result;
  if (typeof result === 'string') return fromHex(result.replace(/^0x/, ''));
  if (result && typeof (result as any).value !== 'undefined') {
    return asBytes32((result as any).value);
  }
  throw new Error('Unexpected result from hashLockOf pure circuit');
}

async function releaseCommand(flags: Map<string, string>) {
  const config = getConfig();
  const state = loadState(config.networkId);
  const contractAddress = getContractAddress(state);
  const id = flags.get('id');
  if (!id) throw new Error('--id is required');
  const escrow = state.escrows[id];
  const preimage = flags.get('preimage') ?? escrow?.preimage;
  if (!preimage) {
    throw new Error(
      `No stored preimage for escrow ${id}; pass --preimage <hex> to release.`,
    );
  }
  const wallet = await buildAndStartWallet(logger, config);
  try {
    const synced = await ensureFunding(logger, wallet, config);
    const providers = buildProviders(wallet, zkConfigPath, config);
    const recipientFlag = flags.get('recipient');
    let recipientBytes: Uint8Array;
    if (recipientFlag) {
      const parsed = MidnightBech32m.parse(recipientFlag);
      const address = UnshieldedAddress.codec.decode(config.networkId, parsed);
      recipientBytes = asBytes32(toUserAddressBytes({ address }));
    } else {
      recipientBytes = toUserAddressBytes(synced.unshielded);
    }
    logger.info(`Releasing escrow ${id} to ${recipientFlag ?? '(this wallet)'}...`);
    await submitCallTx(providers, {
      compiledContract: CompiledEscrow,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'release',
      args: [BigInt(id), fromHex(preimage), { bytes: recipientBytes }],
    });
    logger.info(`Escrow ${id} released; USDM paid to recipient.`);
  } finally {
    await wallet.stop();
  }
}

async function refundCommand(flags: Map<string, string>) {
  const config = getConfig();
  const state = loadState(config.networkId);
  const contractAddress = getContractAddress(state);
  const id = flags.get('id');
  if (!id) throw new Error('--id is required');
  const wallet = await buildAndStartWallet(logger, config);
  try {
    await ensureFunding(logger, wallet, config);
    const providers = buildProviders(wallet, zkConfigPath, config);
    logger.info(`Refunding escrow ${id} to its depositor...`);
    await submitCallTx(providers, {
      compiledContract: CompiledEscrow,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'refund',
      args: [BigInt(id)],
    });
    logger.info(`Escrow ${id} refunded.`);
  } finally {
    await wallet.stop();
  }
}

async function balancesCommand() {
  const config = getConfig();
  const wallet = await buildAndStartWallet(logger, config);
  try {
    const synced = await syncWallet(logger, wallet.wallet);
    const balances = normalizedUnshieldedBalances(synced);
    logger.info(`Address: ${await bech32Address(config, wallet)}`);
    logger.info('Unshielded balances:');
    const text = describeBalances(balances);
    if (text) {
      for (const line of text.split('\n')) logger.info(line);
    } else {
      logger.info('  (none)');
    }
    const usdm = findUsdmBalance(balances);
    if (usdm) {
      logger.info(`USDM color detected: ${usdm}`);
    }
  } finally {
    await wallet.stop();
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  setNetworkId(getConfig().networkId);
  switch (command) {
    case 'fund':
      await fundCommand();
      break;
    case 'deploy':
      await deployCommand();
      break;
    case 'open':
      await openCommand(flags);
      break;
    case 'release':
      await releaseCommand(flags);
      break;
    case 'refund':
      await refundCommand(flags);
      break;
    case 'status':
      await statusCommand(flags);
      break;
    case 'list':
      await listCommand();
      break;
    case 'balances':
      await balancesCommand();
      break;
    default:
      console.log(USAGE);
      if (command) logger.error(`Unknown command: ${command}`);
  }
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});