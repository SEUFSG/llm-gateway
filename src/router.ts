import type { ModelInfo, RoutingConfig } from "./types";
import type { ProviderRegistry } from "./registry";

export interface RouteResult {
  model: ModelInfo | null;
  tried: string[];
  reason: string;
}

export class Router {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly routing: RoutingConfig
  ) {}

  resolve(task: string): ModelInfo | null {
    return this.resolveWithDetails(task).model;
  }

  resolveWithDetails(task: string): RouteResult {
    const chain = this.routing[task];
    if (!chain || chain.length === 0) {
      return { model: null, tried: [], reason: `No routing rule for task: "${task}"` };
    }

    const tried: string[] = [];
    const reasons: string[] = [];

    for (const fullId of chain) {
      tried.push(fullId);
      const [providerName] = fullId.split("/");
      const provider = this.registry.getProvider(providerName);

      if (!provider) {
        reasons.push(`${fullId}: provider not found`);
        continue;
      }
      if (!provider.isAuthenticated()) {
        reasons.push(`${fullId}: not authenticated`);
        continue;
      }
      const model = this.registry.findModel(fullId);
      if (!model) {
        reasons.push(`${fullId}: model not available`);
        continue;
      }
      return { model, tried, reason: "ok" };
    }

    return { model: null, tried, reason: reasons.join("; ") };
  }

  taskLabels(): string[] {
    return Object.keys(this.routing);
  }
}
