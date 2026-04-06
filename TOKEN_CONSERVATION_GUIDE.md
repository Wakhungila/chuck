# 💰 Token Conservation & Local Fallback Guide

## Overview
This guide explains how to run Chuck Elite with **80% less token usage** on Anthropic, and how to **completely switch to local Ollama** when billing is depleted.

---

## 🎯 Intelligent Token Cheats (Save 60-80%)

### Cheat #1: Deterministic Tool Routing
**Problem:** LLM wastes tokens deciding obvious next steps.  
**Solution:** Pre-process routine decisions locally.

```typescript
// Before: Ask LLM "What should I do after finding port 80?"
// After: Auto-trigger httpx without LLM involvement
if (scanResults.ports.find(p => p.port === 80)) {
  queueTool("httpx", { target: host }); // Zero tokens used!
}
```

**Savings:** ~30% of routine calls bypass LLM entirely.

---

### Cheat #2: Aggressive Output Compression
**Problem:** Raw nmap/nuclei output = thousands of tokens.  
**Solution:** Parse and compress to JSON summaries.

```typescript
// Before: Send 50KB raw nmap output (~12,000 tokens)
// After: Send compressed summary (~200 tokens)
{
  "type": "nmap_summary",
  "count": 3,
  "data": [
    {"port": "80", "service": "http", "version": "nginx 1.18"},
    {"port": "443", "service": "https", "version": "nginx 1.18"},
    {"port": "22", "service": "ssh", "version": "OpenSSH 8.2"}
  ]
}
```

**Savings:** 95% reduction on tool output tokens.

---

### Cheat #3: Sliding Window Memory
**Problem:** Full history in context = exponential token growth.  
**Solution:** Keep only last 5 steps + summarized past.

```typescript
// Before: [Step1, Step2, Step3... Step50] in every request
// After: [Summary of Steps 1-45, Step46, Step47, Step48, Step49, Step50]
{
  "role": "user",
  "content": "[SUMMARY]: Previous 45 steps completed. Focus on current state."
}
```

**Savings:** Context stays constant (~2K tokens) regardless of operation length.

---

### Cheat #4: JSON-Only Mode
**Problem:** Verbose explanations waste tokens.  
**Solution:** Force structured JSON output.

```typescript
// Prompt injection:
"Output STRICT JSON only. No markdown, no explanations.
Schema: { \"action\": \"...\", \"reasoning\": \"<10 words>\", \"next_tool\": \"...\" }"
```

**Savings:** 50% reduction on output tokens.

---

## 🖥️ Local Ollama Fallback (Zero Cost)

### Hardware Requirements
| RAM | Recommended Model | Context | Speed |
|-----|------------------|---------|-------|
| 4GB | `phi3:mini` | 2048 | ⚡⚡⚡ |
| 8GB | `llama3.2:3b` | 4096 | ⚡⚡ |
| 16GB+ | `mistral:7b` | 8192 | ⚡ |

### Installation (AMD Ryzen 5, 8GB RAM)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull recommended model for 8GB RAM
ollama pull llama3.2:3b

# 3. Verify installation
ollama run llama3.2:3b "Hello, Chuck!"
```

### Automatic Fallback Behavior

Chuck Elite automatically switches modes:

```typescript
// Normal mode: Complex tasks → Anthropic, Simple tasks → Ollama
hybridRouter.generate(systemPrompt, messages, "recon");

// When billing depleted: Everything → Ollama
hybridRouter.setBillingDepleted(true);
// Console: "🚨 ANTHROPIC BILLING DEPLETED - Switching to LOCAL MODE"
```

---

## 📊 Capability Comparison

| Feature | Anthropic Claude | Ollama (llama3.2:3b) |
|---------|-----------------|----------------------|
| **Reconnaissance** | ✅ Excellent | ✅ Good |
| **Tool Selection** | ✅ Autonomous | ⚠️ Needs structured prompts |
| **Vulnerability Analysis** | ✅ Deep reasoning | ⚠️ Surface-level |
| **Exploit Chain Synthesis** | ✅ Advanced | ❌ Limited |
| **PoC Generation** | ✅ Creative | ⚠️ Template-based |
| **Cost per Operation** | $0.05-0.50 | $0.00 |
| **Speed** | ~2-5s | ~10-30s (local) |
| **Privacy** | Cloud | 100% Local |

---

## 🔧 Configuration

### Enable Maximum Savings

```typescript
import { TokenOptimizer } from './core/TokenOptimizer';
import { HybridModelRouter } from './core/HybridModelRouter';

