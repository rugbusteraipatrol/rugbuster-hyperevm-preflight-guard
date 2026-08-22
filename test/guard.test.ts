import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeHyperEVMIntent, GuardBlockError, GuardConfirmationRequiredError, guardedSendTransaction } from "../src/index.js";
import type { GuardContext, HyperEVMTransactionIntent } from "../src/index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

interface Fixture {
  description: string;
  context: GuardContext;
  intent: HyperEVMTransactionIntent;
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8")) as Fixture;
}

const FROM = "0xa000000000000000000000000000000000000001";
const KNOWN_CONTRACT = "0x1111111111111111111111111111111111111111";
const KNOWN_SPENDER = "0x2222222222222222222222222222222222222222";
const BLOCKED_ADDR = "0xbad0000000000000000000000000000000000000";
const UNKNOWN_CONTRACT = "0x9999999999999999999999999999999999999999";
const TOKEN_ADDR = "0xc000000000000000000000000000000000000001";

describe("analyzeHyperEVMIntent — parse / structural", () => {
  it("BLOCKs when chainId is missing", () => {
    const intent: HyperEVMTransactionIntent = { id: "t1", from: FROM, to: KNOWN_CONTRACT };
    const decision = analyzeHyperEVMIntent(intent, {});
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.parseErrors.join(" ")).toMatch(/chainId/i);
  });

  it("BLOCKs when chainId is unsupported", () => {
    const intent: HyperEVMTransactionIntent = { id: "t2", chainId: 1, from: FROM, to: KNOWN_CONTRACT };
    const decision = analyzeHyperEVMIntent(intent, {});
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.parseErrors.join(" ")).toMatch(/not a supported/i);
  });

  it("BLOCKs when from is missing", () => {
    const intent: HyperEVMTransactionIntent = { id: "t3", chainId: 999, to: KNOWN_CONTRACT };
    const decision = analyzeHyperEVMIntent(intent, {});
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.parseErrors.join(" ")).toMatch(/from/i);
  });

  it("BLOCKs when to is missing", () => {
    const intent: HyperEVMTransactionIntent = { id: "t4", chainId: 999, from: FROM };
    const decision = analyzeHyperEVMIntent(intent, {});
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.parseErrors.join(" ")).toMatch(/to\b/i);
  });
});

