/**
 * OpenPAI — Agent System
 *
 * Defines the core Agent interface and provides a base implementation.
 * Each agent is a specialized AI persona with its own system prompt,
 * model preference, and tool access.
 *
 * Architecture:
 *   - AgentInterface: contract all agents must implement
 *   - BaseAgent: default implementation using the LLM router
 *   - AgentRegistry: manages loaded agents from config
 *
 * Usage:
 *   const agent = new BaseAgent(config, routerFn);
 *   const result = await agent.run("What is the weather?");
 */

import type { AgentConfig, PaiConfig } from "../config.ts";
import type { LLMRouter, LLMResponse } from "./router.ts";
import { createLogger } from "../utils/logger.ts";
import { sanitizeInput, filterLLMOutput } from "../utils/sanitize.ts";

const log = createLogger("agent");

// ============================================================
// Types
// ============================================================

/** Result from an agent execution */
export interface AgentResult {
  /** Final response text */
  response: string;
  /** Agent ID that produced the result */
  agentId: string;
  /** Number of reasoning steps taken */
  steps: number;
  /** Tool calls made during execution */
  toolCalls: ToolCallRecord[];
  /** Total execution time in milliseconds */
  latencyMs: number;
  /** LLM backend(s) used */
  backends: string[];
}

/** Record of a tool call made by the agent */
export interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result: string;
  success: boolean;
  step: number;
}

/** Context provided to agent for a single run */
export interface AgentRunContext {
  /** Conversation history for context */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Additional system context to prepend */
  systemContext?: string;
  /** Maximum steps for agentic loop */
  maxSteps?: number;
}

// ============================================================
// Agent Interface
// ============================================================

/**
 * Core interface that all agents must implement.
 */
export interface AgentInterface {
  /** Unique agent identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Description of agent capabilities */
  readonly description: string;
  /** Preferred LLM model */
  readonly model: string;

  /**
   * Run the agent with a user message.
   *
   * @param message - User input
   * @param context - Optional execution context
   * @returns Agent result with response and metadata
   */
  run(message: string, context?: AgentRunContext): Promise<AgentResult>;

  /**
   * Get the system prompt for this agent.
   */
  getSystemPrompt(): string;
}

// ============================================================
// Base Agent Implementation
// ============================================================

/**
 * Default agent implementation.
 * Performs a single LLM call (no agentic loop).
 * Extend this class for more complex agent behavior.
 */
export class BaseAgent implements AgentInterface {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model: string;

  private router: LLMRouter;
  private systemPrompt: string;

  constructor(agentConfig: AgentConfig, router: LLMRouter, systemPrompt?: string) {
    this.id = agentConfig.id;
    this.name = agentConfig.name;
    this.description = agentConfig.description;
    this.model = agentConfig.model;
    this.router = router;

    this.systemPrompt =
      systemPrompt ||
      `You are ${this.name}, a specialized AI agent.\n` +
      `Role: ${this.description}\n` +
      `Respond concisely and helpfully.`;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  async run(message: string, context?: AgentRunContext): Promise<AgentResult> {
    const startTime = Date.now();

    // Sanitize input
    const cleanMessage = sanitizeInput(message);

    // Build prompt
    let prompt = this.systemPrompt;
    if (context?.systemContext) {
      prompt += "\n\n" + context.systemContext;
    }
    if (context?.history) {
      for (const msg of context.history) {
        prompt += `\n\n${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`;
      }
    }
    prompt += `\n\nUser: ${cleanMessage}`;

    log.debug(`Agent ${this.id} processing message`, {
      messageLength: cleanMessage.length,
    });

    // Call LLM
    const llmResponse = await this.router.route({
      prompt,
      model: this.model,
      agentId: this.id,
    });

    // Filter output for leaked credentials
    const filtered = filterLLMOutput(llmResponse.text);

    return {
      response: filtered.text,
      agentId: this.id,
      steps: 1,
      toolCalls: [],
      latencyMs: Date.now() - startTime,
      backends: [llmResponse.backend],
    };
  }
}

// ============================================================
// Agent Registry
// ============================================================

/**
 * Registry for managing multiple agents.
 */
export class AgentRegistry {
  private agents = new Map<string, AgentInterface>();

  /** Register an agent */
  register(agent: AgentInterface): void {
    if (this.agents.has(agent.id)) {
      log.warn(`Replacing existing agent: ${agent.id}`);
    }
    this.agents.set(agent.id, agent);
    log.info(`Agent registered: ${agent.id} (${agent.name})`);
  }

  /** Get an agent by ID */
  get(id: string): AgentInterface | undefined {
    return this.agents.get(id);
  }

  /** Get the default (first) agent */
  getDefault(): AgentInterface | undefined {
    return this.agents.values().next().value;
  }

  /** List all registered agent IDs */
  list(): string[] {
    return [...this.agents.keys()];
  }

  /** Number of registered agents */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Create agents from config and register them.
   */
  static fromConfig(config: PaiConfig, router: LLMRouter): AgentRegistry {
    const registry = new AgentRegistry();

    for (const agentConfig of config.agents) {
      const agent = new BaseAgent(agentConfig, router);
      registry.register(agent);
    }

    log.info(`Loaded ${registry.size} agents from config`);
    return registry;
  }
}
