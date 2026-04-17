import type { LLMProvider } from "./base";
import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const COPILOT_MODELS: Omit<ModelInfo, "provider" | "fullId">[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    contextWindow: 128000,
    maxOutput: 16384,
    tags: ["code_generation", "reasoning", "quick_qa", "creative"],
    description: "Strong all-around model, excellent at code and reasoning"
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    contextWindow: 128000,
    maxOutput: 16384,
    tags: ["quick_qa"],
    description: "Fast and cost-effective, best for simple queries"
  },
  {
    id: "o1",
    name: "o1",
    contextWindow: 200000,
    maxOutput: 100000,
    tags: ["reasoning", "math"],
    description: "Deep reasoning model for complex problems"
  },
  {
    id: "o1-mini",
    name: "o1 Mini",
    contextWindow: 128000,
    maxOutput: 65536,
    tags: ["reasoning", "math"],
    description: "Faster reasoning model, good balance of speed and depth"
  },
  {
    id: "o3-mini",
    name: "o3 Mini",
    contextWindow: 200000,
    maxOutput: 100000,
    tags: ["reasoning", "math", "code_generation"],
    description: "Latest reasoning model, strong at math and code"
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    maxOutput: 8096,
    tags: ["code_generation", "code_review", "reasoning", "creative"],
    description: "Anthropic Claude 3.5 Sonnet, excellent code and nuanced reasoning"
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    contextWindow: 200000,
    maxOutput: 16000,
    tags: ["code_generation", "code_review", "reasoning", "creative"],
    description: "Anthropic Claude Sonnet 4, latest Claude model via Copilot"
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    contextWindow: 1000000,
    maxOutput: 8192,
    tags: ["quick_qa", "long_context"],
    description: "Google Gemini 2.0 Flash, very large context window"
  }
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

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    const creds = this.store.load();
    if (!creds.copilot?.sessionToken) return false;
    const expiry = new Date(creds.copilot.sessionExpiresAt);
    return expiry > new Date();
  }

  listModels(): ModelInfo[] {
    return COPILOT_MODELS.map(m => ({
      ...m,
      provider: "copilot",
      fullId: `copilot/${m.id}`
    }));
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
