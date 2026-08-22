# HyperEVM Preflight Guard — Outreach Pack

## 1. Purpose

We built a small open-source PoC — a pre-broadcast risk guard for HyperEVM transaction intents. It's not a product, not a security audit, and not a pitch. It's a technical artifact we want to show to HyperEVM builders and get honest feedback on whether this direction is worth pursuing further.

## 2. One-line pitch

A local/mock TypeScript guard that checks HyperEVM transaction intents for risky patterns (unlimited approvals, unknown contracts, blocked addresses) before they'd be signed — returns ALLOW / WARN / BLOCK.

## 3. What the PoC does

- Evaluates normalized (mock) HyperEVM transaction intents — plain JSON objects, not raw transactions.
- Returns `ALLOW`, `WARN`, or `BLOCK` with reasons and evidence.
- Checks: missing/unsupported chain ID, invalid addresses, unlimited ERC-20 approvals, approvals to unknown or blocked spenders, interactions with blocked or unknown contracts, high-value native transfers.
- Wraps a caller-supplied send function — BLOCK never reaches it, WARN requires explicit confirmation.
- Includes a mock agent-flow wrapper: `build → normalize → guard → send`.
- 27 passing tests, GitHub Actions CI, zero runtime dependencies.
- Fully local — no keys, no signing, no RPC, no network calls.

## 4. What it does NOT do

- **Not production security.** This is a PoC, not an audit tool.
- **No private keys.** Never holds, generates, or touches a key.
- **No signing.** Never produces a signature.
- **No RPC.** Never calls HyperEVM or any other chain endpoint.
- **No live calldata decoding.** The `data` field is opaque; caller supplies decoded actions.
- **No on-chain verification.** Address reputation is caller-supplied via context.
- **Not an official Hyperliquid integration.** Independent, community-built PoC.

## 5. Who might care

| Who | Why |
|---|---|
| **Wallet teams (Okto, etc.)** | Pre-sign safety check before broadcasting user transactions |
| **Trading frontends (Trade[XYZ], etc.)** | Guard risky approvals or contract interactions before submission |
| **Lending protocols (HyperLend, Morpho)** | Verify approval targets before users approve spending |
| **Options/perps platforms (Rysk)** | Check contract interactions before position-changing txs |
| **Liquid staking (Kinetiq)** | Guard staking/unstaking transactions |
| **Builder Code teams** | Add a safety layer to orders submitted on behalf of users |
| **AI agent builders** | Pre-broadcast check for autonomous wallet transactions |
| **DEX aggregators / swap frontends** | Catch unlimited approvals before they're signed |
| **HyperEVM infra teams** | Reference implementation for intent-level risk checking |

## 6. First outreach targets

| Target | Why relevant | Suggested channel | Confidence | Notes |
|---|---|---|---|---|
| **Okto Wallet** | Leading Hyperliquid wallet, embedded SDK — natural fit for pre-sign guard | Discord / Twitter DM | Medium | discord.gg/okto-916349620383252511, @okto_web3 |
| **HyperLend** | Lending protocol — users approve token spending regularly | Discord (uncertain) | Low | No public Discord/GitHub found; may need Hyperliquid community channel |
| **Kinetiq** | Liquid staking + perps on Hyperliquid, has GitHub org | GitHub issue / Discord | Medium | github.com/kinetiq-research, discord.kinetiq.xyz, @kinetiq_xyz |
| **Morpho** | DeFi protocol on HyperEVM, active governance | GitHub issue / Forum | Medium | github.com/morpho-org, forum.morpho.org, @Morpho |
| **Rysk** | Options protocol on HyperEVM | Discord (uncertain) | Low | app.rysk.finance — no public contact found |
| **Trade[XYZ]** | Trading frontend on Hyperliquid | Discord (uncertain) | Low | app.trade.xyz — minimal public info |
| **Hyperliquid dev community** | Central hub for all HyperEVM builders | Discord / Telegram | High | discord.gg/hyperliquid, t.me/hyperliquid_announcements |
| **Builder Code teams** | Earn fees on user orders — safety = trust | Hyperliquid Discord | Medium | Find active builders in Hyperliquid Discord #builders channel |

## 7. GitHub issue / discussion draft

