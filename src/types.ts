/**
 * Types for a normalized, mock HyperEVM transaction intent.
 *
 * These shapes are hand-modeled after what a standard EVM wallet or trading
 * frontend would produce before signing. This PoC does NOT decode real
 * calldata or call any RPC. See README "Limitations".
 */

export type Verdict = "ALLOW" | "WARN" | "BLOCK";
export type Severity = "INFO" | "WARN" | "BLOCK";

export type DecodedActionKind =
  | "erc20_approve"
  | "erc20_transfer"
  | "contract_call"
  | "native_transfer"
  | "unknown";

export type DecodedAction =
  | { kind: "erc20_approve"; token: string; spender: string; amount: string }
  | { kind: "erc20_transfer"; token: string; to: string; amount: string }
  | { kind: "contract_call"; signature?: string }
  | { kind: "native_transfer"; to: string; amountWei: string }
  | { kind: "unknown" };

/** A normalized, mock HyperEVM transaction intent. */
export interface HyperEVMTransactionIntent {
  id?: string;
  /** 999 = HyperEVM mainnet, 998 = HyperEVM testnet. */
  chainId?: number;
  from?: string;
  to?: string;
  /** Native value in wei, as a base-10 string. */
  valueWei?: string;
  /** Opaque calldata hex string. This PoC does NOT decode it. */
  data?: string;
  /** Caller-supplied decoded action for rule-based checking. */
  decodedAction?: DecodedAction;
}

export interface GuardPolicy {
  /** Above this wei amount on a native transfer, escalate to at least WARN. */
  highValueThresholdWei: string;
  /** If true, an unknown contract address triggers WARN. */
  requireKnownContract: boolean;
}

export interface GuardContext {
  /** Contract addresses treated as known-safe. */
  knownContracts?: string[];
  /** Spender addresses treated as known-safe for ERC-20 approvals. */
  knownSpenders?: string[];
  /** Addresses that are always blocked. */
  blockedAddresses?: string[];
  policy?: Partial<GuardPolicy>;
}

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
}

export interface GuardDecision {
  verdict: Verdict;
  reasons: string[];
  evidence: {
    intentId?: string;
    chainId?: number;
    from?: string;
    to?: string;
    findings: Finding[];
    policyUsed: GuardPolicy;
    parseErrors: string[];
    evaluatedAt: string;
  };
  limitations: string[];
}

export const SUPPORTED_CHAIN_IDS = [999, 998] as const;

export const DEFAULT_POLICY: GuardPolicy = {
  highValueThresholdWei: "50000000000000000000", // 50 HYPE (18 decimals)
  requireKnownContract: true,
};

export const LIMITATIONS: string[] = [
  "PoC only: this is not a security audit and not production security advice.",
  "No real calldata decoding — the `data` field is opaque. The caller supplies `decodedAction` for rule-based checking.",
  "No live HyperEVM RPC calls — address reputation comes entirely from caller-supplied context.",
  "No ABI decoding library — intents are consumed as pre-normalized JSON.",
  "No on-chain contract verification — 'known contracts' come from caller context, not from a block explorer or verification service.",
  "Never holds keys, never signs, never broadcasts.",
];
