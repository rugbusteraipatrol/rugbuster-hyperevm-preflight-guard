import { describe, expect, it } from "vitest";
import { GuardBlockError, GuardConfirmationRequiredError, runGuardedAgentFlow } from "../src/index.js";
import type { AgentFlowCallbacks, GuardContext, HyperEVMTransactionIntent } from "../src/index.js";

const FROM = "0xa000000000000000000000000000000000000001";
const KNOWN_CONTRACT = "0x1111111111111111111111111111111111111111";
const BLOCKED_ADDR = "0xbad0000000000000000000000000000000000000";

function allowIntent(): HyperEVMTransactionIntent {
  return { id: "flow-allow", chainId: 999, from: FROM, to: KNOWN_CONTRACT, valueWei: "0" };
}

function blockIntent(): HyperEVMTransactionIntent {
  return { id: "flow-block", chainId: 999, from: FROM, to: BLOCKED_ADDR, valueWei: "0" };
}

function warnIntent(): HyperEVMTransactionIntent {
  return {
    id: "flow-warn",
    chainId: 999,
    from: FROM,
    to: "0x9999999999999999999999999999999999999999",
    valueWei: "0",
  };
}

const safeContext: GuardContext = {
  knownContracts: [KNOWN_CONTRACT],
  blockedAddresses: [BLOCKED_ADDR],
};

function makeCallbacks(intent: HyperEVMTransactionIntent) {
  let buildCount = 0;
  let sendCount = 0;
  const cb: AgentFlowCallbacks & { buildCount: number; sendCount: number } = {
    buildIntent: () => { buildCount++; return intent; },
    sendTransaction: (i) => { sendCount++; return `0xmock-${i.id}`; },
    get buildCount() { return buildCount; },
    get sendCount() { return sendCount; },
  };
  return cb;
}

describe("runGuardedAgentFlow", () => {
  it("ALLOW path calls build and send once each", async () => {
    const cb = makeCallbacks(allowIntent());
    const result = await runGuardedAgentFlow(cb, { context: safeContext });

    expect(result.sent).toBe(true);
    expect(result.txHash).toBe("0xmock-flow-allow");
    expect(result.decision.verdict).toBe("ALLOW");
    expect(cb.buildCount).toBe(1);
    expect(cb.sendCount).toBe(1);
  });

  it("BLOCK path never calls send", async () => {
    const cb = makeCallbacks(blockIntent());
    await expect(runGuardedAgentFlow(cb, { context: safeContext })).rejects.toBeInstanceOf(GuardBlockError);
    expect(cb.buildCount).toBe(1);
    expect(cb.sendCount).toBe(0);
  });

  it("WARN without confirmWarn does not send", async () => {
    const cb = makeCallbacks(warnIntent());
    await expect(runGuardedAgentFlow(cb, { context: safeContext })).rejects.toBeInstanceOf(GuardConfirmationRequiredError);
    expect(cb.buildCount).toBe(1);
    expect(cb.sendCount).toBe(0);
  });

  it("WARN with confirmWarn sends", async () => {
    const cb = makeCallbacks(warnIntent());
    const result = await runGuardedAgentFlow(cb, { context: safeContext, confirmWarn: true });

    expect(result.sent).toBe(true);
    expect(result.decision.verdict).toBe("WARN");
    expect(cb.sendCount).toBe(1);
  });

  it("calls normalizeIntent when provided", async () => {
    let normalizeCalled = false;
    const cb: AgentFlowCallbacks = {
      buildIntent: () => ({ id: "flow-norm", chainId: 999, from: FROM, to: KNOWN_CONTRACT, valueWei: "0" }),
      normalizeIntent: (i) => { normalizeCalled = true; return { ...i, valueWei: "0" }; },
      sendTransaction: () => "0xmock-norm",
    };
    const result = await runGuardedAgentFlow(cb, { context: safeContext });
    expect(normalizeCalled).toBe(true);
    expect(result.sent).toBe(true);
  });
});
