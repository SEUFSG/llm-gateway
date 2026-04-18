import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { Credentials, ApiKeyCredentials, CopilotCredentials } from "./types";

export class TokenStore {
  private readonly dir: string;
  private readonly credPath: string;

  constructor(dir: string = join(process.env.HOME ?? "~", ".llm-gateway")) {
    this.dir = dir;
    this.credPath = join(dir, "credentials.json");
  }

  load(): Credentials {
    if (!existsSync(this.credPath)) return {};
    try {
      const raw = readFileSync(this.credPath, "utf-8");
      return JSON.parse(raw) as Credentials;
    } catch {
      return {};
    }
  }

  save(creds: Credentials): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(this.credPath, JSON.stringify(creds, null, 2), { encoding: "utf-8", mode: 0o600 });
  }

  update(provider: keyof Credentials, data: ApiKeyCredentials | CopilotCredentials): void {
    const creds = this.load();
    (creds as Record<string, unknown>)[provider] = data;
    this.save(creds);
  }

  clear(provider: keyof Credentials): void {
    const creds = this.load();
    delete creds[provider];
    this.save(creds);
  }
}
