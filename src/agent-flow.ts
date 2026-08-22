import { analyzeHyperEVMIntent, GuardBlockError, GuardConfirmationRequiredError } from "./guard.js";
import type { GuardContext, GuardDecision, HyperEVMTransactionIntent } from "./types.js";

export interface AgentFlowCallbacks {
  buildIntent: () => Promise<HyperEVMTransactionIntent> | HyperEVMTransactionIntent;
  normalizeIntent?: (intent: HyperEVMTransactionIntent) => Promise<HyperEVMTransactionIntent> | HyperEVMTransactionIntent;
  sendTransaction: (intent: HyperEVMTransactionIntent) => Promise<string> | string;
}

export interface AgentFlowOptions {
  context?: GuardContext;
  confirmWarn?: boolean;
}

export interface AgentFlowResult {
  decision: GuardDecision;
  sent: boolean;
  txHash?: string;
}

/**
 * Mock agentic-wallet flow: build -> normalize (optional) -> guard -> send.
 *
 * BLOCK never calls sendTransaction.
 * WARN calls sendTransaction only when confirmWarn is true.
 * ALLOW calls sendTransaction unconditionally.
 */
export async function runGuardedAgentFlow(
  callbacks: AgentFlowCallbacks,
  options: AgentFlowOptions = {},
): Promise<AgentFlowResult> {
  let intent = await callbacks.buildIntent();
  if (callbacks.normalizeIntent) {
    intent = await callbacks.normalizeIntent(intent);
  }
  const decision = analyzeHyperEVMIntent(intent, options.context);

  if (decision.verdict === "BLOCK") {
    throw new GuardBlockError(decision);
  }
  if (decision.verdict === "WARN" && options.confirmWarn !== true) {
    throw new GuardConfirmationRequiredError(decision);
  }

  const txHash = await callbacks.sendTransaction(intent);
  return { decision, sent: true, txHash };
}
