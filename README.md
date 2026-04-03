# Chuck — Autonomous Offensive Security Agent

Chuck is a purpose-built autonomous security research agent for **authorized** penetration testing, vulnerability research, and smart contract auditing. It combines a real ReAct reasoning loop with hands-on execution of a professional security toolchain.

> **v0.3.0** — Complete overhaul. Chuck now executes tools for real, feeds output back to the model, and reasons iteratively until it has a complete picture of the attack surface.

---

## What changed in v0.3.0

| Before | After |
|--------|-------|
| Single-shot LLM call, no loop | ReAct loop — up to 15 Plan→Act→Observe cycles |
| Generated text *describing* commands | Actually executes via `child_process.spawn` |
| Phi3 at 2048 tokens | Claude API (Sonnet) primary, 16k ctx Ollama fallback |
| No structured output | Typed findings schema, SQLite-compatible JSON persistence |
| Raw markdown files dumped into context | Keyword-scored relevance-filtered memory injection |
| No scope enforcement | Hard CIDR/domain allowlist enforced before every exec |
| No audit trail | JSONL log + SHA256 tamper-evident session hash |
| `console.log` only | Full Ink TUI with live step streaming + findings panel |

---

## Architecture

```
chuck-ai
└── src/
    ├── agent/
    │   ├── loop.ts       ← ReAct loop (the brain)
    │   ├── model.ts      ← Claude API + Ollama fallback
    │   └── parser.ts     ← Tool call extractor
    ├── tools/
    │   ├── executor.ts   ← child_process.spawn bridge (12 tools)
    │   └── scope.ts      ← Hard scope enforcement
    ├── audit/
    │   └── logger.ts     ← JSONL log + SHA256 session hash
    ├── db/
    │   ├── schema.ts     ← Finding/Session types + JSON persistence
    │   └── report.ts     ← Markdown report generator
    ├── memory/
    │   └── store.ts      ← Keyword-scored memory injection
    ├── ui/
    │   └── dashboard.tsx ← Live Ink TUI
    └── main.tsx          ← Entrypoint
```

---

## Setup

### Prerequisites

- **Bun** (recommended) or Node.js 20+
- One of: Anthropic API key **or** local Ollama instance

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
```

### Install

```bash
git clone https://github.com/Wakhungila/chuck.git
cd chuck
bun install
bun run build
```

### Configure

**Option A — Claude API (recommended, best results):**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Option B — Local Ollama:**
```bash
# Install a capable model (needs 8B+ for reliable tool use)
ollama pull qwen2.5-coder:14b

# If Ollama runs on Windows host and Chuck runs in WSL:
export OLLAMA_HOST=http://$(grep -m1 nameserver /etc/resolv.conf | awk '{print $2}'):11434
```

### Scope file (for professional engagements)

```bash
cp scope.example.json .chuck/scope.json
# Edit .chuck/scope.json with your authorized targets
```

---

## Usage

```bash
# Standard run with interactive TUI
./chuck-ai "Scan 192.168.1.100 for open ports and test for common web vulnerabilities"

# No TUI, plain stdout
./chuck-ai --no-ui "Perform subdomain enumeration on example.com"

# Smart contract audit
./chuck-ai "Audit the contracts in ./contracts for reentrancy and logic flaws"

# Source code review
./chuck-ai "Review src/auth for timing attacks, unsafe eval(), and SQL injection vectors"

# Use a specific scope file
./chuck-ai --scope /path/to/scope.json "task..."

# List past sessions
./chuck-ai --list

# Print a session report
./chuck-ai --session <session-id>
```

---

## Tool Stack

Chuck orchestrates 12 security tools natively:

| Tool | Purpose |
|------|---------|
| `nmap` | Port scanning, service/version detection |
| `subfinder` | Passive subdomain enumeration |
| `nuclei` | Template-based CVE/vuln scanning |
| `sqlmap` | SQL injection detection and exploitation |
| `ffuf` | Directory brute force, parameter fuzzing |
| `httpx` | HTTP probing, tech stack detection |
| `curl` | Manual HTTP requests and header inspection |
| `slither` | Solidity smart contract static analysis |
| `grep` | Pattern search for secrets, dangerous functions |
| `whois` | Domain and IP registration lookup |
| `read_file` | Local file and source code reading |
| `bash` | Arbitrary shell — custom pipelines and tools |

---

## Session output

Each session creates:
```
sessions/<session-id>/
├── audit.jsonl     ← Every command + result, timestamped
├── session.hash    ← SHA256 of audit log (tamper evidence)
└── report.md       ← Full findings report in Markdown
```

---

## Memory system

Drop `.md` files into `.chuck/memory/` to inject persistent knowledge:
- Custom payload lists
- Internal checklist for your org
- Historical findings from previous engagements

Chuck automatically saves CRITICAL/HIGH findings to memory after each session so it doesn't repeat past mistakes.

---

## Scope enforcement

Create `.chuck/scope.json` (see `scope.example.json`) to lock Chuck to authorized targets. Every tool call is validated against the scope before execution — violations are blocked and logged, not just ignored.

---

## Legal

**Chuck is for authorized security research only.** Always obtain written permission before testing any system you do not own. Run Chuck in an isolated VM or container when performing active exploitation. The authors accept no liability for misuse.
