// RugBuster HyperEVM Preflight Guard — browser demo
// Fully static, no network calls, no wallet, no external scripts.
// Mirrors the TypeScript guard logic from src/rules.ts + src/guard.ts.

(function () {
  "use strict";

  var SUPPORTED_CHAINS = [999, 998];
  var HEX_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
  var UNLIMITED_THRESHOLD = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
  var DEFAULT_HIGH_VALUE_WEI = "50000000000000000000";

  var LIMITATIONS = [
    "PoC only: this is not a security audit and not production security advice.",
    "No real calldata decoding — the data field is opaque.",
    "No live HyperEVM RPC calls — address reputation is caller-supplied.",
    "No ABI decoding library — intents are consumed as pre-normalized JSON.",
    "No on-chain contract verification.",
    "Never holds keys, never signs, never broadcasts."
  ];

  // --- Scenarios ---

  var SCENARIOS = {
    "allow-known": {
      label: "ALLOW — known contract",
      context: {
        knownContracts: ["0x1111111111111111111111111111111111111111"],
        knownSpenders: [],
        blockedAddresses: []
      },
      intent: {
        id: "demo-allow-known",
        chainId: 999,
        from: "0xa000000000000000000000000000000000000001",
        to: "0x1111111111111111111111111111111111111111",
        valueWei: "1000000000000000000"
      }
    },
    "warn-unlimited": {
      label: "WARN — unlimited approval",
      context: {
        knownContracts: ["0xc000000000000000000000000000000000000001"],
        knownSpenders: ["0x2222222222222222222222222222222222222222"],
        blockedAddresses: []
      },
      intent: {
        id: "demo-warn-unlimited",
        chainId: 999,
        from: "0xa000000000000000000000000000000000000001",
        to: "0xc000000000000000000000000000000000000001",
        valueWei: "0",
        decodedAction: {
          kind: "erc20_approve",
          token: "0xc000000000000000000000000000000000000001",
          spender: "0x2222222222222222222222222222222222222222",
          amount: "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        }
      }
    },
    "block-spender": {
      label: "BLOCK — blocked spender",
      context: {
        knownContracts: ["0xc000000000000000000000000000000000000001"],
        knownSpenders: [],
        blockedAddresses: ["0xbad0000000000000000000000000000000000000"]
      },
      intent: {
        id: "demo-block-spender",
        chainId: 999,
        from: "0xa000000000000000000000000000000000000001",
        to: "0xc000000000000000000000000000000000000001",
        valueWei: "0",
        decodedAction: {
          kind: "erc20_approve",
          token: "0xc000000000000000000000000000000000000001",
          spender: "0xbad0000000000000000000000000000000000000",
          amount: "1000000000000000000"
        }
      }
    },
    "warn-unknown": {
      label: "WARN — unknown contract",
      context: {
        knownContracts: [],
        knownSpenders: [],
        blockedAddresses: [],
        policy: { requireKnownContract: true }
      },
      intent: {
        id: "demo-warn-unknown",
        chainId: 999,
        from: "0xa000000000000000000000000000000000000001",
        to: "0x9999999999999999999999999999999999999999",
        valueWei: "0"
      }
    },
    "warn-highvalue": {
      label: "WARN — high-value transfer",
      context: {
        knownContracts: ["0x1111111111111111111111111111111111111111"],
        knownSpenders: [],
        blockedAddresses: []
      },
      intent: {
        id: "demo-warn-highvalue",
        chainId: 999,
        from: "0xa000000000000000000000000000000000000001",
        to: "0x1111111111111111111111111111111111111111",
        valueWei: "100000000000000000000"
      }
    },
    "block-chain": {
      label: "BLOCK — unsupported chain",
      context: {
        knownContracts: [],
        knownSpenders: [],
        blockedAddresses: []
      },
      intent: {
        id: "demo-block-chain",
        chainId: 1,
        from: "0xa000000000000000000000000000000000000001",
        to: "0x1111111111111111111111111111111111111111",
        valueWei: "0"
      }
    }
  };

  // --- Guard logic (mirrors src/rules.ts + src/guard.ts) ---

  function isValidAddress(v) {
    return typeof v === "string" && HEX_ADDR_RE.test(v);
  }

  function normalizeAddress(v) {
    return String(v).toLowerCase();
  }

  function includesAddress(addresses, address) {
    var normalized = normalizeAddress(address);
    return (addresses || []).some(function (candidate) {
      return normalizeAddress(candidate) === normalized;
    });
  }

  function parseNonNegativeBigInt(v) {
    if (typeof v !== "string" || !/^\d+$/.test(v)) return null;
    return BigInt(v);
  }

  function resolvePolicy(ctx) {
    var p = { highValueThresholdWei: DEFAULT_HIGH_VALUE_WEI, requireKnownContract: true };
    if (ctx && ctx.policy) {
      if (ctx.policy.highValueThresholdWei !== undefined) p.highValueThresholdWei = ctx.policy.highValueThresholdWei;
      if (ctx.policy.requireKnownContract !== undefined) p.requireKnownContract = ctx.policy.requireKnownContract;
    }
    return p;
  }

  function parseIntent(intent) {
    var errors = [];
    if (!intent || typeof intent !== "object") return { ok: false, errors: ["intent is missing or not an object"] };
    if (intent.chainId === undefined || intent.chainId === null) {
      errors.push("chainId is missing");
    } else if (SUPPORTED_CHAINS.indexOf(intent.chainId) === -1) {
      errors.push("chainId " + intent.chainId + " is not a supported HyperEVM chain (expected 999 or 998)");
    }
    if (!isValidAddress(intent.from)) errors.push("from is missing or not a valid hex address");
    if (!isValidAddress(intent.to)) errors.push("to is missing or not a valid hex address");
    return { ok: errors.length === 0, errors: errors };
  }

  function checkApproval(action, ctx) {
    if (!action || action.kind !== "erc20_approve") return null;
    if (includesAddress(ctx && ctx.blockedAddresses, action.spender)) {
      return { code: "APPROVAL_TO_BLOCKED_SPENDER", severity: "BLOCK", message: "ERC-20 approval targets a blocked address (" + action.spender + ")." };
    }
    var amount = parseNonNegativeBigInt(action.amount);
    if (amount === null) {
      return { code: "INVALID_APPROVAL_AMOUNT", severity: "BLOCK", message: "ERC-20 approval amount is missing or not a non-negative integer (" + action.amount + ")." };
    }
    if (amount >= UNLIMITED_THRESHOLD) {
      return { code: "UNLIMITED_APPROVAL", severity: "WARN", message: "ERC-20 approval amount is effectively unlimited." };
    }
    if (!includesAddress(ctx && ctx.knownSpenders, action.spender)) {
      return { code: "APPROVAL_TO_UNKNOWN_SPENDER", severity: "WARN", message: "ERC-20 approval targets an unknown spender (" + action.spender + ")." };
    }
    return null;
  }

  function checkContract(to, ctx, policy) {
    if (includesAddress(ctx && ctx.blockedAddresses, to)) {
      return { code: "INTERACTION_WITH_BLOCKED_CONTRACT", severity: "BLOCK", message: "Transaction targets a blocked contract address (" + to + ")." };
    }
    if (!policy.requireKnownContract) return null;
    if (!includesAddress(ctx && ctx.knownContracts, to)) {
      return { code: "UNKNOWN_CONTRACT", severity: "WARN", message: "Transaction targets an unknown contract (" + to + ") and requireKnownContract is enabled." };
    }
    return null;
  }

  function checkHighValue(intent, policy) {
    var value = parseNonNegativeBigInt(intent.valueWei || "0");
    var threshold = parseNonNegativeBigInt(policy.highValueThresholdWei);
    if (value === null) {
      return { code: "INVALID_NATIVE_VALUE", severity: "BLOCK", message: "Native value is missing or not a non-negative integer (" + intent.valueWei + ")." };
    }
    if (threshold === null) {
      return { code: "INVALID_HIGH_VALUE_THRESHOLD", severity: "BLOCK", message: "Configured high-value threshold is not a non-negative integer (" + policy.highValueThresholdWei + ")." };
    }
    if (value > threshold) {
      return { code: "HIGH_VALUE_TRANSFER", severity: "WARN", message: "Native transfer value " + value.toString() + " wei exceeds the configured threshold of " + threshold.toString() + " wei." };
    }
    return null;
  }

  var SEV_RANK = { INFO: 0, WARN: 1, BLOCK: 2 };

  function worstVerdict(findings) {
    var worst = "INFO";
    for (var i = 0; i < findings.length; i++) {
      if (SEV_RANK[findings[i].severity] > SEV_RANK[worst]) worst = findings[i].severity;
    }
    return worst === "INFO" ? "ALLOW" : worst;
  }

  function analyze(intent, ctx) {
    var policy = resolvePolicy(ctx);
    var parsed = parseIntent(intent);
    if (!parsed.ok) {
      return {
        verdict: "BLOCK",
        reasons: parsed.errors,
        evidence: { chainId: intent && intent.chainId, from: intent && intent.from, to: intent && intent.to, findings: [], policyUsed: policy, parseErrors: parsed.errors },
        limitations: LIMITATIONS.concat(["Analysis stopped after parse failure."])
      };
    }
    var findings = [];
    var approvalFinding = checkApproval(intent.decodedAction, ctx);
    if (approvalFinding) findings.push(approvalFinding);
    var contractFinding = checkContract(intent.to, ctx, policy);
    if (contractFinding) findings.push(contractFinding);
    var highValueFinding = checkHighValue(intent, policy);
    if (highValueFinding) findings.push(highValueFinding);

    var verdict = worstVerdict(findings);
    var reasons = findings.length > 0
      ? findings.map(function (f) { return f.message; })
      : ["No risk indicators found for this intent given the supplied context."];

    return {
      verdict: verdict,
      reasons: reasons,
      evidence: { chainId: intent.chainId, from: intent.from, to: intent.to, decodedActionKind: intent.decodedAction ? intent.decodedAction.kind : "(none)", findings: findings, policyUsed: policy, parseErrors: [] },
      limitations: LIMITATIONS
    };
  }

  // --- Rendering ---

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function scenarioWithAddress(baseScenario, address) {
    var scenario = clone(baseScenario);
    if (!isValidAddress(address)) return scenario;

    if (scenario.intent) {
      if (scenario.intent.decodedAction && scenario.intent.decodedAction.kind === "erc20_approve") {
        scenario.intent.decodedAction.token = scenario.intent.to || scenario.intent.decodedAction.token;
        if (scenario.label.indexOf("blocked spender") !== -1) {
          scenario.intent.decodedAction.spender = address;
          scenario.context.blockedAddresses = [address];
        } else {
          scenario.intent.to = address;
          scenario.intent.decodedAction.token = address;
          scenario.context.knownContracts = [address];
        }
      } else {
        scenario.intent.to = address;
        if (scenario.label.indexOf("unknown contract") !== -1) {
          scenario.context.knownContracts = [];
        } else {
          scenario.context.knownContracts = [address];
        }
      }
    }
    return scenario;
  }

  function render(result, scenario) {
    var output = document.getElementById("output");
    var jsonPanels = document.getElementById("json-panels");
    output.hidden = false;
    jsonPanels.hidden = false;

    // Verdict badge
    var badge = document.getElementById("verdict-badge");
    badge.textContent = result.verdict;
    var stateClass = result.verdict.toLowerCase();
    badge.className = "verdict " + stateClass;

    var label = document.getElementById("verdict-label");
    var labelMap = { ALLOW: "Transaction looks safe to proceed.", WARN: "Proceed with caution — review the findings below.", BLOCK: "Transaction refused by the guard." };
    label.textContent = labelMap[result.verdict] || "";
    document.getElementById("status").textContent = "Static preflight result ready. Review reasons and evidence trace below.";

    var riskMap = { ALLOW: 12, WARN: 58, BLOCK: 92 };
    var riskValue = riskMap[result.verdict] || 0;
    var riskPanel = document.getElementById("riskPanel");
    riskPanel.className = "risk " + stateClass;
    document.getElementById("riskValue").textContent = riskValue + "%";
    document.getElementById("meterFill").style.width = riskValue + "%";
    document.getElementById("chainScore").textContent = result.evidence.chainId || "BLOCK";
    document.getElementById("detail").textContent =
      "Engine: static_hyperevm_preflight_guard // Cache: local // Target: normalized mock intent // Findings: " +
      String(result.evidence.findings.length);

    // Reasons
    var reasonsList = document.getElementById("reasons-list");
    reasonsList.innerHTML = "";
    result.reasons.forEach(function (r) {
      var li = document.createElement("li");
      li.textContent = r;
      reasonsList.appendChild(li);
    });

    var ev = result.evidence;

    // Findings
    var findingsPanel = document.getElementById("findings-panel");
    var findingsBody = document.getElementById("findings-body");
    findingsBody.innerHTML = "";
    if (ev.findings && ev.findings.length > 0) {
      findingsPanel.hidden = false;
      ev.findings.forEach(function (f) {
        var tr = document.createElement("tr");
        var tdCode = document.createElement("td");
        tdCode.textContent = f.code;
        var tdSev = document.createElement("td");
        tdSev.textContent = f.severity;
        tdSev.className = "sev-" + f.severity;
        var tdMsg = document.createElement("td");
        tdMsg.textContent = f.message;
        tr.appendChild(tdCode);
        tr.appendChild(tdSev);
        tr.appendChild(tdMsg);
        findingsBody.appendChild(tr);
      });
    } else {
      findingsPanel.hidden = true;
    }

    // Limitations
    var limList = document.getElementById("limitations-list");
    limList.innerHTML = "";
    result.limitations.forEach(function (l) {
      var li = document.createElement("li");
      li.textContent = l;
      limList.appendChild(li);
    });

    // JSON panels
    document.getElementById("intent-json").textContent = JSON.stringify(scenario.intent, null, 2);
    document.getElementById("context-json").textContent = JSON.stringify(scenario.context, null, 2);
  }

  // --- Init ---

  function run() {
    var key = document.getElementById("scenario-select").value;
    var baseScenario = SCENARIOS[key];
    if (!baseScenario) return;
    var addressInput = document.getElementById("address-input");
    var address = addressInput.value.trim();
    if (!address) {
      address = baseScenario.intent.to || "0x1111111111111111111111111111111111111111";
      addressInput.value = address;
    }
    var scenario = scenarioWithAddress(baseScenario, address);
    var result = analyze(scenario.intent, scenario.context);
    render(result, scenario);
  }

  document.getElementById("run-btn").addEventListener("click", run);
  document.getElementById("scenario-select").addEventListener("change", run);
  document.getElementById("address-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") run();
  });
  Array.prototype.forEach.call(document.querySelectorAll(".example"), function (button) {
    button.addEventListener("click", function () {
      document.getElementById("scenario-select").value = button.dataset.scenario;
      document.getElementById("address-input").value = button.dataset.address;
      run();
    });
  });

  // Run once on load
  run();
})();
