import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProviderRegistry } from "../src/registry";
import { TokenStore } from "../src/token-store";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-registry-creds");

describe("ProviderRegistry", () => {
  let store: TokenStore;
  let registry: ProviderRegistry;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
    registry = new ProviderRegistry(store);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("has all 4 providers registered", () => {
    const names = registry.allProviders().map(p => p.name);
    expect(names).toContain("copilot");
    expect(names).toContain("kimi");
    expect(names).toContain("minimax");
    expect(names).toContain("glm");
  });

  it("getProvider returns correct provider", () => {
    const p = registry.getProvider("kimi");
    expect(p?.name).toBe("kimi");
  });

  it("getProvider returns undefined for unknown provider", () => {
    expect(registry.getProvider("unknown")).toBeUndefined();
  });

  it("authenticatedProviders returns only authenticated ones", () => {
    store.update("kimi", { apiKey: "sk-test" });
    const authed = registry.authenticatedProviders();
    expect(authed.map(p => p.name)).toContain("kimi");
    expect(authed.map(p => p.name)).not.toContain("copilot");
  });

  it("allModels returns models from all authenticated providers", () => {
    store.update("kimi", { apiKey: "sk-test" });
    const models = registry.allModels();
    const providers = new Set(models.map(m => m.provider));
    expect(providers.has("kimi")).toBe(true);
    expect(providers.has("copilot")).toBe(false);
  });

  it("findModel looks up by fullId", () => {
    store.update("kimi", { apiKey: "sk-test" });
    const model = registry.findModel("kimi/moonshot-v1-128k");
    expect(model?.id).toBe("moonshot-v1-128k");
    expect(model?.provider).toBe("kimi");
  });

  it("findModel returns undefined for unauthenticated provider model", () => {
    expect(registry.findModel("copilot/gpt-4o")).toBeUndefined();
  });
});
