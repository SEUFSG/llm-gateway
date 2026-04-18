import type { LLMProvider } from "./base";
import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const COPILOT_MODELS: Omit<ModelInfo, "provider" | "fullId">[] = [
  { id: "claude-opus-4.7",        name: "Claude Opus 4.7",        contextWindow: 200000, maxOutput: 64000,  tags: ["code_generation","code_review","reasoning","creative"], description: "Anthropic Claude Opus 4.7 — most powerful" },
  { id: "claude-opus-4.6",        name: "Claude Opus 4.6",        contextWindow: 200000, maxOutput: 64000,  tags: ["code_generation","code_review","reasoning","creative"], description: "Anthropic Claude Opus 4.6" },
  { id: "claude-sonnet-4.6",      name: "Claude Sonnet 4.6",      contextWindow: 200000, maxOutput: 32000,  tags: ["code_generation","code_review","reasoning","creative"], description: "Anthropic Claude Sonnet 4.6" },
  { id: "claude-sonnet-4.5",      name: "Claude Sonnet 4.5",      contextWindow: 200000, maxOutput: 32000,  tags: ["code_generation","code_review","reasoning","creative"], description: "Anthropic Claude Sonnet 4.5" },
  { id: "claude-sonnet-4",        name: "Claude Sonnet 4",        contextWindow: 216000, maxOutput: 16000,  tags: ["code_generation","code_review","reasoning","creative"], description: "Anthropic Claude Sonnet 4" },
  { id: "claude-opus-4.5",        name: "Claude Opus 4.5",        contextWindow: 200000, maxOutput: 32000,  tags: ["code_generation","code_review","reasoning"],           description: "Anthropic Claude Opus 4.5" },
  { id: "claude-haiku-4.5",       name: "Claude Haiku 4.5",       contextWindow: 200000, maxOutput: 32000,  tags: ["quick_qa","code_generation"],                          description: "Anthropic Claude Haiku 4.5 — fast" },
  { id: "gpt-5.4",                name: "GPT-5.4",                contextWindow: 400000, maxOutput: 128000, tags: ["code_generation","reasoning","math"],                   description: "OpenAI GPT-5.4" },
  { id: "gpt-5.4-mini",           name: "GPT-5.4 mini",           contextWindow: 400000, maxOutput: 128000, tags: ["quick_qa","code_generation"],                          description: "OpenAI GPT-5.4 mini — fast" },
  { id: "gpt-5.3-codex",          name: "GPT-5.3-Codex",          contextWindow: 400000, maxOutput: 128000, tags: ["code_generation","reasoning"],                         description: "OpenAI GPT-5.3 Codex" },
  { id: "gpt-5.2",                name: "GPT-5.2",                contextWindow: 264000, maxOutput: 64000,  tags: ["code_generation","reasoning"],                         description: "OpenAI GPT-5.2" },
  { id: "gpt-5-mini",             name: "GPT-5 mini",             contextWindow: 264000, maxOutput: 64000,  tags: ["quick_qa","code_generation"],                          description: "GPT-5 mini" },
  { id: "gpt-4.1",                name: "GPT-4.1",                contextWindow: 128000, maxOutput: 16384,  tags: ["code_generation","reasoning","quick_qa"],               description: "OpenAI GPT-4.1" },
  { id: "gpt-4o",                 name: "GPT-4o",                 contextWindow: 128000, maxOutput: 4096,   tags: ["code_generation","reasoning","quick_qa","creative"],    description: "OpenAI GPT-4o" },
  { id: "gpt-4o-mini",            name: "GPT-4o mini",            contextWindow: 128000, maxOutput: 4096,   tags: ["quick_qa"],                                            description: "OpenAI GPT-4o mini — fast" },
  { id: "gemini-2.5-pro",         name: "Gemini 2.5 Pro",         contextWindow: 128000, maxOutput: 64000,  tags: ["code_generation","reasoning","long_context"],           description: "Google Gemini 2.5 Pro" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro",         contextWindow: 128000, maxOutput: 64000,  tags: ["code_generation","reasoning"],                         description: "Google Gemini 3.1 Pro (Preview)" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash",         contextWindow: 128000, maxOutput: 64000,  tags: ["quick_qa","code_generation"],                          description: "Google Gemini 3 Flash (Preview)" },
  { id: "minimax-m2.5",           name: "MiniMax M2.5 (Fast)",    contextWindow: 131000, maxOutput: 40000,  tags: ["chinese_writing","quick_qa"],                          description: "MiniMax M2.5 via Copilot" },
  { id: "grok-code-fast-1",       name: "Grok Code Fast 1",       contextWindow: 128000, maxOutput: 64000,  tags: ["code_generation"],                                     description: "xAI Grok Code Fast 1" },
];

