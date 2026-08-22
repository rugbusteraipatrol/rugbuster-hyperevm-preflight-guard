# Browser Demo

A static, offline browser demo for the HyperEVM Preflight Guard PoC.

## How to use

Open `demo/index.html` in any modern browser. No server, no build step, no dependencies.

Paste an EVM-style address (`0x...`), choose a mock transaction type, and click **Check**.

## What it does

The demo mirrors the TypeScript guard logic in plain JavaScript. It evaluates mock HyperEVM transaction intents against the same deterministic rules as the npm package:

- Missing or unsupported chain ID → BLOCK
- Missing or invalid `from` / `to` → BLOCK
- Unlimited ERC-20 approval → WARN
- Approval to blocked spender → BLOCK
- Approval to unknown spender → WARN
- Interaction with blocked contract → BLOCK
- Unknown contract (when `requireKnownContract` is true) → WARN
- High-value native transfer → WARN
- No findings → ALLOW

## What it does NOT do

- No wallet connection
- No RPC calls
- No wallet/RPC/API network requests
- No signing
- No external scripts or analytics
- Uses the same Google Fonts family as the RugBuster Shield demo for visual consistency
- No analytics or tracking

## Files

- `demo/index.html` — page structure
- `demo/styles.css` — dark security-dashboard styling
- `demo/app.js` — browser-side guard logic and scenario data
