import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract } from '../../../src/managed/escrow/contract/index.js';

const zkConfigPath = new URL(
  '../../../src/managed/escrow',
  import.meta.url,
).pathname.replace(/^\/([A-Z]:)/, '$1');

export const CompiledEscrow = CompiledContract.make('Escrow', Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
