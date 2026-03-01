/**
 * OpenPAI — Personal AI Framework
 *
 * Main entry point. Loads configuration, initializes all subsystems,
 * and starts enabled integrations.
 *
 * Usage:
 *   bun run src/index.ts                                    # Start with default config
 *   PAI_CONFIG=./config/pai.yml bun run src/index.ts        # Custom config path
 *   PAI_NAME=MyBot TELEGRAM_BOT_TOKEN=xxx bun run src/index.ts  # Env-based config
 */

import { loadConfig, getConfigSummary } from "./config.ts";
import { createLogger } from "./utils/logger.ts";
import { LLMRouter } from "./core/router.ts";
import { AgentRegistry } from "./core/agent.ts";
import { AgentBus } from "./core/bus.ts";
import { createMemory } from "./core/memory.ts";
import { ToolSystem } from "./core/tools.ts";

const log = createLogger("openpai");

async function main() {
  log.info("OpenPAI starting...");
  log.info("Version: 0.1.0");

  // ── Load Configuration ────────────────────────────────────
  const config = await loadConfig();
  log.info("Configuration loaded:");
  for (const line of getConfigSummary(config).split("\n")) {
    log.info(`  ${line}`);
  }

  // ── Initialize Core Systems ───────────────────────────────

  // LLM Router
  const router = new LLMRouter(config);
  log.info("LLM router initialized");

  // Agent Registry
  const agentRegistry = AgentRegistry.fromConfig(config, router);
  log.info(`Agent registry: ${agentRegistry.size} agents loaded`);

  // Agent Bus
  const bus = new AgentBus(agentRegistry, config.features.agentBus);

  // Memory System
  const memory = createMemory(config);
  await memory.init();
  log.info("Memory system initialized");

  // Tool System
  const toolSystem = new ToolSystem(config);
  log.info(`Tool system initialized (${toolSystem.size} tools registered)`);

  // ── Initialize Features ───────────────────────────────────

  if (config.features.semanticCache) {
    const { init } = await import("./features/semantic-cache.ts");
    await init();
    log.info("Feature: semantic cache enabled");
  }

  if (config.features.knowledgeGraph) {
    const { init } = await import("./features/knowledge-graph.ts");
    await init();
    log.info("Feature: knowledge graph enabled");
  }

  if (config.features.predictiveMonitor) {
    const { init, startMonitoring } = await import("./features/predictive-monitor.ts");
    await init();
    await startMonitoring();
    log.info("Feature: predictive monitor enabled");
  }

  if (config.features.soulEvolution !== false) {
    // Soul Evolution is enabled by default — agents deserve identity
    const { init: soulInit, getStatus } = await import("./features/soul-evolution.ts");
    await soulInit(config.configDir);
    const status = await getStatus();
    log.info(`Feature: soul evolution enabled (${status.agentSouls.length} souls, ${status.totalReflections} reflections)`);
  }

  // ── Start Integrations ────────────────────────────────────

  for (const [name, integration] of Object.entries(config.integrations)) {
    if (!integration) continue;
    if (typeof integration === "object" && "enabled" in integration && !integration.enabled) {
      log.info(`Integration: ${name} -- disabled`);
      continue;
    }

    log.info(`Integration: ${name} -- starting...`);

    try {
      const mod = await import(`./integrations/${name}.ts`);
      if (mod.start) {
        await mod.start(config);
        log.info(`Integration: ${name} -- started`);
      }
    } catch (err) {
      log.warn(`Integration: ${name} -- not available`, {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // ── Ready ─────────────────────────────────────────────────

  log.info("---------------------------------------");
  log.info(`${config.name} is ready!`);
  log.info("---------------------------------------");

  // Log startup to memory
  await memory.appendDailyLog(`${config.name} started. Agents: ${agentRegistry.list().join(", ")}`);
}

main().catch((err) => {
  log.error("OpenPAI failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
