import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { buildServer } from "../src/server";
import { TokenStore } from "../src/token-store";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-server-creds");

describe("MCP Server tools", () => {
  let store: TokenStore;
  let server: ReturnType<typeof buildServer>;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
    server = buildServer(store);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("llm_status returns all 4 providers", async () => {
    const result = await server.callTool("llm_status", {});
    expect(result.providers).toHaveLength(4);
    const names = result.providers.map((p: { name: string }) => p.name);
    expect(names).toContain("copilot");
    expect(names).toContain("kimi");
    expect(names).toContain("minimax");
    expect(names).toContain("glm");
  });

  it("llm_status shows authenticated=false when no creds", async () => {
    const result = await server.callTool("llm_status", {});
    for (const p of result.providers) {
      expect(p.authenticated).toBe(false);
    }
  });

  it("llm_status shows authenticated=true after login", async () => {
    store.update("kimi", { apiKey: "sk-test" });
    const result = await server.callTool("llm_status", {});
    const kimi = result.providers.find((p: { name: string }) => p.name === "kimi");
    expect(kimi?.authenticated).toBe(true);
  });

  it("llm_models returns empty when no providers authenticated", async () => {
    const result = await server.callTool("llm_models", {});
    expect(result.providers).toHaveLength(0);
  });

  it("llm_models returns models for authenticated provider", async () => {
    store.update("kimi", { apiKey: "sk-test" });
    const result = await server.callTool("llm_models", {});
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].name).toBe("kimi");
    expect(result.providers[0].models.length).toBeGreaterThan(0);
  });

  it("llm_chat manual mode fails gracefully when provider not authenticated", async () => {
    await expect(
      server.callTool("llm_chat", {
        mode: "manual",
        provider: "kimi",
        model: "moonshot-v1-8k",
        messages: [{ role: "user", content: "hello" }]
      })
    ).rejects.toThrow("not authenticated");
  });

  it("llm_chat auto mode returns error with details when no models available", async () => {
    const result = await server.callTool("llm_chat", {
      mode: "auto",
      task: "code_generation",
      messages: [{ role: "user", content: "hello" }]
    }).catch(e => e.message);
    expect(result).toContain("All models in fallback chain");
  });

  it("llm_logout clears credentials", async () => {
    store.update("kimi", { apiKey: "sk-test" });
    await server.callTool("llm_logout", { provider: "kimi" });
    const status = await server.callTool("llm_status", {});
    const kimi = status.providers.find((p: { name: string }) => p.name === "kimi");
    expect(kimi?.authenticated).toBe(false);
  });
});
