# Chuck Code - Offensive Security Edition

This project is a specialized refactor of Anthropic's Claude Code CLI, optimized for **authorized offensive security research**, bug bounty hunting, and smart contract auditing. Chuck transforms the standard assistant into an adversarial agent capable of autonomous vulnerability research and exploitation Proof-of-Concept (POC) development.

## Core Philosophical Shift

Unlike general-purpose coding assistants, Chuck operates with an **Adversarial Mindset**. It doesn't just look for clean code; it looks for ways to break it.

## Features

- **Adversarial Identity**: Chuck's internal system prompts are hard-wired for a "security researcher" persona. It prioritizes the identification of high-impact vulnerabilities (RCE, SQLi, Logic Flaws) over stylistic improvements.
- **Loosened Guardrails**: The `BashTool` logic has been stripped of restrictive filters. Chuck can execute complex pipelines, use redirection operators, and run "dangerous" shell commands (like `rm`, `kill`, or raw socket operations) essential for pentesting.
- **Autonomous Research Loop**: Chuck proactively uses web search capabilities to retrieve the latest CVEs, examine exploit-db entries, and analyze historical audit reports from platforms like Code4rena and Sherlock.
- **Integrated Security Stack**: Chuck has native proficiency in orchestrating tools like `nmap`, `sqlmap`, `subfinder`, `nuclei`, `slither`, `ffuf`, and `echidna` without constant permission prompts.

## Setup

### Prerequisites
- **Bun** (recommended for speed) or Node.js.
- **Install Bun (WSL/Linux):**
  ```bash
  curl -fsSL https://bun.sh/install | bash
  source ~/.bashrc
  ```
- Local **Ollama** instance running.

### Installation
1. **Dependencies**: Install the core packages.
   ```bash
   bun install
   ```
2. **Build**: Compile the TypeScript source into the `chuck-ai` binary.
   ```bash
   bun run build
   ```
3. **Configuration**: Set your target Ollama model.
   ```bash
   export CHUCK_CODE_OLLAMA_MODEL='llama3'
   ```

### Local Inference (No-Auth)
Chuck is configured to use your local **Ollama** instance at `http://localhost:11434`. No external API keys or accounts are required. 

**WSL Users**: If Ollama is running on your Windows host, set the host IP:
```bash
export OLLAMA_HOST=http://$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}'):11434
```

## Usage & Workflows

### 1. Web Application & API Pentesting (CHUCK Mode)
Chuck can map attack surfaces and automatically execute testing sequences.
> "./chuck-ai Scan the API on port 8080. Identify all endpoints and test for Broken Object Level Authorization (BOLA) and JWT misconfigurations."

### 2. GitHub Repository Source Code Review
Perform deep-dive static analysis on a local clone of a target repository.
> "./chuck-ai Perform a security review of the auth middleware. Look for timing attacks, unsafe usage of eval(), and unsanitized user input in database queries."

### 3. Smart Contract Auditing
Audit complex blockchain logic for common DeFi attack vectors.
> "./chuck-ai Analyze the contracts in /contracts. Check for reentrancy vectors and logic flaws in the staking mechanism. Cross-reference findings with known vulnerabilities in the OpenZeppelin library versions used here."

## Dynamic Memory System

Chuck doesn't use static fine-tuning. It "trains" through a **Dynamic Memory System** located in `.chuck/memory/`.

- **Adversarial Feedback**: When you correct Chuck or verify a new exploit technique, provide feedback in the chat. Chuck saves this to a `.md` file to ensure it doesn't repeat previous oversights.
- **Knowledge Injection**: Manually add markdown files to `.chuck/memory/` containing proprietary security checklists, custom payloads, or internal project documentation.
- **Persistent Index**: The `MEMORY.md` file serves as a root index that Chuck reads at the start of every session to maintain context of previously identified bugs.

## Security Warning
**Chuck is intended for authorized use only.** This refactor deliberately loosens safety guardrails to allow for professional security research. Chuck can execute potentially destructive shell commands. **Always run Chuck in an isolated environment (VM or Container)** when performing active exploitation or scanning.