export class CopilotProvider implements LLMProvider {
  readonly name = "copilot";
  readonly displayName = "GitHub Copilot";
  readonly authType = "oauth_device" as const;

  private readonly COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98";
  private readonly DEVICE_CODE_URL = "https://github.com/login/device/code";
  private readonly ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
  private readonly SESSION_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
  private readonly CHAT_URL = "https://api.githubcopilot.com/chat/completions";
  private readonly MODELS_URL = "https://api.githubcopilot.com/models";

  private modelCache: { models: ModelInfo[]; ts: number } | null = null;

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    const creds = this.store.load();
    if (!creds.copilot?.sessionToken) return false;
    const expiry = new Date(creds.copilot.sessionExpiresAt);
    return expiry > new Date();
  }

  listModels(): ModelInfo[] {
    if (this.modelCache) return this.modelCache.models;
    return COPILOT_MODELS.map(m => ({ ...m, provider: "copilot", fullId: `copilot/${m.id}` }));
  }

  async fetchModels(): Promise<ModelInfo[]> {
    if (this.modelCache && Date.now() - this.modelCache.ts < 5 * 60 * 1000) return this.modelCache.models;
    const creds = this.store.load();
    if (!creds.copilot?.sessionToken) return this.listModels();
    try {
      const resp = await fetch(this.MODELS_URL, {
        headers: {
          "Authorization": `Bearer ${creds.copilot.sessionToken}`,
          "Editor-Version": "vscode/1.85.0",
          "Copilot-Integration-Id": "vscode-chat"
        }
      });
      if (!resp.ok) return this.listModels();
      const d = await resp.json() as { data: any[] };
      const models = (d.data ?? [])
        .filter((m: any) =>
          m.capabilities?.type === "chat" &&
          m.model_picker_enabled !== false &&
          !m.id.startsWith("accounts/") &&
          !m.id.includes("embedding") &&
          !m.id.includes("oswe") &&
          !m.id.includes("search") &&
          !m.id.includes("router")
        )
        .map((m: any): ModelInfo => {
          const lim = m.capabilities?.limits ?? {};
          return {
            id: m.id, provider: "copilot", fullId: `copilot/${m.id}`,
            name: m.name ?? m.id,
            contextWindow: lim.max_context_window_tokens ?? 128000,
            maxOutput: lim.max_output_tokens ?? 4096,
            tags: this.inferTags(m),
            description: `${m.vendor ? m.vendor + " " : ""}${m.name ?? m.id}`
          };
        });
      this.modelCache = { models, ts: Date.now() };
      return models;
    } catch {
      return this.listModels();
    }
  }

  private inferTags(m: any): string[] {
    const id = m.id.toLowerCase();
    const tags: string[] = [];
    if (id.includes("opus") || id.includes("5.4") || id.includes("pro") || id.includes("codex")) tags.push("code_review", "reasoning");
    if (id.includes("claude") || id.includes("gpt") || id.includes("gemini") || id.includes("grok")) tags.push("code_generation");
    if (id.includes("mini") || id.includes("flash") || id.includes("haiku") || id.includes("fast")) tags.push("quick_qa");
    if (id.includes("minimax") || id.includes("glm") || id.includes("kimi")) tags.push("chinese_writing");
    if ((m.capabilities?.limits?.max_context_window_tokens ?? 0) >= 200000) tags.push("long_context");
    if (m.capabilities?.supports?.reasoning_effort) tags.push("math");
    return [...new Set(tags)];
  }

  async login(): Promise<AuthResult> {
    const deviceResp = await fetch(this.DEVICE_CODE_URL, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.COPILOT_CLIENT_ID, scope: "read:user" })
    });

    if (!deviceResp.ok) {
      return { success: false, message: `Failed to initiate device flow: ${deviceResp.status}` };
    }

    const deviceData = await deviceResp.json() as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };

    process.stderr.write(
      `\nPlease visit ${deviceData.verification_uri} and enter code: ${deviceData.user_code}\nWaiting for authorization...\n`
    );

    const oauthToken = await this.pollForToken(deviceData.device_code, deviceData.interval, deviceData.expires_in);
    if (!oauthToken) {
      return { success: false, message: "Authorization timed out or was denied" };
    }

    const sessionToken = await this.fetchSessionToken(oauthToken);
    if (!sessionToken) {
      return { success: false, message: "Failed to obtain Copilot session token" };
    }

    const expiresAt = new Date(sessionToken.expires_at * 1000).toISOString();
    this.store.update("copilot", {
      oauthToken,
      sessionToken: sessionToken.token,
      sessionExpiresAt: expiresAt
    });

    return { success: true, message: "Successfully authenticated with GitHub Copilot", expiresAt };
  }

  async refreshAuth(): Promise<void> {
    const creds = this.store.load();
    if (!creds.copilot?.oauthToken) throw new Error("No OAuth token stored. Please login again.");
    const sessionToken = await this.fetchSessionToken(creds.copilot.oauthToken);
    if (!sessionToken) throw new Error("Failed to refresh Copilot session token");
    this.store.update("copilot", {
      ...creds.copilot,
      sessionToken: sessionToken.token,
      sessionExpiresAt: new Date(sessionToken.expires_at * 1000).toISOString()
    });
  }

  logout(): void {
    this.store.clear("copilot");
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isAuthenticated()) {
      try { await this.refreshAuth(); } catch {
        throw new Error("Copilot not authenticated. Run llm_login first.");
      }
    }

    const creds = this.store.load();
    const sessionToken = creds.copilot!.sessionToken;

    const resp = await fetch(this.CHAT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
        "Editor-Version": "vscode/1.85.0",
        "Copilot-Integration-Id": "vscode-chat"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096
      })
    });

    if (!resp.ok) throw new Error(`Copilot API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message.content ?? "",
      model: data.model ?? request.model,
      provider: "copilot",
      finishReason: (data.choices[0]?.finish_reason ?? "stop") as "stop" | "length" | "error",
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }

  private async pollForToken(deviceCode: string, interval: number, expiresIn: number): Promise<string | null> {
    const deadline = Date.now() + expiresIn * 1000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, interval * 1000));
      const resp = await fetch(this.ACCESS_TOKEN_URL, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.COPILOT_CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })
      });
      const data = await resp.json() as { access_token?: string; error?: string };
      if (data.access_token) return data.access_token;
      if (data.error && data.error !== "authorization_pending") return null;
    }
    return null;
  }

  private async fetchSessionToken(oauthToken: string): Promise<{ token: string; expires_at: number } | null> {
    const resp = await fetch(this.SESSION_TOKEN_URL, {
      headers: { "Authorization": `token ${oauthToken}`, "Accept": "application/json" }
    });
    if (!resp.ok) return null;
    return resp.json() as Promise<{ token: string; expires_at: number }>;
  }
}