> **Title:** Pre-broadcast risk guard for HyperEVM intents — looking for feedback
>
> Hi — we built a small open-source PoC that checks normalized HyperEVM transaction intents before they'd be signed:
>
> https://github.com/rugbusteraipatrol/rugbuster-hyperevm-preflight-guard
>
> It's a local TypeScript package (no keys, no RPC, no signing) that returns ALLOW / WARN / BLOCK for patterns like unlimited approvals, unknown contracts, blocked addresses, and high-value transfers.
>
> It's a proof of concept, not production security. We're looking for technical feedback from HyperEVM builders:
> - Which risk rules matter most in practice?
> - Is this the right abstraction, or should it target HyperCore signed actions instead?
> - What would make this worth integrating into a wallet or frontend?
>
> Any feedback welcome. Thanks.

## 8. Discord / Telegram short message

> Hey — we built a small PoC for a pre-broadcast risk guard on HyperEVM. Checks things like unlimited approvals and unknown contracts before signing. No keys, no RPC, just a local TypeScript package. Looking for feedback from builders — would love to know if this is useful or if we're solving the wrong problem. Repo: https://github.com/rugbusteraipatrol/rugbuster-hyperevm-preflight-guard

## 9. X post

> Built a small open-source PoC: a pre-broadcast risk guard for HyperEVM tx intents. Checks unlimited approvals, unknown contracts, blocked addresses. Local only, no keys, no RPC. Looking for feedback from HyperEVM builders. github.com/rugbusteraipatrol/rugbuster-hyperevm-preflight-guard

## 10. Longer DM

> Hi — we're building open-source pre-sign safety tools for agentic wallets. We just finished a small PoC for HyperEVM: a local TypeScript guard that checks transaction intents for risky patterns (unlimited approvals, unknown contracts, blocked addresses) before they'd be signed.
>
> It's not production security — it's a proof of concept with 27 tests, no keys, no RPC, no network calls. We're trying to figure out if this direction is useful for HyperEVM builders.
>
> Would you have 5 minutes to look at it and tell us what's wrong or missing? We're specifically trying to understand which rules matter and whether this should target HyperCore signed actions next.
>
> Repo: https://github.com/rugbusteraipatrol/rugbuster-hyperevm-preflight-guard
>
> Thanks for anything you can share.

## 11. What feedback we want

1. **Which risk rules matter most?** Unlimited approvals, unknown contracts, high-value transfers — which of these actually cause problems for your users today?
2. **Should this target HyperCore signed actions next?** The HyperCore layer has its own signed-action pipeline (orders, cancellations, approvals). Is a guard there more useful than HyperEVM?
3. **Is Builder Code safety a better angle?** Builders submit orders on behalf of users and charge fees. Would a guard that checks builder-submitted orders be more impactful?
4. **What data should be caller-supplied vs fetched?** Right now all address reputation is caller-supplied. Should a real version fetch contract verification status or on-chain reputation?
5. **What would make this worth integrating?** If this were production-quality, what would your wallet/frontend/agent need from it to actually use it?

## 12. Do not say

- ❌ "grant" or "funding" or "sponsorship"
- ❌ "production-ready" or "battle-tested"
- ❌ "guaranteed protection" or "prevents exploits"
- ❌ "official Hyperliquid integration" or "endorsed by Hyperliquid"
- ❌ "AI-powered security" (unless carefully qualified as "rule-based intent analysis")
- ❌ "we need money" or "seeking investment"
- ❌ "revolutionary" or "game-changing"
- ❌ "security audit" or "security tool"
- ❌ Anything that implies this is more than a PoC

## 13. Recommended first action

**Post in the Hyperliquid Discord** (discord.gg/hyperliquid) in the most active developer/builder channel.

Why:
- It's the central hub for all HyperEVM builders.
- Low friction — no cold DMs, no formal applications.
- Public — other builders can see the discussion and contribute.
- You can tag or mention specific project teams if the channel allows it.

**What to post:** The Discord short message (section 8) with the repo link.

**Then:** If you get any positive signal, follow up with a GitHub issue on the most responsive project's repo (Kinetiq has a public GitHub org, Morpho has a public GitHub org — both are good candidates).

**Do not** cold-email anyone yet. Do not mention grants. Just ask for technical feedback.
