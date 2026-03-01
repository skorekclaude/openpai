/**
 * OpenPAI — Configuration Tests
 *
 * Tests for config loading, validation, and merging.
 */

import { describe, test, expect } from "bun:test";
import {
  validateConfig,
  mergeConfig,
  getConfigSummary,
  DEFAULT_CONFIG,
  type PaiConfig,
} from "../../src/config.ts";

// ============================================================
// Validation Tests
// ============================================================

describe("validateConfig", () => {
  test("accepts valid default config", () => {
    const result = validateConfig(DEFAULT_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects config without name", () => {
    const config = { ...DEFAULT_CONFIG, name: "" };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("name is required");
  });

  test("rejects config without LLM provider", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.llm.primary.provider = "";
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("llm.primary.provider is required");
  });

  test("rejects config without LLM model", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.llm.primary.model = "";
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("llm.primary.model is required");
  });

  test("rejects empty agents array", () => {
    const config = { ...DEFAULT_CONFIG, agents: [] };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("at least one agent is required");
  });

  test("rejects duplicate agent IDs", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.agents = [
      { id: "general", name: "A", description: "A", model: "m" },
      { id: "general", name: "B", description: "B", model: "m" },
    ];
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate agent IDs"))).toBe(true);
  });

  test("rejects invalid storage provider", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    (config.storage as any).provider = "redis";
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("storage.provider"))).toBe(true);
  });

  test("rejects invalid personality style", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    (config.personality as any).style = "aggressive";
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("personality.style"))).toBe(true);
  });

  test("rejects invalid personality proactivity", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    (config.personality as any).proactivity = "extreme";
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("personality.proactivity"))).toBe(true);
  });

  test("rejects invalid personality verbosity", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    (config.personality as any).verbosity = "verbose";
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("personality.verbosity"))).toBe(true);
  });

  test("accepts valid storage providers", () => {
    for (const provider of ["file", "supabase", "sqlite", "postgres"]) {
      const config = structuredClone(DEFAULT_CONFIG);
      config.storage.provider = provider as any;
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    }
  });
});

// ============================================================
// Merge Tests
// ============================================================

describe("mergeConfig", () => {
  test("returns defaults for empty partial", () => {
    const config = mergeConfig({});
    expect(config.name).toBe(DEFAULT_CONFIG.name);
    expect(config.language).toBe(DEFAULT_CONFIG.language);
    expect(config.agents).toHaveLength(DEFAULT_CONFIG.agents.length);
  });

  test("overrides name", () => {
    const config = mergeConfig({ name: "CustomPAI" });
    expect(config.name).toBe("CustomPAI");
  });

  test("overrides language and timezone", () => {
    const config = mergeConfig({ language: "pl", timezone: "Europe/Warsaw" });
    expect(config.language).toBe("pl");
    expect(config.timezone).toBe("Europe/Warsaw");
  });

  test("merges personality partially", () => {
    const config = mergeConfig({
      personality: { style: "technical" } as any,
    });
    expect(config.personality.style).toBe("technical");
    expect(config.personality.proactivity).toBe(DEFAULT_CONFIG.personality.proactivity);
    expect(config.personality.verbosity).toBe(DEFAULT_CONFIG.personality.verbosity);
  });

  test("replaces agents entirely when provided", () => {
    const config = mergeConfig({
      agents: [
        { id: "custom", name: "Custom", description: "Custom agent", model: "gpt-4o" },
      ],
    });
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0]!.id).toBe("custom");
  });

  test("does not replace agents when empty array provided", () => {
    const config = mergeConfig({ agents: [] });
    expect(config.agents).toHaveLength(DEFAULT_CONFIG.agents.length);
  });

  test("merges LLM primary config", () => {
    const config = mergeConfig({
      llm: {
        primary: { provider: "openai", model: "gpt-4o" },
      },
    });
    expect(config.llm.primary.provider).toBe("openai");
    expect(config.llm.primary.model).toBe("gpt-4o");
  });

  test("adds fallback LLM when not in defaults", () => {
    const config = mergeConfig({
      llm: {
        primary: { provider: "groq", model: "llama-3.3-70b-versatile" },
        fallback: { provider: "ollama", model: "llama3" },
      },
    });
    expect(config.llm.fallback).toBeDefined();
    expect(config.llm.fallback!.provider).toBe("ollama");
  });

  test("merges features partially", () => {
    const config = mergeConfig({
      features: { semanticCache: true } as any,
    });
    expect(config.features.semanticCache).toBe(true);
    expect(config.features.agentBus).toBe(DEFAULT_CONFIG.features.agentBus);
  });

  test("merges storage config", () => {
    const config = mergeConfig({
      storage: { provider: "supabase", dataDir: "/data", connectionString: "postgres://localhost" },
    });
    expect(config.storage.provider).toBe("supabase");
    expect(config.storage.dataDir).toBe("/data");
    expect(config.storage.connectionString).toBe("postgres://localhost");
  });
});

// ============================================================
// Summary Tests
// ============================================================

describe("getConfigSummary", () => {
  test("returns a multi-line summary string", () => {
    const summary = getConfigSummary(DEFAULT_CONFIG);
    expect(summary).toContain(DEFAULT_CONFIG.name);
    expect(summary).toContain(DEFAULT_CONFIG.llm.primary.provider);
    expect(summary).toContain(DEFAULT_CONFIG.storage.provider);
    expect(summary.split("\n").length).toBeGreaterThan(3);
  });

  test("includes agent count", () => {
    const summary = getConfigSummary(DEFAULT_CONFIG);
    expect(summary).toContain(`${DEFAULT_CONFIG.agents.length}`);
  });

  test("includes agent IDs", () => {
    const summary = getConfigSummary(DEFAULT_CONFIG);
    for (const agent of DEFAULT_CONFIG.agents) {
      expect(summary).toContain(agent.id);
    }
  });
});

// ============================================================
// Default Config Tests
// ============================================================

describe("DEFAULT_CONFIG", () => {
  test("has required fields", () => {
    expect(DEFAULT_CONFIG.name).toBeTruthy();
    expect(DEFAULT_CONFIG.language).toBeTruthy();
    expect(DEFAULT_CONFIG.timezone).toBeTruthy();
    expect(DEFAULT_CONFIG.agents.length).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.llm.primary.provider).toBeTruthy();
    expect(DEFAULT_CONFIG.llm.primary.model).toBeTruthy();
    expect(DEFAULT_CONFIG.storage.provider).toBeTruthy();
  });

  test("passes validation", () => {
    const result = validateConfig(DEFAULT_CONFIG);
    expect(result.valid).toBe(true);
  });

  test("agents have unique IDs", () => {
    const ids = DEFAULT_CONFIG.agents.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
