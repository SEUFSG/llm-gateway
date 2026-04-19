#!/usr/bin/env bun
/**
 * llm-auth — standalone CLI for managing LLM provider credentials
 * Usage: llm-auth <command> [provider] [--key <apiKey>]
 */
import { TokenStore } from "./token-store";
import { ProviderRegistry } from "./registry";

const store = new TokenStore();
const registry = new ProviderRegistry(store);

const PROVIDERS = ["copilot", "kimi", "minimax", "glm", "qwen"] as const;
const API_KEY_PROVIDERS = ["kimi", "minimax", "glm", "qwen"] as const;

function statusRow(name: string, auth: boolean, models: number) {
  const icon = auth ? "✅" : "❌";
  const info = auth ? `${models} models` : "not authenticated";
  return `  ${icon}  ${name.padEnd(10)} ${info}`;
}

async function cmdStatus() {
  console.log("\nLLM Gateway — Provider Status\n");
  for (const name of PROVIDERS) {
    const p = registry.getProvider(name)!;
    console.log(statusRow(name, p.isAuthenticated(), p.listModels().length));
  }
  console.log();
}

async function cmdModels() {
  const providers = registry.authenticatedProviders();
  if (providers.length === 0) {
    console.error("No providers authenticated. Run: llm-auth setup");
    process.exit(1);
  }
  console.log("\nAvailable models (use with: claude --model <id>)\n");
  const seen = new Set<string>();
  for (const p of providers) {
    console.log(`  [${p.displayName}]`);
    for (const m of p.listModels()) {
      // Always use provider/model-id format to avoid conflicts
      const id = m.fullId; // e.g. "copilot/gpt-4o"
      if (!seen.has(id)) {
        seen.add(id);
        console.log(`    ${id.padEnd(45)} ${m.name}`);
      }
    }
  }
  console.log();
}

async function loginCopilot() {
  const p = registry.getProvider("copilot")!;
  console.log("\nLogging in to GitHub Copilot...");
  const result = await p.login();
  if (result.success) {
    console.log("✅ GitHub Copilot authenticated");
    if (result.expiresAt) console.log(`   Token expires: ${result.expiresAt}`);
  } else {
    console.error(`❌ Failed: ${result.message}`);
    process.exit(1);
  }
}

async function loginApiKey(providerName: string, apiKey?: string) {
  const p = registry.getProvider(providerName)!;
  if (!apiKey) {
    process.stdout.write(`Enter ${p.displayName} API key: `);
    apiKey = "";
    const buf = Buffer.alloc(1024);
    while (true) {
      const n = require("fs").readSync(0, buf, 0, 1, null);
      if (n === 0) break;
      const ch = buf.toString("utf8", 0, n);
      if (ch === "\n") break;
      apiKey += ch;
    }
    apiKey = apiKey.trim();
  }
  if (!apiKey) {
    console.error("No API key provided.");
    process.exit(1);
  }
  const result = await (p as any).login(apiKey);
  if (result.success) {
    console.log(`✅ ${p.displayName} authenticated`);
  } else {
    console.error(`❌ Failed: ${result.message}`);
    process.exit(1);
  }
}

async function cmdLogin(providerName: string, apiKey?: string) {
  if (!PROVIDERS.includes(providerName as any)) {
    console.error(`Unknown provider: ${providerName}. Valid: ${PROVIDERS.join(", ")}`);
    process.exit(1);
  }
  if (providerName === "copilot") {
    await loginCopilot();
  } else {
    await loginApiKey(providerName, apiKey);
  }
}

async function cmdLogout(providerName: string) {
  if (!PROVIDERS.includes(providerName as any)) {
    console.error(`Unknown provider: ${providerName}`);
    process.exit(1);
  }
  registry.getProvider(providerName)!.logout();
  console.log(`✅ Logged out from ${providerName}`);
}

async function cmdSetup() {
  console.log("\n=== llm-auth setup — authenticate LLM providers ===\n");
  console.log("Press Enter to skip a provider.\n");

  // Copilot
  const copilot = registry.getProvider("copilot")!;
  if (copilot.isAuthenticated()) {
    console.log("✅ GitHub Copilot already authenticated, skipping.");
  } else {
    process.stdout.write("Authenticate GitHub Copilot? (OAuth device flow) [y/N]: ");
    const ans = prompt("");
    if (ans?.toLowerCase() === "y") {
      await loginCopilot();
    }
  }

  // API key providers
  for (const name of API_KEY_PROVIDERS) {
    const p = registry.getProvider(name)!;
    if (p.isAuthenticated()) {
      console.log(`✅ ${p.displayName} already authenticated, skipping.`);
      continue;
    }
    process.stdout.write(`\n${p.displayName} API key (Enter to skip): `);
    const key = prompt("");
    if (key && key.trim()) {
      await loginApiKey(name, key.trim());
    } else {
      console.log(`  Skipped ${p.displayName}`);
    }
  }

  console.log("\n=== Setup complete ===");
  await cmdStatus();
  console.log("Start Claude Code with a specific model:");
  console.log("  claude --model copilot/gpt-4o");
  console.log("  claude --model copilot/claude-sonnet-4.6");
  console.log("\nOr run: llm-auth models   (to see all available models)");
}

// --- Main ---
const [,, cmd, arg1, flag, arg2] = process.argv;
const apiKey = flag === "--key" ? arg2 : undefined;

switch (cmd) {
  case "status":
    await cmdStatus();
    break;
  case "models":
    await cmdModels();
    break;
  case "login":
    if (!arg1) { console.error("Usage: llm-auth login <provider> [--key <apiKey>]"); process.exit(1); }
    await cmdLogin(arg1, apiKey);
    break;
  case "logout":
    if (!arg1) { console.error("Usage: llm-auth logout <provider>"); process.exit(1); }
    await cmdLogout(arg1);
    break;
  case "setup":
    await cmdSetup();
    break;
  default:
    console.log(`llm-auth — LLM provider credential manager

Commands:
  llm-auth setup                    Interactive setup for all providers
  llm-auth status                   Show authentication status
  llm-auth models                   List all available models
  llm-auth login <provider>         Login to a provider
  llm-auth login <provider> --key <apiKey>
  llm-auth logout <provider>        Logout from a provider

Providers: ${PROVIDERS.join(", ")}

Examples:
  llm-auth setup
  llm-auth login copilot
  llm-auth login kimi --key sk-xxx
  llm-auth models
  claude --model copilot/gpt-4o
  claude --model copilot/claude-sonnet-4.6
`);
}
