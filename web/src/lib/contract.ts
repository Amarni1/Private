import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract } from '../../../src/managed/escrow/contract/index.js';

const zkConfigPath = '/managed/escrow';

export const CompiledEscrow = CompiledContract.make('Escrow', Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
