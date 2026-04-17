export interface ModelInfo {
  id: string;
  provider: string;
  fullId: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  tags: string[];
  description: string;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "error";
}

export interface AuthResult {
  success: boolean;
  message: string;
  expiresAt?: string; // ISO 8601 date string
}

export interface CopilotCredentials {
  oauthToken: string;
  sessionToken: string;
  sessionExpiresAt: string;
}

export interface ApiKeyCredentials {
  apiKey: string;
}

export interface Credentials {
  copilot?: CopilotCredentials;
  kimi?: ApiKeyCredentials;
  minimax?: ApiKeyCredentials;
  glm?: ApiKeyCredentials;
}

/** Maps task label (e.g. "code_generation") to ordered fallback chain of fullIds (e.g. ["copilot/gpt-4o", "glm/glm-4"]) */
export type RoutingConfig = Record<string, string[]>;
