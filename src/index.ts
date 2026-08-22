// Core guard API.
export { analyzeHyperEVMIntent, guardedSendTransaction, GuardBlockError, GuardConfirmationRequiredError } from "./guard.js";
export type { GuardedSendOptions, GuardedSendResult } from "./guard.js";

// Mock agentic flow wrapper (build -> normalize -> guard -> send).
export { runGuardedAgentFlow } from "./agent-flow.js";
export type { AgentFlowCallbacks, AgentFlowOptions, AgentFlowResult } from "./agent-flow.js";

// Individual rule functions, exported for unit testing and extension.
export { checkApproval, checkContractInteraction, checkHighValue, parseHyperEVMIntent, resolvePolicy } from "./rules.js";
export type { ParseResult } from "./rules.js";

// Types and defaults.
export * from "./types.js";