describe("analyzeHyperEVMIntent — rules", () => {
  it("ALLOWs for known contract and low value", () => {
    const { intent, context } = loadFixture("allow-known-contract");
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("ALLOW");
    expect(decision.evidence.findings).toHaveLength(0);
  });

  it("WARNs on unlimited ERC-20 approval", () => {
    const { intent, context } = loadFixture("warn-unlimited-approval");
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("WARN");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("UNLIMITED_APPROVAL");
  });

  it("WARNs on approval to unknown spender", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-unknown-spender",
      chainId: 999,
      from: FROM,
      to: TOKEN_ADDR,
      valueWei: "0",
      decodedAction: {
        kind: "erc20_approve",
        token: TOKEN_ADDR,
        spender: UNKNOWN_CONTRACT,
        amount: "1000000000000000000",
      },
    };
    const decision = analyzeHyperEVMIntent(intent, { knownSpenders: [] });
    expect(decision.verdict).toBe("WARN");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("APPROVAL_TO_UNKNOWN_SPENDER");
  });

  it("BLOCKs on approval to blocked spender", () => {
    const { intent, context } = loadFixture("block-blocked-spender");
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("APPROVAL_TO_BLOCKED_SPENDER");
  });

  it("ALLOWs on bounded approval to known spender", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-bounded-approval",
      chainId: 999,
      from: FROM,
      to: TOKEN_ADDR,
      valueWei: "0",
      decodedAction: {
        kind: "erc20_approve",
        token: TOKEN_ADDR,
        spender: KNOWN_SPENDER,
        amount: "1000000000000000000",
      },
    };
    const context: GuardContext = { knownContracts: [TOKEN_ADDR], knownSpenders: [KNOWN_SPENDER] };
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("ALLOW");
  });

  it("matches known spender addresses case-insensitively", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-case-spender",
      chainId: 999,
      from: FROM,
      to: TOKEN_ADDR.toUpperCase().replace("X", "x"),
      valueWei: "0",
      decodedAction: {
        kind: "erc20_approve",
        token: TOKEN_ADDR,
        spender: KNOWN_SPENDER.toUpperCase().replace("X", "x"),
        amount: "1000000000000000000",
      },
    };
    const context: GuardContext = { knownContracts: [TOKEN_ADDR], knownSpenders: [KNOWN_SPENDER] };
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("ALLOW");
  });

  it("BLOCKs malformed approval amounts instead of throwing", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-bad-approval-amount",
      chainId: 999,
      from: FROM,
      to: TOKEN_ADDR,
      valueWei: "0",
      decodedAction: {
        kind: "erc20_approve",
        token: TOKEN_ADDR,
        spender: KNOWN_SPENDER,
        amount: "not-a-number",
      },
    };
    const context: GuardContext = { knownContracts: [TOKEN_ADDR], knownSpenders: [KNOWN_SPENDER] };
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("INVALID_APPROVAL_AMOUNT");
  });

  it("BLOCKs on interaction with blocked contract", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-blocked-contract",
      chainId: 999,
      from: FROM,
      to: BLOCKED_ADDR,
      valueWei: "0",
    };
    const context: GuardContext = { blockedAddresses: [BLOCKED_ADDR] };
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("INTERACTION_WITH_BLOCKED_CONTRACT");
  });

  it("WARNs on unknown contract when requireKnownContract is true", () => {
    const { intent, context } = loadFixture("warn-unknown-contract");
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("WARN");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("UNKNOWN_CONTRACT");
  });

  it("ALLOWs on known contract", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-known-contract",
      chainId: 999,
      from: FROM,
      to: KNOWN_CONTRACT,
      valueWei: "0",
    };
    const context: GuardContext = { knownContracts: [KNOWN_CONTRACT] };
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("ALLOW");
  });

  it("WARNs on high-value native transfer", () => {
    const { intent, context } = loadFixture("warn-high-value-transfer");
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("WARN");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("HIGH_VALUE_TRANSFER");
  });

  it("ALLOWs on low-value native transfer", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-low-value",
      chainId: 999,
      from: FROM,
      to: KNOWN_CONTRACT,
      valueWei: "1000000000000000", // 0.001 HYPE
    };
    const context: GuardContext = { knownContracts: [KNOWN_CONTRACT] };
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("ALLOW");
  });

  it("BLOCKs malformed native values instead of throwing", () => {
    const intent: HyperEVMTransactionIntent = {
      id: "t-bad-native-value",
      chainId: 999,
      from: FROM,
      to: KNOWN_CONTRACT,
      valueWei: "1.5",
    };
    const context: GuardContext = { knownContracts: [KNOWN_CONTRACT] };
    const decision = analyzeHyperEVMIntent(intent, context);
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.evidence.findings.map((f) => f.code)).toContain("INVALID_NATIVE_VALUE");
  });
});

describe("guardedSendTransaction", () => {
  it("never calls sendFn when verdict is BLOCK", async () => {
    const { intent, context } = loadFixture("block-blocked-spender");
    let called = false;
    await expect(
      guardedSendTransaction(intent, async () => { called = true; return "0xsent"; }, { context }),
    ).rejects.toBeInstanceOf(GuardBlockError);
    expect(called).toBe(false);
  });

  it("refuses WARN without confirmWarn", async () => {
    const { intent, context } = loadFixture("warn-unknown-contract");
    let called = false;
    await expect(
      guardedSendTransaction(intent, async () => { called = true; return "0xsent"; }, { context }),
    ).rejects.toBeInstanceOf(GuardConfirmationRequiredError);
    expect(called).toBe(false);
  });

  it("sends on WARN with confirmWarn: true", async () => {
    const { intent, context } = loadFixture("warn-unknown-contract");
    const outcome = await guardedSendTransaction(intent, async () => "0xsent", { context, confirmWarn: true });
    expect(outcome.decision.verdict).toBe("WARN");
    expect(outcome.result).toBe("0xsent");
  });

  it("sends on ALLOW", async () => {
    const { intent, context } = loadFixture("allow-known-contract");
    let called = false;
    const outcome = await guardedSendTransaction(
      intent,
      async () => { called = true; return "0xsent"; },
      { context },
    );
    expect(called).toBe(true);
    expect(outcome.decision.verdict).toBe("ALLOW");
  });
});

describe("limitations", () => {
  it("every decision includes limitations", () => {
    const fixtures = ["allow-known-contract", "warn-unlimited-approval", "block-blocked-spender", "warn-unknown-contract", "warn-high-value-transfer", "block-missing-chain"];
    for (const name of fixtures) {
      const { intent, context } = loadFixture(name);
      const decision = analyzeHyperEVMIntent(intent, context);
      expect(decision.limitations.length).toBeGreaterThan(0);
      expect(decision.limitations.join(" ")).toMatch(/not a security audit/i);
    }
  });
});
