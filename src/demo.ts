/**
 * Runnable demo: npm run demo
 *
 * Walks through mock HyperEVM transaction intents and shows what
 * analyzeHyperEVMIntent decides for each one. Nothing here touches the
 * network, holds a key, or signs anything.
 */
import { analyzeHyperEVMIntent, guardedSendTransaction, GuardBlockError, GuardConfirmationRequiredError } from "./index.js";
import type { GuardContext, HyperEVMTransactionIntent } from "./types.js";

const context: GuardContext = {
  knownContracts: ["0x1111111111111111111111111111111111111111"],
  knownSpenders: ["0x2222222222222222222222222222222222222222"],
  blockedAddresses: ["0xbad0000000000000000000000000000000000000"],
};

const scenarios: { title: string; intent: HyperEVMTransactionIntent }[] = [
  {
    title: "ALLOW: known contract, low value",
    intent: {
      id: "demo-1",
      chainId: 999,
      from: "0xa000000000000000000000000000000000000001",
      to: "0x1111111111111111111111111111111111111111",
      valueWei: "1000000000000000000",
    },
  },
  {
    title: "WARN: unlimited ERC-20 approval",
    intent: {
      id: "demo-2",
      chainId: 999,
      from: "0xa000000000000000000000000000000000000001",
      to: "0xc000000000000000000000000000000000000001",
      valueWei: "0",
      decodedAction: {
        kind: "erc20_approve",
        token: "0xc000000000000000000000000000000000000001",
        spender: "0x2222222222222222222222222222222222222222",
        amount: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      },
    },
  },
  {
    title: "BLOCK: approval to blocked spender",
    intent: {
      id: "demo-3",
      chainId: 999,
      from: "0xa000000000000000000000000000000000000001",
      to: "0xc000000000000000000000000000000000000001",
      valueWei: "0",
      decodedAction: {
        kind: "erc20_approve",
        token: "0xc000000000000000000000000000000000000001",
        spender: "0xbad0000000000000000000000000000000000000",
        amount: "1000000000000000000",
      },
    },
  },
  {
    title: "WARN: unknown contract (requireKnownContract enabled)",
    intent: {
      id: "demo-4",
      chainId: 999,
      from: "0xa000000000000000000000000000000000000001",
      to: "0x9999999999999999999999999999999999999999",
      valueWei: "0",
    },
  },
  {
    title: "WARN: high-value native transfer",
    intent: {
      id: "demo-5",
      chainId: 999,
      from: "0xa000000000000000000000000000000000000001",
      to: "0x1111111111111111111111111111111111111111",
      valueWei: "100000000000000000000", // 100 HYPE
    },
  },
  {
    title: "BLOCK: unsupported chain ID",
    intent: {
      id: "demo-6",
      chainId: 1,
      from: "0xa000000000000000000000000000000000000001",
      to: "0x1111111111111111111111111111111111111111",
      valueWei: "0",
    },
  },
];

for (const { title, intent } of scenarios) {
  const decision = analyzeHyperEVMIntent(intent, context);
  console.log(`\n=== ${title} ===`);
  console.log(`verdict: ${decision.verdict}`);
  console.log(`reasons: ${decision.reasons.join(" | ")}`);
}

console.log("\n=== guardedSendTransaction: BLOCK never reaches sendFn ===");
try {
  await guardedSendTransaction(scenarios[2].intent, async () => {
    console.log("sendFn called (this should not print)");
    return "0xsent";
  }, { context });
} catch (error) {
  if (error instanceof GuardBlockError) {
    console.log(`send refused: ${error.message}`);
  } else {
    throw error;
  }
}

console.log("\n=== guardedSendTransaction: WARN requires explicit confirmation ===");
try {
  await guardedSendTransaction(scenarios[3].intent, async () => "0xsent", { context });
} catch (error) {
  if (error instanceof GuardConfirmationRequiredError) {
    console.log(`send refused without confirmation: ${error.message}`);
  } else {
    throw error;
  }
}

const confirmed = await guardedSendTransaction(scenarios[3].intent, async () => "0xsent (fake, no real broadcast)", { context, confirmWarn: true });
console.log(`send proceeded after confirmWarn: true -> ${confirmed.result}`);
