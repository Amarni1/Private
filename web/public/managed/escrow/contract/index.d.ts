import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum EscrowStatus { Open = 0, Released = 1, Refunded = 2 }

export type EscrowRecord = { hashLock: Uint8Array;
                             tokenColor: Uint8Array;
                             amount: bigint;
                             depositor: { bytes: Uint8Array };
                             releaseDeadline: bigint;
                             refundDeadline: bigint;
                             status: EscrowStatus
                           };

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  openEscrow(context: __compactRuntime.CircuitContext<PS>,
             hashLock_0: Uint8Array,
             tokenColor_0: Uint8Array,
             amount_0: bigint,
             depositor_0: { bytes: Uint8Array },
             releaseDeadline_0: bigint,
             refundDeadline_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  release(context: __compactRuntime.CircuitContext<PS>,
          escrowId_0: bigint,
          preimage_0: Uint8Array,
          recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, { bytes: Uint8Array
                                                                                   }>;
  refund(context: __compactRuntime.CircuitContext<PS>, escrowId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  getEscrow(context: __compactRuntime.CircuitContext<PS>, escrowId_0: bigint): __compactRuntime.CircuitResults<PS, EscrowRecord>;
}

export type ProvableCircuits<PS> = {
  openEscrow(context: __compactRuntime.CircuitContext<PS>,
             hashLock_0: Uint8Array,
             tokenColor_0: Uint8Array,
             amount_0: bigint,
             depositor_0: { bytes: Uint8Array },
             releaseDeadline_0: bigint,
             refundDeadline_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  release(context: __compactRuntime.CircuitContext<PS>,
          escrowId_0: bigint,
          preimage_0: Uint8Array,
          recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, { bytes: Uint8Array
                                                                                   }>;
  refund(context: __compactRuntime.CircuitContext<PS>, escrowId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  getEscrow(context: __compactRuntime.CircuitContext<PS>, escrowId_0: bigint): __compactRuntime.CircuitResults<PS, EscrowRecord>;
}

export type PureCircuits = {
  hashLockOf(secret_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  hashLockOf(context: __compactRuntime.CircuitContext<PS>, secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  openEscrow(context: __compactRuntime.CircuitContext<PS>,
             hashLock_0: Uint8Array,
             tokenColor_0: Uint8Array,
             amount_0: bigint,
             depositor_0: { bytes: Uint8Array },
             releaseDeadline_0: bigint,
             refundDeadline_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  release(context: __compactRuntime.CircuitContext<PS>,
          escrowId_0: bigint,
          preimage_0: Uint8Array,
          recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, { bytes: Uint8Array
                                                                                   }>;
  refund(context: __compactRuntime.CircuitContext<PS>, escrowId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  getEscrow(context: __compactRuntime.CircuitContext<PS>, escrowId_0: bigint): __compactRuntime.CircuitResults<PS, EscrowRecord>;
}

export type Ledger = {
  readonly nextId: bigint;
  escrows: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): EscrowRecord;
    [Symbol.iterator](): Iterator<[bigint, EscrowRecord]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
