/**
 * OpenPAI — Slack Integration (Stub)
 *
 * Placeholder for Slack bot integration.
 * Will use Slack Bolt framework to connect PAI to Slack workspaces.
 *
 * Status: Not yet implemented
 * Requires: @slack/bolt package (add to dependencies when implementing)
 */

import type { PaiConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("slack");

/**
 * Start the Slack bot integration.
 *
 * @param config - PAI configuration
 */
export async function start(config: PaiConfig): Promise<void> {
  const slackConfig = config.integrations.slack;

  if (!slackConfig) {
    log.debug("Slack integration not configured -- skipping");
    return;
  }

  log.info("Slack integration is not yet implemented");
  log.info("To contribute, see: https://github.com/skorecky/openpai/issues");
}
