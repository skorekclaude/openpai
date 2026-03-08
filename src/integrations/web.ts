/**
 * OpenPAI — Web API Integration
 *
 * HTTP API for web frontends and third-party integrations.
 *
 * Endpoints:
 *   GET  /            - Welcome page
 *   GET  /health      - Health check (Railway needs this)
 *   GET  /api/status  - System status
 */

import type { PaiConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("web");

let serverInstance: ReturnType<typeof Bun.serve> | null = null;
let startTime: number = Date.now();

/**
 * Start the Web API integration.
 */
export async function start(config: PaiConfig): Promise<void> {
  const port = Number(process.env.PORT) || 8090;
  startTime = Date.now();

  serverInstance = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // CORS headers
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      };

      // Health check
      if (path === "/health" || path === "/") {
        return new Response(JSON.stringify({
          ok: true,
          name: config.name,
          version: "0.1.0",
          uptime: Math.floor((Date.now() - startTime) / 1000),
          agents: config.agents.map(a => a.id),
        }), { headers });
      }

      // Status
      if (path === "/api/status") {
        return new Response(JSON.stringify({
          ok: true,
          name: config.name,
          version: "0.1.0",
          language: config.language,
          timezone: config.timezone,
          uptime: Math.floor((Date.now() - startTime) / 1000),
          agents: config.agents.map(a => ({ id: a.id, name: a.name })),
          features: {
            semanticCache: !!config.features.semanticCache,
            knowledgeGraph: !!config.features.knowledgeGraph,
            soulEvolution: config.features.soulEvolution !== false,
          },
        }), { headers });
      }

      // 404
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers,
      });
    },
  });

  log.info(`Web API listening on port ${port}`);
}
