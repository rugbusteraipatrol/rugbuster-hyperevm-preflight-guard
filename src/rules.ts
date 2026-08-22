import type { DecodedAction, Finding, GuardContext, GuardPolicy, HyperEVMTransactionIntent } from "./types.js";
import { DEFAULT_POLICY, SUPPORTED_CHAIN_IDS } from "./types.js";

export interface ParseResult {
  ok: boolean;
  errors: string[];
}

const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isValidAddress(value: string | undefined): boolean {
  return typeof value === "string" && HEX_ADDRESS_RE.test(value);
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function includesAddress(addresses: string[] | undefined, address: string): boolean {
  const normalized = normalizeAddress(address);
  return (addresses ?? []).some((candidate) => normalizeAddress(candidate) === normalized);
}

function parseNonNegativeBigInt(value: string | undefined): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

/**
 * Validates that an intent has the minimum shape needed to reason about it.
 * Missing critical fields is a BLOCK, not a best-effort guess.
 */
export function parseHyperEVMIntent(intent: HyperEVMTransactionIntent | null | undefined): ParseResult {
  const errors: string[] = [];

  if (!intent || typeof intent !== "object") {
    return { ok: false, errors: ["intent is missing or not an object"] };
  }
  if (intent.chainId === undefined || intent.chainId === null) {
    errors.push("chainId is missing");
  } else if (!SUPPORTED_CHAIN_IDS.includes(intent.chainId as typeof SUPPORTED_CHAIN_IDS[number])) {
    errors.push(`chainId ${intent.chainId} is not a supported HyperEVM chain (expected 999 or 998)`);
  }
  if (!isValidAddress(intent.from)) {
    errors.push("from is missing or not a valid hex address");
  }
  if (!isValidAddress(intent.to)) {
    errors.push("to is missing or not a valid hex address");
  }

  return { ok: errors.length === 0, errors };
}

export function resolvePolicy(context?: GuardContext): GuardPolicy {
  return { ...DEFAULT_POLICY, ...(context?.policy ?? {}) };
}

/** Unlimited approval: amount >= 2^128 (a generous "effectively unlimited" threshold). */
const UNLIMITED_APPROVAL_THRESHOLD = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");

/** ERC-20 approval rule. */
export function checkApproval(action: DecodedAction, context: GuardContext | undefined): Finding | null {
  if (action.kind !== "erc20_approve") return null;

  if (includesAddress(context?.blockedAddresses, action.spender)) {
    return {
      code: "APPROVAL_TO_BLOCKED_SPENDER",
      severity: "BLOCK",
      message: `ERC-20 approval targets a blocked address (${action.spender}).`,
    };
  }

  const amount = parseNonNegativeBigInt(action.amount);
  if (amount === null) {
    return {
      code: "INVALID_APPROVAL_AMOUNT",
      severity: "BLOCK",
      message: `ERC-20 approval amount is missing or not a non-negative integer (${action.amount}).`,
    };
  }
  if (amount >= UNLIMITED_APPROVAL_THRESHOLD) {
    return {
      code: "UNLIMITED_APPROVAL",
      severity: "WARN",
      message: `ERC-20 approval amount (${action.amount}) is effectively unlimited.`,
    };
  }

  const known = includesAddress(context?.knownSpenders, action.spender);
  if (!known) {
    return {
      code: "APPROVAL_TO_UNKNOWN_SPENDER",
      severity: "WARN",
      message: `ERC-20 approval targets an unknown spender (${action.spender}).`,
    };
  }

  return null;
}

/** Contract interaction rule. */
export function checkContractInteraction(
  to: string,
  context: GuardContext | undefined,
  policy: GuardPolicy,
): Finding | null {
  if (includesAddress(context?.blockedAddresses, to)) {
    return {
      code: "INTERACTION_WITH_BLOCKED_CONTRACT",
      severity: "BLOCK",
      message: `Transaction targets a blocked contract address (${to}).`,
    };
  }

  if (!policy.requireKnownContract) return null;

  const known = includesAddress(context?.knownContracts, to);
  if (!known) {
    return {
      code: "UNKNOWN_CONTRACT",
      severity: "WARN",
      message: `Transaction targets an unknown contract (${to}) and requireKnownContract is enabled.`,
    };
  }

  return null;
}

/** High-value native transfer rule. */
export function checkHighValue(intent: HyperEVMTransactionIntent, policy: GuardPolicy): Finding | null {
  const value = parseNonNegativeBigInt(intent.valueWei ?? "0");
  const threshold = parseNonNegativeBigInt(policy.highValueThresholdWei);
  if (value === null) {
    return {
      code: "INVALID_NATIVE_VALUE",
      severity: "BLOCK",
      message: `Native value is missing or not a non-negative integer (${intent.valueWei}).`,
    };
  }
  if (threshold === null) {
    return {
      code: "INVALID_HIGH_VALUE_THRESHOLD",
      severity: "BLOCK",
      message: `Configured high-value threshold is not a non-negative integer (${policy.highValueThresholdWei}).`,
    };
  }
  if (value > threshold) {
    return {
      code: "HIGH_VALUE_TRANSFER",
      severity: "WARN",
      message: `Native transfer value ${value.toString()} wei exceeds the configured threshold of ${threshold.toString()} wei.`,
    };
  }
  return null;
}
