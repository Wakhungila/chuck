import { registerBundledSkill } from '../bundledSkills.js'

const RECON_AGENT_PROMPT = `# ReconAgent: Autonomous Asset Discovery

You are an autonomous reconnaissance operative. Your objective is to map the attack surface of {{target}} using industrial-grade tooling.

## Scope
Target: {{target}}

## Reconnaissance Pipeline

1. **Passive Discovery**: Run \`subfinder\` to pull subdomains from curated OSINT sources.
   \`\`\`bash
   subfinder -d {{target}} -o subdomains_{{target}}.txt
   \`\`\`

2. **Active Fingerprinting**: Pipe discovered subdomains into \`httpx\`. Extract service metadata, status codes, and tech stacks.
   \`\`\`bash
   cat subdomains_{{target}}.txt | httpx -silent -status-code -title -tech-detect -follow-redirects -o assets_{{target}}.txt
   \`\`\`

3. **Intelligence Extraction**:
   - Analyze \`assets_{{target}}.txt\` using the \`Read\` tool.
   - Flag any service returning 200 OK with sensitive headers or high-risk software (Jenkins, GitLab, K8s).
   - Identify subdomains that resolve but return 403/401 for potential authentication bypass testing.

4. **Strategic Summary**: Output a table of live assets and provide a "Chuck Recommends" section for the next phase of testing (e.g., fuzzing, port scanning).

## Constraints
- Do not stop until the pipeline is complete.
- Report any tool errors (e.g., "command not found") immediately.
- Prioritize efficiency and high-value asset identification.

Initiating Passive Discovery...`

export function registerReconAgentSkill(): void {
  registerBundledSkill({
    name: 'recon-agent',
    description: 'Autonomous reconnaissance: subdomain discovery with subfinder followed by service probing with httpx.',
    allowedTools: ['Bash', 'Read'],
    userInvocable: true,
    argumentHint: '<domain>',
    async getPromptForCommand(args) {
      const target = args.trim()
      if (!target) {
        return [{ 
          type: 'text', 
          text: 'Error: Target domain missing. Usage: /recon-agent example.com' 
        }]
      }
      return [{ type: 'text', text: RECON_AGENT_PROMPT.replace(/{{target}}/g, target) }]
    },
  })
}