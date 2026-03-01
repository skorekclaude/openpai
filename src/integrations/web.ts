/**
 * OpenPAI — Web API Integration (Stub)
 *
 * Placeholder for REST/WebSocket API integration.
 * Will provide an HTTP API for web frontends and third-party integrations.
 *
 * Planned endpoints:
 *   POST /api/chat     - Send message, get response
 *   GET  /api/status   - System status
 *   GET  /api/agents   - List agents
 *   WS   /api/ws       - Real-time chat via WebSocket
 *
 * Status: Not yet implemented
 */

import type { PaiConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("web");

/**
 * Start the Web API integration.
 *
 * @param config - PAI configuration
 */
export async function start(config: PaiConfig): Promise<void> {
  const webConfig = config.integrations.web;

  if (!webConfig) {
    log.debug("Web integration not configured -- skipping");
    return;
  }

  const port = (webConfig as Record<string, unknown>).port || 8090;

  log.info(`Web API integration is not yet implemented (planned port: ${port})`);
  log.info("To contribute, see: https://github.com/skorecky/openpai/issues");
}
