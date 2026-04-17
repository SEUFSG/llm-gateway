import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GlmProvider } from "../../src/providers/glm";
import { TokenStore } from "../../src/token-store";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-glm-creds");

describe("GlmProvider", () => {
  let store: TokenStore;
  let provider: GlmProvider;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
    provider = new GlmProvider(store);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("is not authenticated when no API key stored", () => {
    expect(provider.isAuthenticated()).toBe(false);
  });

  it("is authenticated when API key stored", () => {
    store.update("glm", { apiKey: "test.key" });
    expect(provider.isAuthenticated()).toBe(true);
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("glm");
    expect(provider.displayName).toBe("Zhipu GLM");
    expect(provider.authType).toBe("api_key");
  });

  it("listModels returns GLM models", () => {
    const models = provider.listModels();
    const ids = models.map(m => m.id);
    expect(ids).toContain("glm-4");
    expect(ids).toContain("glm-4-flash");
    for (const m of models) {
      expect(m.fullId).toBe(`glm/${m.id}`);
    }
  });

  it("logout clears credentials", () => {
    store.update("glm", { apiKey: "test.key" });
    provider.logout();
    expect(provider.isAuthenticated()).toBe(false);
  });
});
