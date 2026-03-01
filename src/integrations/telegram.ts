/**
 * OpenPAI — Telegram Integration
 *
 * Connects PAI to Telegram using the Grammy framework.
 * Handles incoming messages, forwards them to the agent system,
 * and sends responses back to the user.
 *
 * Features:
 * - Text message handling
 * - User authorization (restrict to configured user ID)
 * - Typing indicators
 * - Error handling with user feedback
 *
 * Usage:
 *   import { start } from "./integrations/telegram";
 *   await start(config);
 */

import type { PaiConfig, TelegramConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("telegram");

/**
 * Start the Telegram bot integration.
 *
 * @param config - PAI configuration
 */
export async function start(config: PaiConfig): Promise<void> {
  const telegramConfig = config.integrations.telegram as TelegramConfig | undefined;

  if (!telegramConfig?.botToken) {
    log.warn("Telegram bot token not configured -- skipping");
    return;
  }

  try {
    // Dynamic import to avoid requiring Grammy when not using Telegram
    const { Bot } = await import("grammy");

    const bot = new Bot(telegramConfig.botToken);
    const allowedUserId = telegramConfig.userId;

    // Authorization middleware
    bot.use(async (ctx, next) => {
      if (allowedUserId && ctx.from?.id.toString() !== allowedUserId) {
        log.warn("Unauthorized access attempt", {
          userId: ctx.from?.id,
          username: ctx.from?.username,
        });
        await ctx.reply("Unauthorized. This bot is private.");
        return;
      }
      await next();
    });

    // Handle text messages
    bot.on("message:text", async (ctx) => {
      const userMessage = ctx.message.text;
      log.info(`Message from ${ctx.from?.username || ctx.from?.id}: ${userMessage.slice(0, 80)}`);

      try {
        // Show typing indicator
        await ctx.replyWithChatAction("typing");

        // For now, echo back (agent system integration happens when core is wired up)
        // In production, this would call: agentRegistry.getDefault().run(userMessage)
        const response = `[OpenPAI] Received: "${userMessage.slice(0, 100)}"\n\nAgent system not yet wired. Configure agents in pai.yml to enable AI responses.`;

        await ctx.reply(response, { parse_mode: "Markdown" });
      } catch (err) {
        log.error("Failed to process message", {
          error: err instanceof Error ? err.message : String(err),
        });
        await ctx.reply("An error occurred while processing your message.").catch(() => {});
      }
    });

    // Handle /start command
    bot.command("start", async (ctx) => {
      await ctx.reply(
        `Welcome to *${config.name}*! Your Personal AI is ready.\n\n` +
        `Send me any message and I'll assist you.\n\n` +
        `Powered by OpenPAI Framework.`,
        { parse_mode: "Markdown" }
      );
    });

    // Handle /status command
    bot.command("status", async (ctx) => {
      const status = [
        `*${config.name} Status*`,
        ``,
        `Agents: ${config.agents.length}`,
        `LLM: ${config.llm.primary.provider}/${config.llm.primary.model}`,
        `Storage: ${config.storage.provider}`,
        `Features: ${Object.entries(config.features).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`,
      ].join("\n");

      await ctx.reply(status, { parse_mode: "Markdown" });
    });

    // Error handling
    bot.catch((err) => {
      log.error("Bot error", {
        error: err.error instanceof Error ? err.error.message : String(err.error),
      });
    });

    // Start the bot
    log.info("Starting Telegram bot...");
    bot.start({
      onStart: (botInfo) => {
        log.info(`Telegram bot started: @${botInfo.username}`);
      },
    });
  } catch (err) {
    log.error("Failed to start Telegram bot", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
