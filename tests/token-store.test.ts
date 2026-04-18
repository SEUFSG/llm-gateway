import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { TokenStore } from "../src/token-store";
import type { Credentials } from "../src/types";
import { rmSync, existsSync } from "fs";

const TEST_DIR = join(import.meta.dir, ".test-creds");

describe("TokenStore", () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("returns empty credentials when file does not exist", () => {
    const creds = store.load();
    expect(creds).toEqual({});
  });

  it("saves and loads credentials", () => {
    const creds: Credentials = {
      kimi: { apiKey: "sk-test-123" }
    };
    store.save(creds);
    const loaded = store.load();
    expect(loaded.kimi?.apiKey).toBe("sk-test-123");
  });

  it("merges credentials on update", () => {
    store.save({ kimi: { apiKey: "sk-kimi" } });
    store.update("glm", { apiKey: "sk-glm" });
    const loaded = store.load();
    expect(loaded.kimi?.apiKey).toBe("sk-kimi");
    expect(loaded.glm?.apiKey).toBe("sk-glm");
  });

  it("removes credentials on clear", () => {
    store.save({ kimi: { apiKey: "sk-kimi" } });
    store.clear("kimi");
    const loaded = store.load();
    expect(loaded.kimi).toBeUndefined();
  });

  it("creates directory if it does not exist", () => {
    store.save({ glm: { apiKey: "sk-x" } });
    expect(existsSync(TEST_DIR)).toBe(true);
  });
});
