import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract } from '../../../src/managed/escrow/contract/index.js';

const base = CompiledContract.make('Escrow', Contract);

export const CompiledEscrow = {
  ...base,
  pipe: base.pipe.bind(base),
} as any;
