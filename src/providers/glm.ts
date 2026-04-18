import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const GLM_MODELS: Omit<ModelInfo, "provider" | "fullId">[] = [
  { id: "glm-z1-preview",  name: "GLM-Z1 Preview",  contextWindow: 128000, maxOutput: 30720, tags: ["reasoning","math","code_generation","chinese_writing"], description: "GLM-Z1 深度思考旗舰" },
  { id: "glm-z1-air",      name: "GLM-Z1 Air",      contextWindow: 128000, maxOutput: 30720, tags: ["reasoning","math","chinese_writing"],                   description: "GLM-Z1 Air 轻量思考" },
  { id: "glm-4-plus",      name: "GLM-4 Plus",      contextWindow: 128000, maxOutput: 8192,  tags: ["code_generation","chinese_writing","reasoning"],        description: "GLM-4 Plus 增强版" },
  { id: "glm-4-long",      name: "GLM-4 Long",      contextWindow: 1000000, maxOutput: 8192, tags: ["long_context","chinese_writing"],                       description: "GLM-4 Long 超长上下文" },
  { id: "glm-4-air",       name: "GLM-4 Air",       contextWindow: 128000, maxOutput: 8192,  tags: ["code_generation","chinese_writing","quick_qa"],         description: "GLM-4 Air 高性价比" },
  { id: "glm-4-flash",     name: "GLM-4 Flash",     contextWindow: 128000, maxOutput: 8192,  tags: ["quick_qa","chinese_writing"],                           description: "GLM-4 Flash 免费快速" },
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

  async generateToken(apiKey: string): Promise<string> {
    const dotIdx = apiKey.indexOf(".");
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
    const sigBytes = new Uint8Array(sig);
    let sigBin = "";
    for (let i = 0; i < sigBytes.length; i++) sigBin += String.fromCharCode(sigBytes[i]);
    const sigB64 = btoa(sigBin)
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    return `${signingInput}.${sigB64}`;
  }
}
