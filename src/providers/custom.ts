import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const BASE_URL = process.env.LLM_CUSTOM_BASE_URL ?? "https://103.236.97.252:32456";
const DEFAULT_CONTEXT_WINDOW = 200000;
const DEFAULT_MAX_OUTPUT = 32000;

type RemoteModel = {
  id: string;
  name?: string;
  object?: string;
};

export class CustomProvider {
  readonly name = "custom";
  readonly displayName = "Custom Gateway";
  readonly authType = "api_key" as const;

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    return !!this.store.load().custom?.apiKey;
  }

  async fetchModels(apiKey?: string): Promise<ModelInfo[]> {
    const key = apiKey ?? this.store.load().custom?.apiKey;
    if (!key) return [];

    const resp = await fetch(`${BASE_URL}/v1/models`, {
      headers: { "Authorization": `Bearer ${key}` },
      tls: { rejectUnauthorized: false }
    } as any);
    if (!resp.ok) {
      throw new Error(`Custom gateway model list failed: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json() as { data?: RemoteModel[]; models?: RemoteModel[] };
    const models = data.data ?? data.models ?? [];

    return models.map(model => ({
      id: model.id,
      provider: "custom",
      fullId: `custom/${model.id}`,
      name: model.name ?? model.id,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      maxOutput: DEFAULT_MAX_OUTPUT,
      tags: ["code_generation", "reasoning"],
      description: "Model exposed by custom gateway"
    }));
  }

  listModels(): ModelInfo[] {
    return [];
  }

  async login(apiKey: string): Promise<AuthResult> {
    try {
      await this.fetchModels(apiKey);
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }

    this.store.update("custom", { apiKey });
    return { success: true, message: "Custom gateway API key saved successfully" };
  }

  logout(): void {
    this.store.clear("custom");
  }

  async refreshAuth(): Promise<void> {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const creds = this.store.load();
    if (!creds.custom?.apiKey) throw new Error("Custom gateway not authenticated. Run llm_login first.");

    const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.custom.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096
      }),
      tls: { rejectUnauthorized: false }
    } as any);

    if (!resp.ok) throw new Error(`Custom gateway API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message.content ?? "",
      model: data.model ?? request.model,
      provider: "custom",
      finishReason: (data.choices[0]?.finish_reason ?? "stop") as "stop" | "length" | "error",
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }
}
