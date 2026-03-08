/**
 * OpenPAI — LLM Router
 *
 * Multi-backend LLM router that supports Groq, OpenAI, Anthropic,
 * and local models (Ollama). Routes requests to the configured primary
 * backend with automatic fallback.
 *
 * Architecture:
 *   - LLMRouter: main router class
 *   - LLMBackend: interface for each provider
 *   - Built-in backends: Groq, OpenAI, Anthropic, Ollama
 *
 * Usage:
 *   const router = new LLMRouter(config);
 *   const response = await router.route({ prompt: "Hello!", model: "auto" });
 */

import type { PaiConfig, LLMBackendConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("router");

// ============================================================
// Types
// ============================================================

/** Request to the LLM router */
export interface LLMRequest {
  /** Full prompt (system + user combined) */
  prompt: string;
  /** Preferred model (or "auto" for default) */
  model?: string;
  /** Agent ID making the request */
  agentId?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
}

/** Response from the LLM */
export interface LLMResponse {
  /** Generated text */
  text: string;
  /** Backend used (e.g., "groq", "openai") */
  backend: string;
  /** Model used */
  model: string;
  /** Tokens used (if available) */
  tokensUsed?: number;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Error message (if failed) */
  error?: string;
}

/** Interface for LLM provider backends */
export interface LLMBackend {
  /** Provider name */
  readonly name: string;
  /** Send a request to this backend */
  complete(request: LLMRequest, config: LLMBackendConfig): Promise<LLMResponse>;
  /** Check if this backend is available (has required credentials) */
  isAvailable(config: LLMBackendConfig): boolean;
}

// ============================================================
// Built-in Backends
// ============================================================

/** Groq backend (fast inference for open models) */
const groqBackend: LLMBackend = {
  name: "groq",

  isAvailable(config) {
    return !!(config.apiKey || process.env.GROQ_API_KEY);
  },

  async complete(request, config) {
    const startTime = Date.now();
    const apiKey = config.apiKey || process.env.GROQ_API_KEY;

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model || "meta-llama/llama-4-maverick-17b-128e-instruct",
          messages: [{ role: "user", content: request.prompt }],
          max_tokens: request.maxTokens || 2048,
          temperature: request.temperature ?? config.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          text: "",
          backend: "groq",
          model: config.model,
          latencyMs: Date.now() - startTime,
          error: `Groq API error (${response.status}): ${errorText}`,
        };
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens: number };
      };

      return {
        text: data.choices[0]?.message?.content || "",
        backend: "groq",
        model: config.model,
        tokensUsed: data.usage?.total_tokens,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        text: "",
        backend: "groq",
        model: config.model,
        latencyMs: Date.now() - startTime,
        error: `Groq request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

/** OpenAI backend */
const openaiBackend: LLMBackend = {
  name: "openai",

  isAvailable(config) {
    return !!(config.apiKey || process.env.OPENAI_API_KEY);
  },

  async complete(request, config) {
    const startTime = Date.now();
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    const baseUrl = config.baseUrl || "https://api.openai.com/v1";

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model || "gpt-4o",
          messages: [{ role: "user", content: request.prompt }],
          max_tokens: request.maxTokens || 2048,
          temperature: request.temperature ?? config.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          text: "",
          backend: "openai",
          model: config.model,
          latencyMs: Date.now() - startTime,
          error: `OpenAI API error (${response.status}): ${errorText}`,
        };
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens: number };
      };

      return {
        text: data.choices[0]?.message?.content || "",
        backend: "openai",
        model: config.model,
        tokensUsed: data.usage?.total_tokens,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        text: "",
        backend: "openai",
        model: config.model,
        latencyMs: Date.now() - startTime,
        error: `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

/** Anthropic backend */
const anthropicBackend: LLMBackend = {
  name: "anthropic",

  isAvailable(config) {
    return !!(config.apiKey || process.env.ANTHROPIC_API_KEY);
  },

  async complete(request, config) {
    const startTime = Date.now();
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model || "claude-sonnet-4-20250514",
          max_tokens: request.maxTokens || 2048,
          messages: [{ role: "user", content: request.prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          text: "",
          backend: "anthropic",
          model: config.model,
          latencyMs: Date.now() - startTime,
          error: `Anthropic API error (${response.status}): ${errorText}`,
        };
      }

      const data = await response.json() as {
        content: Array<{ text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };

      return {
        text: data.content[0]?.text || "",
        backend: "anthropic",
        model: config.model,
        tokensUsed: data.usage
          ? data.usage.input_tokens + data.usage.output_tokens
          : undefined,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        text: "",
        backend: "anthropic",
        model: config.model,
        latencyMs: Date.now() - startTime,
        error: `Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

/** Ollama backend (local models) */
const ollamaBackend: LLMBackend = {
  name: "ollama",

  isAvailable(config) {
    // Ollama is available if a base URL is configured or localhost is assumed
    return true;
  },

  async complete(request, config) {
    const startTime = Date.now();
    const baseUrl = config.baseUrl || "http://localhost:11434";

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model || "llama3",
          prompt: request.prompt,
          stream: false,
          options: {
            temperature: request.temperature ?? config.temperature ?? 0.7,
            num_predict: request.maxTokens || 2048,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          text: "",
          backend: "ollama",
          model: config.model,
          latencyMs: Date.now() - startTime,
          error: `Ollama error (${response.status}): ${errorText}`,
        };
      }

      const data = await response.json() as { response: string };

      return {
        text: data.response || "",
        backend: "ollama",
        model: config.model,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        text: "",
        backend: "ollama",
        model: config.model,
        latencyMs: Date.now() - startTime,
        error: `Ollama request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

// ============================================================
// Backend Registry
// ============================================================

const BUILT_IN_BACKENDS: Record<string, LLMBackend> = {
  groq: groqBackend,
  openai: openaiBackend,
  anthropic: anthropicBackend,
  claude: anthropicBackend,
  ollama: ollamaBackend,
};

// ============================================================
// LLM Router
// ============================================================

/**
 * Routes LLM requests to the appropriate backend with fallback.
 */
export class LLMRouter {
  private primaryConfig: LLMBackendConfig;
  private fallbackConfig?: LLMBackendConfig;
  private customBackends = new Map<string, LLMBackend>();

  constructor(config: PaiConfig) {
    this.primaryConfig = config.llm.primary;
    this.fallbackConfig = config.llm.fallback;

    log.info(`Primary LLM: ${this.primaryConfig.provider}/${this.primaryConfig.model}`);
    if (this.fallbackConfig) {
      log.info(
        `Fallback LLM: ${this.fallbackConfig.provider}/${this.fallbackConfig.model}`
      );
    }
  }

  /**
   * Register a custom LLM backend.
   */
  registerBackend(backend: LLMBackend): void {
    this.customBackends.set(backend.name, backend);
    log.info(`Registered custom LLM backend: ${backend.name}`);
  }

  /**
   * Get a backend by provider name.
   */
  private getBackend(provider: string): LLMBackend | undefined {
    return this.customBackends.get(provider) || BUILT_IN_BACKENDS[provider];
  }

  /**
   * Route a request to the appropriate LLM backend.
   */
  async route(request: LLMRequest): Promise<LLMResponse> {
    // Try primary backend
    const primaryBackend = this.getBackend(this.primaryConfig.provider);
    if (primaryBackend) {
      log.debug(`Routing to primary: ${this.primaryConfig.provider}`);
      const response = await primaryBackend.complete(request, this.primaryConfig);

      if (!response.error) {
        return response;
      }

      log.warn(`Primary LLM failed: ${response.error}`);
    } else {
      log.warn(`Primary LLM backend not found: ${this.primaryConfig.provider}`);
    }

    // Try fallback backend
    if (this.fallbackConfig) {
      const fallbackBackend = this.getBackend(this.fallbackConfig.provider);
      if (fallbackBackend) {
        log.info(`Falling back to: ${this.fallbackConfig.provider}`);
        const response = await fallbackBackend.complete(request, this.fallbackConfig);

        if (!response.error) {
          return response;
        }

        log.error(`Fallback LLM also failed: ${response.error}`);
        return response;
      }
    }

    // All backends failed
    return {
      text: "",
      backend: "none",
      model: "none",
      latencyMs: 0,
      error:
        "All LLM backends failed. Check your API keys and configuration.",
    };
  }
}
