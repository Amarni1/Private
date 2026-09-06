# USDM Private Escrow — a proof-gated escrow DApp on Midnight Preview

A live DApp for Midnight network that escrows **USDM** and releases it only
after a **zero-knowledge proof** (possession of a buyer secret) is verified
on-chain. The escrow is identity-free: neither the seller nor the buyer needs
to be registered with anyone; the contract and the ZK circuit alone decide who
gets paid and when.

```
create (depositor deposits USDM into the contract)
   |
   |   openEscrow: receiveUnshielded + lock against H(secret), timelocks set
   v
+--------------+     release(secret, recipient)        +------------------+
|  Midnight    | =======================================>|  recipient gets  |
|  Preview     |   asserts H(secret) matches + !past     |  USDM, on-chain  |
|  contract    |   release deadline + sendUnshielded     +------------------+
|  (Compact)   |
+--------------+     refund() after refund deadline     +------------------+
                         sends USDM back to depositor  ==>|  depositor gets  |
                                                          |  USDM refund     |
                                                          +------------------+
```

## Why this design

The escrow is **fully on-chain**. The contract itself holds the USDM while the
escrow is open. This became possible because the current Midnight protocol
(Compact compiler 0.31.x) makes contracts first-class holders of *unshielded*
tokens through standard-library primitives:

- `receiveUnshielded(color, amount)` — pull an unshielded token (any color,
  including a VIA-bridged asset like USDM) into the contract in the call
  transaction, from the caller's wallet;
- `sendUnshielded(color, amount, recipient)` — pay an unshielded token out of
  the contract's on-chain balance to any user address;
- `unshieldedBalanceGte(color, amount)` — check the contract's own transparent
  balance before paying.

A Payment Commitment (also called "Hash Lock") is used as the release gate:

1. At escrow creation the seller publishes only `H(secret)` (a domain-separated
   `persistentHash`) on-chain — the secret itself never leaves the buyer.
2. `release` succeeds **only** if `H(candidate) == H(secret)` **and** the
   release deadline has not passed. The released amount then leaves the
   contract's balance and lands at the recipient address the buyer names.
3. If nobody releases before `refundDeadline`, anyone can call `refund`, which
   returns the escrowed USDM to the recorded depositor address. Funds can never
   get stuck.

## Repo layout

```
contracts/
  escrow.compact                 the entire escrow contract (Compact, original)
src/
  config.ts                      network endpoints (preview/preprod/local)
  wallet.ts                      wallet-sdk facade -> MidnightProvider adapters
  providers.ts                   contract providers (indexer + proof server + wallet)
  contract.ts                    CompiledContract wrapper for the generated output
  tokens.ts                      USDM color discovery + balance normalization
  state.ts                       local escrow-state.json storage of secrets/terms
  cli.ts                         the DApp client (all lifecycle commands)
  managed/escrow/                Compiler output (git-ignored; generated via npm run build)
package.json                      pinned dependency set that the docs call "known-good"
```

## How the money moves

1. **Depositor** (anyone, no registration) calls `open --amount <raw> ...`.
   The CLI computes `H(secret)` client-side (via the contract's `hashLockOf`
   pure circuit), builds the `openEscrow` call, and the transaction
   simultaneously (a) binds the wallet's USDM coins into the contract
   (`receiveUnshielded`) and (b) records the escrow terms on-chain.
2. **Buyer** (holder of `secret`) calls `release --id <n>`. The transaction
   proves `H(secret)` inside ZK, updates the record to `Released`, and pays the
   escrowed amount in USDM out of the contract to the recipient address
   (`sendUnshielded`, `right<UserAddress>(...)`).
3. If the release deadline passes unanswered, `refund --id <n>` proves the
   refund window has opened (`kernel.blockTimeGreaterThan(record.refundDeadline)`)
   and returns the USDM to `record.depositor` on-chain.

Amounts are in **raw units**. USDM uses 6 decimals, so `--amount 5000000` = 5.0 USDM.

## Prerequisites

- **Node.js ≥ 22** (`node --version`), npm.
- **Docker Desktop** running — the local proof server (`:6300`) must be up for
  any transaction. The proof server only runs on macOS/Linux/WSL.
- **WSL (Windows only)** — development is natively supported on Linux/macOS;
  the official installer ships Linux/macOS binaries only. On Windows, run the
  compile and deploy steps inside WSL.
- A **Midnight wallet**: this project is a CLI DApp using the wallet-sdk; no
  extension is required.

## Setup

### 1. Install the Compact toolchain (in WSL on Windows)

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1
compact compile --version   # expect 0.31.1
```

### 2. Start the local proof server (Docker)

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v
```

or, to iterate fast without a faucet, run the full local network tool
([midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev))
which also brings the node + indexer + a funded genesis wallet:

```bash
git clone https://github.com/midnightntwrk/midnight-local-dev.git
cd midnight-local-dev && npm install && npm start
```

### 3. Install this project

```bash
npm install
npm run build        # compact compile contracts/escrow.compact src/managed/escrow
```

`npm run build` generates the Prover/Verifier keys and the `Contract`,
`ledger` (state decoder) and `pureCircuits` (off-chain hash lock) bindings under
`src/managed/escrow`. Everything below in `src/` imports from those.

## Running against the local network (fast path)

Skip the faucet; the genesis wallet is pre-funded and pre-registered:

