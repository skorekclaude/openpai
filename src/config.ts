/**
 * OpenPAI — Configuration Loader
 *
 * Loads PAI configuration from YAML files, with environment variable
 * substitution and validation. Configuration drives everything:
 * agents, tools, integrations, personality.
 *
 * Resolution order:
 *   1. PAI_CONFIG env var (explicit path)
 *   2. ./config/pai.yml (project-local)
 *   3. ./pai.yml (current directory)
 *   4. Default configuration (minimal working setup)
 *
 * Environment variable substitution:
 *   Values like ${ENV_VAR} in YAML are replaced with process.env values.
 *
 * Usage:
 *   import { loadConfig, validateConfig } from "./config";
 *   const config = await loadConfig();
 */

import { parse as parseYAML } from "yaml";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("config");

// ============================================================
// Configuration Schema
// ============================================================

export interface PaiConfig {
  /** Display name of this PAI instance */
  name: string;
  /** Primary language (ISO 639-1) */
  language: string;
  /** IANA timezone */
  timezone: string;

  /** Personality settings */
  personality: {
    style: "professional" | "casual" | "friendly" | "technical";
    proactivity: "minimal" | "moderate" | "proactive";
    verbosity: "concise" | "balanced" | "detailed";
  };

  /** Agent definitions */
  agents: AgentConfig[];

  /** LLM backend configuration */
  llm: {
    primary: LLMBackendConfig;
    fallback?: LLMBackendConfig;
  };

  /** Persistent storage configuration */
  storage: {
    provider: "supabase" | "sqlite" | "postgres" | "file";
    connectionString?: string;
    dataDir: string;
  };

  /** Platform integrations */
  integrations: {
    telegram?: TelegramConfig;
    discord?: DiscordConfig;
    slack?: SlackConfig;
    web?: WebConfig;
    [key: string]: IntegrationConfig | undefined;
  };

  /** Tool configuration */
  tools: {
    enabled: string[];
    disabled: string[];
    dangerous: string[];
    custom: CustomToolConfig[];
  };

  /** Feature flags */
  features: {
    semanticCache: boolean;
    knowledgeGraph: boolean;
    voiceStreaming: boolean;
    predictiveMonitor: boolean;
    agentBus: boolean;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  model: string;
  specialization?: string;
  promptFile?: string;
}

export interface LLMBackendConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface IntegrationConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface TelegramConfig extends IntegrationConfig {
  botToken: string;
  userId: string;
}

export interface DiscordConfig extends IntegrationConfig {
  botToken: string;
  guildId?: string;
}

export interface SlackConfig extends IntegrationConfig {
  botToken: string;
  channelId?: string;
}

export interface WebConfig extends IntegrationConfig {
  port?: number;
  host?: string;
  apiKey?: string;
}

export interface CustomToolConfig {
  name: string;
  description: string;
  handler: string;
}

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_CONFIG: PaiConfig = {
  name: "PAI",
  language: "en",
  timezone: "UTC",
  personality: {
    style: "friendly",
    proactivity: "moderate",
    verbosity: "concise",
  },
  agents: [
    {
      id: "general",
      name: "General",
      description: "All-purpose assistant",
      model: "llama-3.3-70b-versatile",
    },
  ],
  llm: {
    primary: {
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    },
  },
  storage: {
    provider: "file",
    dataDir: "~/.openpai",
  },
  integrations: {},
  tools: {
    enabled: ["*"],
    disabled: [],
    dangerous: [],
    custom: [],
  },
  features: {
    semanticCache: false,
    knowledgeGraph: false,
    voiceStreaming: false,
    predictiveMonitor: false,
    agentBus: true,
  },
};

// ============================================================
// Environment Variable Substitution
// ============================================================

/**
 * Replace ${ENV_VAR} patterns in a string with environment variable values.
 */
function substituteEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_match, envVar) => {
    return process.env[envVar] || "";
  });
}

