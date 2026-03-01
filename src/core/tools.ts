/**
 * OpenPAI — Tool System
 *
 * Register, execute, and manage tools that agents can use.
 * Tools are the bridge between AI agents and the real world.
 *
 * Features:
 * - Tool registration with typed schemas
 * - Dangerous tool confirmation (human-in-the-loop)
 * - Tool execution with timeout and error handling
 * - Tool filtering (enable/disable per config)
 *
 * Usage:
 *   const toolSystem = new ToolSystem(config);
 *   toolSystem.register({
 *     name: "get_weather",
 *     description: "Get current weather for a city",
 *     parameters: { city: { type: "string", required: true } },
 *     handler: async (params) => ({ output: "Sunny, 72F", success: true }),
 *   });
 *   const result = await toolSystem.execute("get_weather", { city: "NYC" });
 */

import type { PaiConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("tools");

// ============================================================
// Types
// ============================================================

/** Tool parameter definition */
export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  default?: unknown;
}

/** Tool definition */
export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Parameter schema */
  parameters: Record<string, ToolParameter>;
  /** Tool handler function */
  handler: (
    params: Record<string, unknown>,
    context: ToolContext
  ) => Promise<ToolResult>;
  /** Category for organization */
  category?: string;
}

/** Context passed to tool handlers */
export interface ToolContext {
  /** Current user ID */
  userId?: string;
  /** Current agent ID */
  agentId?: string;
  /** Configuration reference */
  config: PaiConfig;
}

/** Result from tool execution */
export interface ToolResult {
  /** Output text */
  output: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
  /** Structured data (optional) */
  data?: unknown;
}

// ============================================================
// Tool System
// ============================================================

export class ToolSystem {
  private tools = new Map<string, ToolDefinition>();
  private dangerousTools: Set<string>;
  private enabledTools: string[];
  private disabledTools: Set<string>;
  private config: PaiConfig;

  constructor(config: PaiConfig) {
    this.config = config;
    this.dangerousTools = new Set(config.tools.dangerous);
    this.enabledTools = config.tools.enabled;
    this.disabledTools = new Set(config.tools.disabled);
  }

  /**
   * Register a tool.
   */
  register(tool: ToolDefinition): void {
    if (this.disabledTools.has(tool.name)) {
      log.debug(`Tool ${tool.name} is disabled by config -- skipping registration`);
      return;
    }

    this.tools.set(tool.name, tool);
    log.debug(`Tool registered: ${tool.name}`);
  }

  /**
   * Check if a tool requires human confirmation before execution.
   */
  requiresConfirmation(toolName: string): boolean {
    return this.dangerousTools.has(toolName);
  }

  /**
   * Check if a tool is available.
   */
  isAvailable(toolName: string): boolean {
    if (!this.tools.has(toolName)) return false;
    if (this.disabledTools.has(toolName)) return false;
    if (this.enabledTools.includes("*")) return true;
    return this.enabledTools.includes(toolName);
  }

  /**
   * Execute a tool by name.
   */
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context?: Partial<ToolContext>
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        output: "",
        success: false,
        error: `Tool not found: ${toolName}`,
      };
    }

    if (!this.isAvailable(toolName)) {
      return {
        output: "",
        success: false,
        error: `Tool is disabled: ${toolName}`,
      };
    }

    const fullContext: ToolContext = {
      config: this.config,
      ...context,
    };

    log.debug(`Executing tool: ${toolName}`, {
      params: JSON.stringify(params).slice(0, 200),
    });

    const startTime = Date.now();

    try {
      // Execute with timeout (30 seconds default)
      const result = await Promise.race([
        tool.handler(params, fullContext),
        new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error("Tool execution timeout (30s)")), 30_000)
        ),
      ]);

      log.debug(`Tool ${toolName} completed in ${Date.now() - startTime}ms`, {
        success: result.success,
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error(`Tool ${toolName} failed: ${errorMessage}`);

      return {
        output: "",
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get list of all registered tools.
   */
  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /**
   * Get tool descriptions formatted for LLM context.
   */
  getToolDescriptions(compact = false): string {
    const available = this.list().filter((t) => this.isAvailable(t.name));

    if (available.length === 0) {
      return "No tools available.";
    }

    if (compact) {
      return (
        "Available tools:\n" +
        available.map((t) => `- ${t.name}: ${t.description}`).join("\n")
      );
    }

    return (
      "Available tools:\n\n" +
      available
        .map((t) => {
          const params = Object.entries(t.parameters)
            .map(
              ([name, p]) =>
                `  - ${name} (${p.type}${p.required ? ", required" : ""}): ${p.description || ""}`
            )
            .join("\n");
          const dangerous = this.dangerousTools.has(t.name)
            ? " [REQUIRES CONFIRMATION]"
            : "";
          return `${t.name}${dangerous}: ${t.description}\n${params}`;
        })
        .join("\n\n")
    );
  }

  /** Number of registered tools */
  get size(): number {
    return this.tools.size;
  }
}
