import type { ModelInfo } from "./types";
import { CopilotProvider } from "./providers/copilot";
import { KimiProvider } from "./providers/kimi";
import { MinimaxProvider } from "./providers/minimax";
import { GlmProvider } from "./providers/glm";
import { QwenProvider } from "./providers/qwen";
import type { TokenStore } from "./token-store";

type AnyProvider = CopilotProvider | KimiProvider | MinimaxProvider | GlmProvider | QwenProvider;

export class ProviderRegistry {
  private readonly providers: Map<string, AnyProvider>;

  constructor(store: TokenStore) {
    this.providers = new Map([
      ["copilot", new CopilotProvider(store)],
      ["kimi", new KimiProvider(store)],
      ["minimax", new MinimaxProvider(store)],
      ["glm", new GlmProvider(store)],
      ["qwen", new QwenProvider(store)]
    ]);
  }

  allProviders(): AnyProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(name: string): AnyProvider | undefined {
    return this.providers.get(name);
  }

  authenticatedProviders(): AnyProvider[] {
    return this.allProviders().filter(p => p.isAuthenticated());
  }

  allModels(): ModelInfo[] {
    return this.authenticatedProviders().flatMap(p => p.listModels());
  }

  findModel(fullId: string): ModelInfo | undefined {
    return this.allModels().find(m => m.fullId === fullId);
  }
}
