import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export {
  Contract,
  ledger,
  type Ledger,
} from './managed/escrow/contract/index.js';
import { Contract } from './managed/escrow/contract/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const zkConfigPath = path.resolve(currentDir, 'managed', 'escrow');

export const CompiledEscrow = CompiledContract.make(
  'Escrow',
  Contract,
).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

export type EscrowCircuits =
  | 'openEscrow'
  | 'release'
  | 'refund'
  | 'getEscrow';