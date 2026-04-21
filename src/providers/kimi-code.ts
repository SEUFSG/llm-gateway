import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

export class KimiCodeProvider {
  readonly name = "kimi-code";
  readonly displayName = "Kimi Code";
  readonly authType = "api_key" as const;

  private readonly BASE_URL = "https://api.kimi.com/coding/v1";

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    return !!this.store.load().kimiCode?.apiKey;
  }

  listModels(): ModelInfo[] {
    return [{
      id: "kimi-for-coding",
      provider: "kimi-code",
      fullId: "kimi-code/kimi-for-coding",
      name: "Kimi K2 Thinking",
      contextWindow: 262144,
      maxOutput: 32768,
      tags: ["code_generation", "code_review", "reasoning"],
      description: "Kimi K2 Thinking for Coding"
    }];
  }

  async login(apiKey: string): Promise<AuthResult> {
    // Verify by calling the API
    const resp = await fetch(`${this.BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "kimi-for-coding",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1
      })
    });
    if (resp.status === 401) {
      return { success: false, message: "Invalid Kimi Code API key" };
    }
    this.store.update("kimiCode" as any, { apiKey } as any);
    return { success: true, message: "Kimi Code authenticated" };
  }

  logout(): void {
    const creds = this.store.load();
    delete (creds as any)["kimiCode"];
    this.store.save(creds as any);
  }

  async refreshAuth(): Promise<void> {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const creds = this.store.load();
    const apiKey = (creds as any).kimiCode?.apiKey;
    if (!apiKey) throw new Error("Kimi Code not authenticated");

    const resp = await fetch(`${this.BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens ?? 4096
      })
    });

    if (!resp.ok) throw new Error(`Kimi Code API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
      model: string;
    };

    return {
      content: data.content?.find(c => c.type === "text")?.text ?? "",
      model: data.model ?? request.model,
      provider: "kimi-code",
      finishReason: "stop",
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      } : undefined
    };
  }
}