const optimizer = new TokenOptimizer({
  maxContextItems: 5,
  enableSummaryCompression: true,
  forceJsonMode: true,
  localPreProcessing: true, // Critical for compression
});

const router = new HybridModelRouter({
  fallbackToOllama: true,
  complexTaskThreshold: 2000, // Tokens above this use cloud
  billingDepleted: false, // Set true when API fails
});
```

### Monitor Savings

```typescript
const report = optimizer.getEfficiencyReport(10000, 2500);
console.log(report);
// Output:
// {
//   original: 10000,
//   optimized: 2500,
//   saved: 7500,
//   percentReduced: "75.00%",
//   estimatedCostSavingUSD: 0.0225
// }
```

---

## 🚀 Best Practices

### For 8GB Laptops:
1. **Use `llama3.2:3b`** - Best balance of speed/capability
2. **Close other apps** - Free up RAM for model
3. **Limit context to 4K** - Prevent swapping
4. **Batch simple tasks** - Reduce model loads

### When Billing Depleted:
1. **Enable hybrid mode immediately**
2. **Accept reduced autonomy** - More manual guidance needed
3. **Use for recon/scanning** - Avoid complex exploit chaining
4. **Validate findings manually** - Smaller models may hallucinate

### Cost Optimization:
1. **Run recon locally** - Port scans don't need Claude
2. **Use cloud for analysis** - Deep reasoning worth the cost
3. **Compress everything** - Never send raw tool output
4. **Set daily budget alerts** - Prevent surprise bills

---

## 📈 Expected Results

| Scenario | Tokens/Day | Cost/Day (Anthropic) | With Optimizations |
|----------|-----------|---------------------|-------------------|
| Light Recon | 50K | $0.15 | $0.04 (73% savings) |
| Full Pentest | 500K | $1.50 | $0.38 (75% savings) |
| Continuous Ops | 2M | $6.00 | $1.50 (75% savings) |
| **Local Mode** | Unlimited | **$0.00** | **$0.00** |

---

## ⚠️ Limitations of Local Mode

When running on Ollama with 8GB RAM:

- ❌ No autonomous attack chain synthesis
- ❌ Limited creative PoC generation
- ❌ May miss subtle vulnerability correlations
- ⚠️ Requires more explicit instructions
- ⚠️ Slower response times (10-30s vs 2-5s)

**Mitigation:** Use hybrid approach - local for routine, cloud for critical analysis.

---

## 🛠️ Troubleshooting

### Ollama Not Detected
```bash
# Check if service is running
systemctl status ollama

# Start manually
ollama serve

# Test connection
curl http://localhost:11434/api/tags
```

### Model Too Slow
```bash
# Stop other memory-intensive apps
# Reduce context window in config
# Switch to smaller model: ollama pull phi3:mini
```

### High Token Usage Despite Optimizations
```typescript
// Ensure localPreProcessing is enabled
const optimizer = new TokenOptimizer({
  localPreProcessing: true, // Must be true!
});

// Check compression is working
const compressed = optimizer.compressToolOutput("nmap", rawOutput);
console.log(`Reduced from ${rawOutput.length} to ${compressed.length} chars`);
```

---

## 📚 Additional Resources

- [Ollama Model Library](https://ollama.com/library)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [Llama 3.2 Benchmarks](https://huggingface.co/meta-llama/Llama-3.2-3B)
- [Token Estimator Tool](https://tiktokenizer.vercel.app/)

---

**Bottom Line:** With these optimizations, you can run Chuck Elite continuously on a budget laptop for **free**, or reduce Anthropic costs by **75%** while maintaining elite capabilities for complex tasks.