/**
 * Recursively substitute environment variables in all string values.
 */
function substituteEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === "string") {
    return substituteEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVarsDeep);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = substituteEnvVarsDeep(value);
    }
    return result;
  }
  return obj;
}

// ============================================================
// Config Loading
// ============================================================

/**
 * Attempt to read a file, returning null if it does not exist.
 */
async function tryReadFile(path: string): Promise<string | null> {
  try {
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.text();
    }
  } catch {
    // File does not exist or is not readable
  }
  return null;
}

/**
 * Load and parse the PAI configuration.
 *
 * @param configPath - Optional explicit path to config file
 * @returns Validated PaiConfig
 */
export async function loadConfig(configPath?: string): Promise<PaiConfig> {
  // Determine config file path
  const paths = configPath
    ? [configPath]
    : [
        process.env.PAI_CONFIG,
        "./config/pai.yml",
        "./pai.yml",
      ].filter(Boolean) as string[];

  let rawYaml: string | null = null;
  let loadedFrom: string | null = null;

  for (const p of paths) {
    rawYaml = await tryReadFile(p);
    if (rawYaml) {
      loadedFrom = p;
      break;
    }
  }

  let userConfig: Partial<PaiConfig> = {};

  if (rawYaml && loadedFrom) {
    log.info(`Loading config from ${loadedFrom}`);
    try {
      const parsed = parseYAML(rawYaml);
      userConfig = substituteEnvVarsDeep(parsed) as Partial<PaiConfig>;
    } catch (err) {
      log.error(`Failed to parse config file: ${loadedFrom}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(`Invalid YAML in config file: ${loadedFrom}`);
    }
  } else {
    log.info("No config file found, using defaults + environment variables");
  }

  // Merge with defaults
  const config = mergeConfig(userConfig);

  // Apply environment variable overrides (highest priority)
  applyEnvOverrides(config);

  // Validate
  const { valid, errors } = validateConfig(config);
  if (!valid) {
    log.error("Configuration validation failed", { errors });
    throw new Error(`Invalid configuration: ${errors.join("; ")}`);
  }

  return config;
}

// ============================================================
// Config Merging
// ============================================================

/**
 * Deep merge user config with defaults.
 */
export function mergeConfig(partial: Partial<PaiConfig>): PaiConfig {
  const base = structuredClone(DEFAULT_CONFIG);

  if (partial.name) base.name = partial.name;
  if (partial.language) base.language = partial.language;
  if (partial.timezone) base.timezone = partial.timezone;

  if (partial.personality) {
    base.personality = { ...base.personality, ...partial.personality };
  }

  if (partial.agents && partial.agents.length > 0) {
    base.agents = partial.agents;
  }

  if (partial.llm) {
    if (partial.llm.primary) {
      base.llm.primary = { ...base.llm.primary, ...partial.llm.primary };
    }
    if (partial.llm.fallback) {
      base.llm.fallback = partial.llm.fallback;
    }
  }

  if (partial.storage) {
    base.storage = { ...base.storage, ...partial.storage };
  }

  if (partial.integrations) {
    base.integrations = { ...base.integrations, ...partial.integrations };
  }

  if (partial.tools) {
    base.tools = { ...base.tools, ...partial.tools };
  }

  if (partial.features) {
    base.features = { ...base.features, ...partial.features };
  }

  return base;
}

// ============================================================
// Environment Overrides
// ============================================================

function applyEnvOverrides(config: PaiConfig): void {
  if (process.env.PAI_NAME) config.name = process.env.PAI_NAME;
  if (process.env.PAI_LANGUAGE) config.language = process.env.PAI_LANGUAGE;
  if (process.env.PAI_TIMEZONE) config.timezone = process.env.PAI_TIMEZONE;

  // Telegram
  if (process.env.TELEGRAM_BOT_TOKEN) {
    config.integrations.telegram = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      userId: process.env.TELEGRAM_USER_ID || "",
      enabled: true,
    };
  }

  // LLM
  if (process.env.GROQ_API_KEY) {
    config.llm.primary.apiKey = process.env.GROQ_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    config.llm.primary.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    config.llm.primary.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  // Storage
  if (process.env.SUPABASE_URL) {
    config.storage.provider = "supabase";
    config.storage.connectionString = process.env.SUPABASE_URL;
  }

  // Feature toggles
  if (process.env.PAI_SEMANTIC_CACHE === "true") config.features.semanticCache = true;
  if (process.env.PAI_SEMANTIC_CACHE === "false") config.features.semanticCache = false;
  if (process.env.PAI_KNOWLEDGE_GRAPH === "true") config.features.knowledgeGraph = true;
  if (process.env.PAI_KNOWLEDGE_GRAPH === "false") config.features.knowledgeGraph = false;
  if (process.env.PAI_PREDICTIVE_MONITOR === "true") config.features.predictiveMonitor = true;
  if (process.env.PAI_PREDICTIVE_MONITOR === "false") config.features.predictiveMonitor = false;
}

// ============================================================
// Validation
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a PAI configuration.
 */
export function validateConfig(config: Partial<PaiConfig>): ValidationResult {
  const errors: string[] = [];

  if (!config.name) errors.push("name is required");
  if (!config.llm?.primary?.provider) errors.push("llm.primary.provider is required");
  if (!config.llm?.primary?.model) errors.push("llm.primary.model is required");
  if (!config.storage?.provider) errors.push("storage.provider is required");

  if (config.agents && config.agents.length === 0) {
    errors.push("at least one agent is required");
  }

  // Validate agent IDs are unique
  if (config.agents) {
    const ids = config.agents.map((a) => a.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      errors.push(`duplicate agent IDs: ${dupes.join(", ")}`);
    }
  }

  // Validate storage provider
  if (config.storage?.provider) {
    const validProviders = ["supabase", "sqlite", "postgres", "file"];
    if (!validProviders.includes(config.storage.provider)) {
      errors.push(`storage.provider must be one of: ${validProviders.join(", ")}`);
    }
  }

  // Validate personality values
  if (config.personality) {
    const validStyles = ["professional", "casual", "friendly", "technical"];
    if (config.personality.style && !validStyles.includes(config.personality.style)) {
      errors.push(`personality.style must be one of: ${validStyles.join(", ")}`);
    }

    const validProactivity = ["minimal", "moderate", "proactive"];
    if (config.personality.proactivity && !validProactivity.includes(config.personality.proactivity)) {
      errors.push(`personality.proactivity must be one of: ${validProactivity.join(", ")}`);
    }

    const validVerbosity = ["concise", "balanced", "detailed"];
    if (config.personality.verbosity && !validVerbosity.includes(config.personality.verbosity)) {
      errors.push(`personality.verbosity must be one of: ${validVerbosity.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// Utilities
// ============================================================

/**
 * Get a human-readable summary of the configuration.
 */
export function getConfigSummary(config: PaiConfig): string {
  const enabledFeatures = Object.entries(config.features)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const integrations = Object.entries(config.integrations)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return [
    `Name: ${config.name}`,
    `Language: ${config.language} | Timezone: ${config.timezone}`,
    `Personality: ${config.personality.style}, ${config.personality.proactivity}, ${config.personality.verbosity}`,
    `Agents: ${config.agents.length} (${config.agents.map((a) => a.id).join(", ")})`,
    `LLM: ${config.llm.primary.provider}/${config.llm.primary.model}${config.llm.fallback ? ` + fallback: ${config.llm.fallback.provider}/${config.llm.fallback.model}` : ""}`,
    `Storage: ${config.storage.provider}`,
    `Integrations: ${integrations.length > 0 ? integrations.join(", ") : "none"}`,
    `Features: ${enabledFeatures.length > 0 ? enabledFeatures.join(", ") : "none"}`,
  ].join("\n");
}
