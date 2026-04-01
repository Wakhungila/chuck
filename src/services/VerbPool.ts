export const VERB_POOL = {
  PLANNER: [
    "mapping attack surface",
    "building recon plan",
    "identifying entry points",
    "crafting strategy"
  ],
  RECON: [
    "enumerating subdomains",
    "fingerprinting services",
    "mapping infrastructure",
    "gathering intel"
  ],
  FUZZER: [
    "fuzzing parameters",
    "brute-forcing endpoints",
    "injecting payloads",
    "probing for weaknesses"
  ],
  ANALYZER: [
    "analyzing findings",
    "correlating signals",
    "deep static analysis",
    "tracing data flows"
  ],
  EXPLOIT: [
    "crafting exploit",
    "chaining primitives",
    "weaponizing vuln",
    "delivering payload"
  ],
  REPORT: [
    "synthesizing report",
    "documenting impact",
    "writing executive summary",
    "generating PoC"
  ],
  SYNTHESIS: [
    "correlating results",
    "building narrative",
    "finalizing assessment"
  ],
  QUIRKY: [
    "hacking the matrix",
    "poking the bear",
    "unleashing chaos",
    "going full red team"
  ]
} as const;
