import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { TokenStore } from "./token-store";
import { ProviderRegistry } from "./registry";
import { Router } from "./router";
import { readFileSync } from "fs";
import { join } from "path";
import type { RoutingConfig } from "./types";

function loadRoutingConfig(): RoutingConfig {
  const defaultRouting: RoutingConfig = {
    code_generation:  ["copilot/gpt-4o", "copilot/claude-sonnet-4", "glm/glm-4"],
    code_review:      ["copilot/claude-sonnet-4", "copilot/gpt-4o"],
    reasoning:        ["copilot/o3-mini", "copilot/gpt-4o"],
    chinese_writing:  ["kimi/moonshot-v1-128k", "glm/glm-4", "minimax/abab6.5-chat"],
    translation:      ["kimi/moonshot-v1-128k", "copilot/gpt-4o"],
    quick_qa:         ["copilot/gpt-4o-mini", "minimax/abab6.5-chat"],
    math:             ["copilot/o3-mini", "copilot/gpt-4o"],
    creative:         ["copilot/gpt-4o", "kimi/moonshot-v1-128k"],
    long_context:     ["kimi/moonshot-v1-128k", "copilot/claude-sonnet-4"]
  };

  try {
    const settingsPath = join(process.cwd(), ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
      "llm-gateway"?: { routing?: RoutingConfig }
    };
    const custom = settings["llm-gateway"]?.routing ?? {};
    return { ...defaultRouting, ...custom };
  } catch {
    return defaultRouting;
  }
}

export function buildServer(store: TokenStore) {
  const registry = new ProviderRegistry(store);
  const router = new Router(registry, loadRoutingConfig());

  const tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    async llm_status() {
      return {
        providers: registry.allProviders().map(p => ({
          name: p.name,
          displayName: p.displayName,
          authenticated: p.isAuthenticated(),
          modelCount: p.isAuthenticated() ? p.listModels().length : 0
        }))
      };
    },

    async llm_models(args) {
      const filterProvider = args.provider as string | undefined;
      let providers = registry.authenticatedProviders();
      if (filterProvider) {
        providers = providers.filter(p => p.name === filterProvider);
      }
      return {
        providers: providers.map(p => ({
          name: p.name,
          displayName: p.displayName,
          authenticated: true,
          models: p.listModels()
        }))
      };
    },

    async llm_login(args) {
      const providerName = args.provider as string;
      const apiKey = args.apiKey as string | undefined;
      const provider = registry.getProvider(providerName);
      if (!provider) throw new Error(`Unknown provider: ${providerName}`);

      if (provider.authType === "oauth_device") {
        return provider.login();
      } else {
        if (!apiKey) throw new Error(`apiKey is required for ${providerName}`);
        return (provider as { login: (key: string) => Promise<unknown> }).login(apiKey);
      }
    },

    async llm_logout(args) {
      const providerName = args.provider as string;
      const provider = registry.getProvider(providerName);
      if (!provider) throw new Error(`Unknown provider: ${providerName}`);
      provider.logout();
      return { success: true, message: `Logged out from ${providerName}` };
    },

    async llm_chat(args) {
      const mode = args.mode as "manual" | "auto";
      const messages = args.messages as Array<{ role: string; content: string }>;
      const temperature = args.temperature as number | undefined;
      const maxTokens = args.maxTokens as number | undefined;

      if (mode === "manual") {
        const providerName = args.provider as string;
        const modelId = args.model as string;
        if (!providerName || !modelId) {
          throw new Error("Manual mode requires provider and model");
        }
        const provider = registry.getProvider(providerName);
        if (!provider) throw new Error(`Unknown provider: ${providerName}`);
        if (!provider.isAuthenticated()) {
          throw new Error(`Provider ${providerName} not authenticated. Run llm_login first.`);
        }
        return provider.chat({
          model: modelId,
          messages: messages as Array<{ role: "user" | "assistant" | "system"; content: string }>,
          temperature,
          maxTokens
        });
      }

      // Auto mode
      const task = args.task as string;
      if (!task) throw new Error("Auto mode requires task label");

      const { model, tried, reason } = router.resolveWithDetails(task);
      if (!model) {
        throw new Error(
          `All models in fallback chain for task "${task}" failed. Tried: ${tried.join(", ")}. Reasons: ${reason}`
        );
      }

      const provider = registry.getProvider(model.provider);
      if (!provider) throw new Error(`Provider ${model.provider} not found`);

      return provider.chat({
        model: model.id,
        messages: messages as Array<{ role: "user" | "assistant" | "system"; content: string }>,
        temperature,
        maxTokens
      });
    }
  };

  return {
    callTool: async (name: string, args: Record<string, unknown>) => {
      const handler = tools[name];
      if (!handler) throw new Error(`Unknown tool: ${name}`);
      return handler(args) as Promise<Record<string, unknown>>;
    }
  };
}

// MCP Server entry point (only when run directly)
if (import.meta.main) {
  const store = new TokenStore();
  const registry = new ProviderRegistry(store);
  const router = new Router(registry, loadRoutingConfig());

  const server = new Server(
    { name: "llm-gateway", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "llm_login",
        description: "Login to an LLM provider. For Copilot: initiates OAuth Device Flow. For others: stores API key.",
        inputSchema: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["copilot", "kimi", "minimax", "glm"] },
            apiKey: { type: "string", description: "Required for kimi, minimax, glm" }
          },
          required: ["provider"]
        }
      },
      {
        name: "llm_logout",
        description: "Logout from an LLM provider and remove stored credentials.",
        inputSchema: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["copilot", "kimi", "minimax", "glm"] }
          },
          required: ["provider"]
        }
      },
      {
        name: "llm_status",
        description: "Show authentication status for all LLM providers.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "llm_models",
        description: "List all available models across authenticated providers with capabilities and tags.",
        inputSchema: {
          type: "object",
          properties: {
            provider: { type: "string", description: "Filter to specific provider (optional)" }
          }
        }
      },
      {
        name: "llm_chat",
        description: "Send a chat message. Manual mode: specify provider+model. Auto mode: specify task label, router selects best available model with fallback.",
        inputSchema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["manual", "auto"] },
            provider: { type: "string", description: "Required in manual mode" },
            model: { type: "string", description: "Required in manual mode" },
            task: { type: "string", description: "Task label for auto mode (e.g. code_generation, reasoning, chinese_writing)" },
            messages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["system", "user", "assistant"] },
                  content: { type: "string" }
                },
                required: ["role", "content"]
              }
            },
            temperature: { type: "number" },
            maxTokens: { type: "number" }
          },
          required: ["mode", "messages"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = buildServer(store);
    try {
      const result = await handler.callTool(name, args as Record<string, unknown>);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
