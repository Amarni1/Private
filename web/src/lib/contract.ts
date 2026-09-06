import { Contract } from '../../../src/managed/escrow/contract/index.js';

const TypeId = Symbol.for('compact-js/CompiledContract');

export const CompiledEscrow = {
  tag: 'Escrow',
  [TypeId]: {
    ctor: Contract,
    witnesses: {},
    compiledAssetsPath: '/managed/escrow',
  },
  pipe() {
    return arguments;
  },
} as any;
