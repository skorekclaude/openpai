/**
 * OpenPAI — Agent Bus
 *
 * Inter-agent communication system. Agents can send messages to each other,
 * broadcast to all agents, or request specific agent expertise.
 *
 * This enables the "Board of Directors" pattern where multiple specialized
 * agents collaborate to solve complex problems.
 *
 * Patterns:
 * - Direct: Agent A asks Agent B a specific question
 * - Broadcast: Agent A asks all agents for input
 * - Board meeting: All agents deliberate on a topic, then a chairperson synthesizes
 *
 * Usage:
 *   const bus = new AgentBus(registry);
 *   const response = await bus.ask("research", "What are the latest AI trends?");
 *   const opinions = await bus.broadcast("Should we invest in crypto?");
 */

import type { AgentInterface, AgentResult, AgentRunContext } from "./agent.ts";
import type { AgentRegistry } from "./agent.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("bus");

// ============================================================
// Types
// ============================================================

/** Response from a bus operation */
export interface BusResponse {
  agentId: string;
  response: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

/** Board meeting result */
export interface BoardMeetingResult {
  topic: string;
  responses: BusResponse[];
  synthesis?: string;
  totalLatencyMs: number;
}

// ============================================================
// Agent Bus
// ============================================================

export class AgentBus {
  private registry: AgentRegistry;
  private enabled: boolean;

  constructor(registry: AgentRegistry, enabled = true) {
    this.registry = registry;
    this.enabled = enabled;

    if (enabled) {
      log.info(`Agent bus initialized with ${registry.size} agents`);
    } else {
      log.info("Agent bus disabled");
    }
  }

  /**
   * Ask a specific agent a question.
   *
   * @param agentId - Target agent ID
   * @param message - Question or request
   * @param context - Optional context
   * @returns Response from the agent
   */
  async ask(
    agentId: string,
    message: string,
    context?: AgentRunContext
  ): Promise<BusResponse> {
    if (!this.enabled) {
      return {
        agentId,
        response: "Agent bus is disabled",
        latencyMs: 0,
        success: false,
        error: "Agent bus is disabled in configuration",
      };
    }

    const agent = this.registry.get(agentId);
    if (!agent) {
      return {
        agentId,
        response: "",
        latencyMs: 0,
        success: false,
        error: `Agent not found: ${agentId}`,
      };
    }

    log.debug(`Bus: asking ${agentId}: "${message.slice(0, 80)}..."`);

    try {
      const result = await agent.run(message, context);
      return {
        agentId,
        response: result.response,
        latencyMs: result.latencyMs,
        success: true,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error(`Bus: agent ${agentId} failed: ${error}`);
      return {
        agentId,
        response: "",
        latencyMs: 0,
        success: false,
        error,
      };
    }
  }

  /**
   * Broadcast a message to all agents and collect responses.
   *
   * @param message - Message to broadcast
   * @param excludeIds - Agent IDs to exclude
   * @returns Array of responses from all agents
   */
  async broadcast(
    message: string,
    excludeIds: string[] = []
  ): Promise<BusResponse[]> {
    if (!this.enabled) {
      return [];
    }

    const agentIds = this.registry
      .list()
      .filter((id) => !excludeIds.includes(id));

    log.info(`Bus: broadcasting to ${agentIds.length} agents`);

    const responses = await Promise.allSettled(
      agentIds.map((id) => this.ask(id, message))
    );

    return responses.map((result, i) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        agentId: agentIds[i]!,
        response: "",
        latencyMs: 0,
        success: false,
        error: result.reason?.message || "Unknown error",
      };
    });
  }

  /**
   * Run a board meeting: all agents deliberate, then synthesize.
   *
   * @param topic - Topic for discussion
   * @param chairAgentId - Agent ID to synthesize (default: first agent)
   * @returns Board meeting result with all opinions and synthesis
   */
  async boardMeeting(
    topic: string,
    chairAgentId?: string
  ): Promise<BoardMeetingResult> {
    const startTime = Date.now();

    log.info(`Board meeting started: "${topic.slice(0, 60)}..."`);

    // Get opinions from all agents
    const responses = await this.broadcast(
      `Board meeting topic: ${topic}\n\nProvide your perspective based on your specialization. Be concise (2-3 sentences).`
    );

    const successfulResponses = responses.filter((r) => r.success);

    // Synthesize using the chair agent
    let synthesis: string | undefined;
    const chairId = chairAgentId || this.registry.list()[0];
    if (chairId && successfulResponses.length > 0) {
      const summaryInput = successfulResponses
        .map((r) => `[${r.agentId}]: ${r.response}`)
        .join("\n\n");

      const synthResponse = await this.ask(
        chairId,
        `As chairperson, synthesize these board opinions into a clear recommendation:\n\n${summaryInput}\n\nProvide a brief synthesis and recommended action.`
      );

      if (synthResponse.success) {
        synthesis = synthResponse.response;
      }
    }

    const result: BoardMeetingResult = {
      topic,
      responses,
      synthesis,
      totalLatencyMs: Date.now() - startTime,
    };

    log.info(
      `Board meeting completed: ${successfulResponses.length} opinions, ${Date.now() - startTime}ms`
    );

    return result;
  }
}