```bash
MIDNIGHT_NETWORK=local \
MIDNIGHT_SEED=0000000000000000000000000000000000000000000000000000000000000001 \
npm run deploy
```

## Running against Midnight Preview (the deliverable)

### 4. Fund a wallet

Generate a throwaway seed (Windows PowerShell: `openssl rand -hex 32`, or
`-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })`).

```bash
MIDNIGHT_NETWORK=preview MIDNIGHT_SEED=<seed-hex> npm run fund
```

The command prints an `mn1...` address, then waits. Send tNIGHT to that address
from the [Preview faucet](https://midnight-tmnight-preview.nethermind.dev/).
Once NIGHT lands, the wallet registers it for DUST generation and waits until
DUST > 0 (fees are paid in DUST, never in USDM).

### 5. Get USDM in the wallet

USDM is native on Midnight, bridged from Cardano through VIA Labs. Bridge to
your `mn1...` address via the VIA portal; the CLI detects the USDM color
automatically (`npm run balances` prints your unshielded balances and reports
the detected USDM color). To pin a color explicitly: `USDM_TOKEN_COLOR=<hex>`.

### 6. Deploy the escrow contract

```bash
MIDNIGHT_NETWORK=preview MIDNIGHT_SEED=<seed-hex> npm run deploy
```

Records the on-chain `contractAddress` in `escrow-state.json`.

### 7. Open an escrow (and deposit the USDM)

```bash
MIDNIGHT_NETWORK=preview MIDNIGHT_SEED=<seed-hex> \
npm run open -- --amount 5000000 --release-minutes 60 --refund-hours 168
```

Generates a random buyer secret, stores it in `escrow-state.json`, and in a
single transaction deposits 5.0 USDM into the contract and publishes the escrow
terms (hash lock, color, amount, deadlines, depositor address). Prints the new
escrow id. Read it back on-chain at any time:

```bash
npm run status -- --id 0
npm run list
```

### 8. Release (the proof-gated payment)

The buyer (holding the secret) names the recipient and releases:

```bash
npm run release -- --id 0 --recipient mn1...
```

or, with no `--recipient`, pays back to this wallet. Internally this is
`release(escrowId, preimage, recipient)`. The proof server generates the
release proof, the contract verifies `H(preimage)` and the timelock inside ZK,
flips the status to `Released`, and pays the 5.0 USDM to the recipient from the
contract's on-chain balance.

### 9. Refund (timelocked return to depositor)

After `refundDeadline`, with no release:

```bash
npm run refund -- --id 0
```

## Environment variables

| Variable | Meaning | Default |
| --- | --- | --- |
| `MIDNIGHT_NETWORK` | `preview` \| `preprod` \| `local` | `preview` |
| `MIDNIGHT_SEED` | wallet master seed, 32-byte hex (no `0x`) | required except `local` |
| `MIDNIGHT_PROOF_SERVER` | proof server URL | `http://127.0.0.1:6300` |
| `USDM_TOKEN_COLOR` | 32-byte USDM color (auto-discovered if unset) | — |
| `LOG_LEVEL` | pino level | `info` |

> Note: `escrow-state.json` is keyed by network; switching networks with old
> state present raises an error rather than silently mixing networks.

## Dependencies

Pinned to the versions the official docs call the "known-good set"
(`@midnight-ntwrk/midnight-js-*@4.1.1`, `@midnight-ntwrk/wallet-sdk@1.2.0`,
`@midnight-ntwrk/testkit-js@4.1.1`). npm's `latest` dist-tag still points at
`wallet-sdk@1.1.0`, so do not install it unpinned.

## Verification checklist (for the Preview deployment)

- [ ] `compact compile --version` reports 0.31.1
- [ ] proof server up on `:6300` (or `MIDNIGHT_PROOF_SERVER` pointing at one)
- [ ] wallet address funded with tNIGHT and `fund` reports DUST > 0
- [ ] wallet holds USDM (via VIA bridge); `balances` detects its color
- [ ] `deploy` returns an address persisted in `escrow-state.json`
- [ ] `open` deposits and returns an escrow id; `status --id 0` shows `Open`
- [ ] `release` succeeds only with the correct preimage (wrong preimage → tx rejected)
- [ ] after release, recipient's USDM balance increased by the escrowed amount
- [ ] `refund` succeeds only after the refund deadline

## Known limitations and notes

- **No native Windows toolchain.** The Compact compiler does not ship a Windows
  binary; compile (and ideally everything else) inside WSL. Docker Desktop is
  required for the proof server regardless.
- **`receiveUnshielded` deposit semantics.** The depositor's USDM coins are
  attached to the `openEscrow` transaction by the SDK from the caller's wallet.
  This is the current protocol-recommended path (see
  https://docs.midnight.network/examples/contracts/token-transfers); anything
  that diverges on Preview would surface as a tx rejection on `open`, and the
  fix is a one-line `transferTransaction` fallback plus a synced-settled state
  — fully documented at the app boundary.
- **Compile-time verification of `escrow.compact`** must happen in the
  user environment (`npm run build`), because this machine cannot run the
  compiler; the TypeScript layer installs and typechecks cleanly here.
- **Demo secrets** are stored locally in `escrow-state.json` for convenience.
  In production the buyer secret would be held off-machine by the buyer.
- No browser UI in this repo; the CLI *is* the client. A `Lace`-driven UI is
  the natural next step.