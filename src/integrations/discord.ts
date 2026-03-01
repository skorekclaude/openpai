/**
 * OpenPAI — Discord Integration (Stub)
 *
 * Placeholder for Discord bot integration.
 * Will use discord.js to connect PAI to Discord servers.
 *
 * Status: Not yet implemented
 * Requires: discord.js package (add to dependencies when implementing)
 */

import type { PaiConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("discord");

/**
 * Start the Discord bot integration.
 *
 * @param config - PAI configuration
 */
export async function start(config: PaiConfig): Promise<void> {
  const discordConfig = config.integrations.discord;

  if (!discordConfig) {
    log.debug("Discord integration not configured -- skipping");
    return;
  }

  log.info("Discord integration is not yet implemented");
  log.info("To contribute, see: https://github.com/skorecky/openpai/issues");
}
