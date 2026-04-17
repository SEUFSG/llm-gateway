import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const GLM_MODELS: Omit<ModelInfo, "provider" | "fullId">[] = [
  {
    id: "glm-4",
    name: "GLM-4",
    contextWindow: 128000,
    maxOutput: 8192,
    tags: ["code_generation", "chinese_writing", "reasoning"],
    description: "Zhipu GLM-4 flagship, strong Chinese and code"
  },
  {
    id: "glm-4-flash",
    name: "GLM-4 Flash",
    contextWindow: 128000,
    maxOutput: 8192,
    tags: ["quick_qa", "chinese_writing"],
    description: "Zhipu GLM-4 Flash, fast and free tier available"
  },
  {
    id: "glm-3-turbo",
    name: "GLM-3 Turbo",
    contextWindow: 128000,
    maxOutput: 8192,
    tags: ["quick_qa", "chinese_writing"],
    description: "Zhipu GLM-3 Turbo, cost-effective Chinese model"
  }
];

export class GlmProvider {
  readonly name = "glm";
  readonly displayName = "Zhipu GLM";
  readonly authType = "api_key" as const;

  private readonly API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    const creds = this.store.load();
    return !!creds.glm?.apiKey;
  }

  listModels(): ModelInfo[] {
    return GLM_MODELS.map(m => ({ ...m, provider: "glm", fullId: `glm/${m.id}` }));
  }

  async login(apiKey: string): Promise<AuthResult> {
    const token = await this.generateToken(apiKey);
    const resp = await fetch(this.API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1
      })
    });
    if (resp.status === 401) {
      return { success: false, message: "Invalid GLM API key" };
    }
    this.store.update("glm", { apiKey });
    return { success: true, message: "GLM API key saved successfully" };
  }

  logout(): void {
    this.store.clear("glm");
  }

  async refreshAuth(): Promise<void> {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const creds = this.store.load();
    if (!creds.glm?.apiKey) throw new Error("GLM not authenticated. Run llm_login first.");

    const token = await this.generateToken(creds.glm.apiKey);

    const resp = await fetch(this.API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096
      })
    });

    if (!resp.ok) throw new Error(`GLM API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message.content ?? "",
      model: data.model ?? request.model,
      provider: "glm",
      finishReason: (data.choices[0]?.finish_reason ?? "stop") as "stop" | "length" | "error",
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }

  private async generateToken(apiKey: string): Promise<string> {
    const dotIdx = apiKey.indexOf(".");
    // If not JWT-format key, use directly
    if (dotIdx === -1) return apiKey;

    const id = apiKey.substring(0, dotIdx);
    const secret = apiKey.substring(dotIdx + 1);

    const header = { alg: "HS256", sign_type: "SIGN" };
    const now = Date.now();
    const payload = { api_key: id, exp: now + 60000, timestamp: now };

    const enc = new TextEncoder();
    const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    return `${signingInput}.${sigB64}`;
  }
}
