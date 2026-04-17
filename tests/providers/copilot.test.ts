import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CopilotProvider } from "../../src/providers/copilot";
import { TokenStore } from "../../src/token-store";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-copilot-creds");

describe("CopilotProvider", () => {
  let store: TokenStore;
  let provider: CopilotProvider;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
    provider = new CopilotProvider(store);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("is not authenticated when no credentials stored", () => {
    expect(provider.isAuthenticated()).toBe(false);
  });

  it("is authenticated when valid credentials exist", () => {
    store.update("copilot", {
      oauthToken: "gho_x",
      sessionToken: "tid=valid",
      sessionExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });
    expect(provider.isAuthenticated()).toBe(true);
  });

  it("is not authenticated when session token expired", () => {
    store.update("copilot", {
      oauthToken: "gho_x",
      sessionToken: "tid=expired",
      sessionExpiresAt: new Date(Date.now() - 1000).toISOString()
    });
    expect(provider.isAuthenticated()).toBe(false);
  });

  it("returns correct provider metadata", () => {
    expect(provider.name).toBe("copilot");
    expect(provider.displayName).toBe("GitHub Copilot");
    expect(provider.authType).toBe("oauth_device");
  });

  it("listModels returns known Copilot models", () => {
    store.update("copilot", {
      oauthToken: "gho_x",
      sessionToken: "tid=valid",
      sessionExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });
    const models = provider.listModels();
    const ids = models.map(m => m.id);
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("claude-sonnet-4");
    expect(ids).toContain("o3-mini");
    for (const m of models) {
      expect(m.fullId).toBe(`copilot/${m.id}`);
      expect(m.tags.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
    }
  });
});
