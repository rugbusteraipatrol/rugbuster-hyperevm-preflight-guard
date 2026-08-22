import { checkApproval, checkContractInteraction, checkHighValue, parseHyperEVMIntent, resolvePolicy } from "./rules.js";
import type { Finding, GuardContext, GuardDecision, HyperEVMTransactionIntent, Severity } from "./types.js";
import { LIMITATIONS } from "./types.js";

const SEVERITY_RANK: Record<Severity, number> = { INFO: 0, WARN: 1, BLOCK: 2 };

function worstVerdict(findings: Finding[]): GuardDecision["verdict"] {
  let worst: Severity = "INFO";
  for (const finding of findings) {
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[worst]) worst = finding.severity;
  }
  return worst === "INFO" ? "ALLOW" : worst;
}

/**
 * Inspects a normalized HyperEVM transaction intent and returns a verdict.
 *
 * This never signs, never broadcasts, and never fetches anything over the
 * network. It only reasons about the intent object and the caller-supplied
 * context (known contracts, known spenders, blocked addresses, policy).
 */
export function analyzeHyperEVMIntent(intent: HyperEVMTransactionIntent, context?: GuardContext): GuardDecision {
  const policy = resolvePolicy(context);
  const evaluatedAt = new Date().toISOString();
  const parsed = parseHyperEVMIntent(intent);

  if (!parsed.ok) {
    return {
      verdict: "BLOCK",
      reasons: parsed.errors,
      evidence: {
        intentId: intent?.id,
        chainId: intent?.chainId,
        from: intent?.from,
        to: intent?.to,
        findings: [],
        policyUsed: policy,
        parseErrors: parsed.errors,
        evaluatedAt,
      },
      limitations: [...LIMITATIONS, "Analysis stopped after parse failure; no rule beyond structural validation was evaluated."],
    };
  }

  const findings: Finding[] = [];

  // Approval rule (if decoded action is an ERC-20 approval)
  if (intent.decodedAction) {
    const approvalFinding = checkApproval(intent.decodedAction, context);
    if (approvalFinding) findings.push(approvalFinding);
  }

  // Contract interaction rule
  const contractFinding = checkContractInteraction(intent.to!, context, policy);
  if (contractFinding) findings.push(contractFinding);

  // High-value native transfer rule
  const highValueFinding = checkHighValue(intent, policy);
  if (highValueFinding) findings.push(highValueFinding);

  const verdict = worstVerdict(findings);
  const reasons = findings.length > 0
    ? findings.map((f) => f.message)
    : ["No risk indicators found for this intent given the supplied context."];

  return {
    verdict,
    reasons,
    evidence: {
      intentId: intent.id,
      chainId: intent.chainId,
      from: intent.from,
      to: intent.to,
      findings,
      policyUsed: policy,
      parseErrors: [],
      evaluatedAt,
    },
    limitations: LIMITATIONS,
  };
}

export class GuardBlockError extends Error {
  constructor(public readonly decision: GuardDecision) {
    super(`HyperEVM guard BLOCKed this transaction: ${decision.reasons.join("; ")}`);
    this.name = "GuardBlockError";
  }
}

export class GuardConfirmationRequiredError extends Error {
  constructor(public readonly decision: GuardDecision) {
    super(`HyperEVM guard returned WARN and requires explicit confirmation (confirmWarn: true) before broadcast: ${decision.reasons.join("; ")}`);
    this.name = "GuardConfirmationRequiredError";
  }
}

export interface GuardedSendOptions {
  context?: GuardContext;
  /** Must be explicitly true to proceed when the verdict is WARN. */
  confirmWarn?: boolean;
}

export interface GuardedSendResult<T = string> {
  decision: GuardDecision;
  result: T;
}

/**
 * Wraps a caller-supplied broadcast function with a mandatory pre-broadcast
 * guard check.
 *
 * - BLOCK verdict: sendFn is never called. Throws GuardBlockError.
 * - WARN verdict without confirmWarn: sendFn is never called. Throws
 *   GuardConfirmationRequiredError.
 * - WARN verdict with confirmWarn: true, or ALLOW: sendFn is called.
 */
export async function guardedSendTransaction<T = string>(
  intent: HyperEVMTransactionIntent,
  sendFn: (intent: HyperEVMTransactionIntent) => Promise<T> | T,
  options: GuardedSendOptions = {},
): Promise<GuardedSendResult<T>> {
  const decision = analyzeHyperEVMIntent(intent, options.context);

  if (decision.verdict === "BLOCK") {
    throw new GuardBlockError(decision);
  }
  if (decision.verdict === "WARN" && options.confirmWarn !== true) {
    throw new GuardConfirmationRequiredError(decision);
  }

  const result = await sendFn(intent);
  return { decision, result };
}
