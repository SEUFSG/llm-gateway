import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MinimaxProvider } from "../../src/providers/minimax";
import { TokenStore } from "../../src/token-store";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-minimax-creds");

describe("MinimaxProvider", () => {
  let store: TokenStore;
  let provider: MinimaxProvider;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
    provider = new MinimaxProvider(store);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("is not authenticated when no API key stored", () => {
    expect(provider.isAuthenticated()).toBe(false);
  });

  it("is authenticated when API key stored", () => {
    store.update("minimax", { apiKey: "mm-test" });
    expect(provider.isAuthenticated()).toBe(true);
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("minimax");
    expect(provider.displayName).toBe("MiniMax");
    expect(provider.authType).toBe("api_key");
  });

  it("listModels returns MiniMax models", () => {
    const models = provider.listModels();
    const ids = models.map(m => m.id);
    expect(ids).toContain("abab6.5-chat");
    for (const m of models) {
      expect(m.fullId).toBe(`minimax/${m.id}`);
    }
  });
});
