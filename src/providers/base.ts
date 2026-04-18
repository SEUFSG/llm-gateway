import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";

export interface LLMProvider {
  readonly name: string;
  readonly displayName: string;
  readonly authType: "oauth_device" | "api_key";

  login(): Promise<AuthResult>;
  logout(): void;
  isAuthenticated(): boolean;
  refreshAuth(): Promise<void>;
  listModels(): ModelInfo[];
  chat(request: ChatRequest): Promise<ChatResponse>;
}
