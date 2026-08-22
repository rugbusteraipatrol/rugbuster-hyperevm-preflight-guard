# RugBuster HyperEVM Preflight Guard

[![CI](https://github.com/rugbusteraipatrol/rugbuster-hyperevm-preflight-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/rugbusteraipatrol/rugbuster-hyperevm-preflight-guard/actions/workflows/ci.yml)
![status: proof of concept](https://img.shields.io/badge/status-proof--of--concept-lightgrey)

> **Proof of concept, not a production security tool.** This package analyzes **hand-authored / mock HyperEVM transaction intents** — plain objects shaped like what an EVM wallet or trading frontend would produce before signing. It does **not** decode real calldata, does not call the HyperEVM RPC, and does not verify anything on-chain. See [Limitations](#limitations-read-before-using-this-for-anything-real) before drawing any conclusion from a passing test.

A small, open-source **pre-broadcast risk guard** for HyperEVM transaction intents. It inspects a normalized (mock) transaction intent before it would be signed and broadcast, and returns `ALLOW` / `WARN` / `BLOCK` with evidence and stated limitations.

This is a proof of concept, not production security advice. It is part of RugBuster's Agent Firewall work — the same pre-sign `ALLOW`/`WARN`/`BLOCK` shape used in the [TON Agent Guard](https://github.com/rugbusteraipatrol/rugbuster-ton-agent-guard) — applied to HyperEVM.

## What this is

- A pre-sign / pre-broadcast guard layer for **HyperEVM transactions** on the Hyperliquid L1.
- A single synchronous function, `analyzeHyperEVMIntent(intent, context)`, that looks at a normalized (mock) transaction intent — destination, value, decoded action, approval details — and returns a verdict with reasons and evidence. It does no I/O and calls nothing external.
- A thin wrapper, `guardedSendTransaction(intent, sendFn, options)`, that makes the check mandatory: it calls `analyzeHyperEVMIntent` first and **never calls `sendFn` on a `BLOCK` verdict**.
- A mock flow wrapper, `runGuardedAgentFlow(callbacks, options)`, that demonstrates the full pipeline: `build -> normalize (optional) -> guard -> send`.

## What this is not

- **Not a key holder.** This package never generates, stores, or touches a private key.
- **Not a signer.** It never produces a signature.
- **Not a broadcaster.** It never sends anything to the HyperEVM network.
- **Not a calldata decoder.** The `data` field is opaque; the caller supplies `decodedAction` for rule-based checking.
- **Not an on-chain verifier.** Address reputation comes entirely from caller-supplied context.
- **Not an official Hyperliquid integration.** This is an independent, community-built PoC.

## Why HyperEVM

Hyperliquid is a high-performance L1 with a dual architecture:

- **HyperCore** — high-speed CLOB / trading layer with signed actions.
- **HyperEVM** — EVM-compatible smart contract layer with standard RPC methods.

HyperEVM is growing a DeFi ecosystem (HyperLend, Morpho, Rysk, Kinetiq, and others). Standard EVM risks apply: unlimited approvals, interactions with unverified contracts, high-value transfers. This guard provides a lightweight pre-broadcast check for those risks.

## Install & run

```bash
npm install
npm test
npm run demo
```

Everything is reproducible locally. No network calls, no environment variables, no keys required, zero runtime dependencies (only `typescript`, `vitest`, and `tsx` as devDependencies).

## Browser demo

A static browser demo is available in `demo/`.

Open `demo/index.html` locally to try mock scenarios. The demo is fully static: no wallet, no RPC, no network calls, no signing.

## API

```ts
import { analyzeHyperEVMIntent, guardedSendTransaction } from "@rugbuster/hyperevm-preflight-guard";

const decision = analyzeHyperEVMIntent(intent, context);
// decision.verdict: "ALLOW" | "WARN" | "BLOCK"
// decision.reasons: string[]
// decision.evidence: { findings, policyUsed, parseErrors, ... }
// decision.limitations: string[]
```

```ts
const { decision, result } = await guardedSendTransaction(
  intent,
  (intent) => wallet.sendTransaction(intent), // your real broadcast function
  { context, confirmWarn: false },
);
```

- On `BLOCK`, `guardedSendTransaction` throws `GuardBlockError` and never calls your `sendFn`.
- On `WARN` without `confirmWarn: true`, it throws `GuardConfirmationRequiredError` and never calls your `sendFn`.
- On `WARN` with `confirmWarn: true`, or on `ALLOW`, it calls `sendFn` and returns `{ decision, result }`.

### Mock agentic flow wrapper

`runGuardedAgentFlow` demonstrates the full pipeline:

```
buildIntent() -> normalizeIntent(optional) -> analyzeHyperEVMIntent() -> sendTransaction()
```

```ts
import { runGuardedAgentFlow } from "@rugbuster/hyperevm-preflight-guard";

const result = await runGuardedAgentFlow({
  buildIntent: () => myAgent.buildTransfer({ to, value }),
  normalizeIntent: (intent) => enrichWithDecodedAction(intent),
  sendTransaction: (intent) => wallet.sendTransaction(intent),
}, { context, confirmWarn: false });
```

### `HyperEVMTransactionIntent` shape

A normalized, pre-parsed transaction intent — not a raw EVM transaction. See [`src/types.ts`](src/types.ts) for the full type. Roughly:

```ts
{
  id: string,
  chainId: 999 | 998, // HyperEVM mainnet | testnet
  from: string,
  to: string,
  valueWei: string,
  data: string, // opaque in this PoC
  decodedAction: {
    kind: "erc20_approve" | "erc20_transfer" | "contract_call" | "native_transfer" | "unknown",
    // ... kind-specific fields
  },
}
```

### Deterministic rules implemented

| Rule | Verdict | Condition |
|---|---|---|
| Missing chainId | `BLOCK` | `chainId` is undefined |
| Unsupported chainId | `BLOCK` | `chainId` is not `999` or `998` |
| Missing from | `BLOCK` | `from` is missing or not a valid hex address |
| Missing to | `BLOCK` | `to` is missing or not a valid hex address |
| Unlimited approval | `WARN` | `erc20_approve` with amount >= 2^128 |
| Unknown spender | `WARN` | Approval spender not in `context.knownSpenders` |
| Blocked spender | `BLOCK` | Approval spender in `context.blockedAddresses` |
| Blocked contract | `BLOCK` | `to` address in `context.blockedAddresses` |
| Unknown contract | `WARN` | `to` not in `context.knownContracts` and `requireKnownContract` is true |
| High-value transfer | `WARN` | `valueWei` exceeds `policy.highValueThresholdWei` (default 50 HYPE) |
| Known contract, no findings | `ALLOW` | — |

Overall verdict is the worst individual finding (`BLOCK` > `WARN` > `ALLOW`).

## Limitations (read before using this for anything real)

- **PoC only.** This is not a security audit and not production security advice.
- **No real calldata decoding.** The `data` field is opaque. The caller supplies `decodedAction` for rule-based checking.
- **No live HyperEVM RPC calls.** Address reputation comes entirely from caller-supplied context.
- **No ABI decoding library.** Intents are consumed as pre-normalized JSON.
- **No on-chain contract verification.** "Known contracts" come from caller context, not from a block explorer or verification service.
- **Never holds keys, never signs, never broadcasts.**

## Future work

- Real calldata decoding via an ABI library (e.g., `viem`, `ethers`).
- Live HyperEVM RPC lookups for contract verification and address reputation.
- HyperCore signed-action guard (Phase 2).
- Builder Code integration for builder-specific risk checks.
- Evidence hashing/anchoring, matching the approach used in the [TON Agent Guard](https://github.com/rugbusteraipatrol/rugbuster-ton-agent-guard).

## License

MIT
