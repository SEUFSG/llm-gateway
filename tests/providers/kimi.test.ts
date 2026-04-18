import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { KimiProvider } from "../../src/providers/kimi";
import { TokenStore } from "../../src/token-store";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-kimi-creds");

describe("KimiProvider", () => {
  let store: TokenStore;
  let provider: KimiProvider;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
    provider = new KimiProvider(store);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("is not authenticated when no API key stored", () => {
    expect(provider.isAuthenticated()).toBe(false);
  });

  it("is authenticated when API key stored", () => {
    store.update("kimi", { apiKey: "sk-test" });
    expect(provider.isAuthenticated()).toBe(true);
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("kimi");
    expect(provider.displayName).toBe("Moonshot Kimi");
    expect(provider.authType).toBe("api_key");
  });

  it("listModels returns Kimi models with tags", () => {
    store.update("kimi", { apiKey: "sk-test" });
    const models = provider.listModels();
    const ids = models.map(m => m.id);
    expect(ids).toContain("moonshot-v1-8k");
    expect(ids).toContain("moonshot-v1-128k");
    for (const m of models) {
      expect(m.fullId).toBe(`kimi/${m.id}`);
      expect(m.tags).toContain("chinese_writing");
    }
  });

  it("logout clears credentials", () => {
    store.update("kimi", { apiKey: "sk-test" });
    provider.logout();
    expect(provider.isAuthenticated()).toBe(false);
  });
});
