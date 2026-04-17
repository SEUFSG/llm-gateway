import { describe, it, expect } from "bun:test";
import type { ModelInfo, ChatRequest, ChatResponse, AuthResult, Credentials, RoutingConfig } from "../src/types";

describe("types", () => {
  it("ModelInfo has required fields", () => {
    const model: ModelInfo = {
      id: "gpt-4o",
      provider: "copilot",
      fullId: "copilot/gpt-4o",
      name: "GPT-4o",
      contextWindow: 128000,
      maxOutput: 16384,
      tags: ["code_generation", "reasoning"],
      description: "Strong all-around model"
    };
    expect(model.fullId).toBe("copilot/gpt-4o");
    expect(model.tags).toContain("code_generation");
  });

  it("ChatResponse has provider attribution", () => {
    const resp: ChatResponse = {
      content: "hello",
      model: "gpt-4o",
      provider: "copilot",
      finishReason: "stop"
    };
    expect(resp.provider).toBe("copilot");
  });

  it("Credentials can hold multiple providers", () => {
    const creds: Credentials = {
      copilot: { oauthToken: "gho_x", sessionToken: "tid=x", sessionExpiresAt: new Date().toISOString() },
      kimi: { apiKey: "sk-x" }
    };
    expect(creds.copilot?.oauthToken).toBe("gho_x");
    expect(creds.kimi?.apiKey).toBe("sk-x");
  });
});
