import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Router } from "../src/router";
import { ProviderRegistry } from "../src/registry";
import { TokenStore } from "../src/token-store";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import type { RoutingConfig } from "../src/types";

const TEST_DIR = join(import.meta.dir, ".test-router-creds");

const TEST_ROUTING: RoutingConfig = {
  code_generation: ["copilot/gpt-4o", "kimi/moonshot-v1-32k"],
  chinese_writing: ["kimi/moonshot-v1-128k", "glm/glm-4"],
  quick_qa: ["copilot/gpt-4o-mini", "kimi/moonshot-v1-8k"]
};

describe("Router", () => {
  let store: TokenStore;
  let registry: ProviderRegistry;
  let router: Router;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
    registry = new ProviderRegistry(store);
    router = new Router(registry, TEST_ROUTING);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("returns null when no providers authenticated", () => {
    const result = router.resolve("code_generation");
    expect(result).toBeNull();
  });

  it("skips unauthenticated providers in fallback chain", () => {
    store.update("kimi", { apiKey: "sk-test" });
    const result = router.resolve("code_generation");
    expect(result?.fullId).toBe("kimi/moonshot-v1-32k");
  });

  it("returns first available model in chain", () => {
    store.update("copilot", {
      oauthToken: "gho_x",
      sessionToken: "tid=valid",
      sessionExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });
    store.update("kimi", { apiKey: "sk-test" });
    const result = router.resolve("code_generation");
    expect(result?.fullId).toBe("copilot/gpt-4o");
  });

  it("returns null for unknown task label", () => {
    store.update("kimi", { apiKey: "sk-test" });
    const result = router.resolve("unknown_task");
    expect(result).toBeNull();
  });

  it("lists available task labels", () => {
    const labels = router.taskLabels();
    expect(labels).toContain("code_generation");
    expect(labels).toContain("chinese_writing");
    expect(labels).toContain("quick_qa");
  });

  it("resolveWithDetails returns tried chain on failure", () => {
    const detail = router.resolveWithDetails("code_generation");
    expect(detail.model).toBeNull();
    expect(detail.tried).toEqual(["copilot/gpt-4o", "kimi/moonshot-v1-32k"]);
    expect(detail.reason).toContain("not authenticated");
  });
});
