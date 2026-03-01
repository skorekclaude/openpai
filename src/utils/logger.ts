/**
 * OpenPAI — Structured Logger
 *
 * Simple, zero-dependency structured logger with levels and prefixes.
 * Outputs JSON in production, human-readable in development.
 *
 * Usage:
 *   const log = createLogger("module-name");
 *   log.info("Server started", { port: 8090 });
 *   log.error("Connection failed", { reason: "timeout" });
 */

// ============================================================
// Types
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ============================================================
// Configuration
// ============================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gray
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || "info"] ?? LOG_LEVELS.info;

// ============================================================
// Logger Implementation
// ============================================================

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= MIN_LEVEL;
}

function logMessage(
  level: LogLevel,
  prefix: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (!shouldLog(level)) return;

  const timestamp = formatTimestamp();

  if (IS_PRODUCTION) {
    // JSON output for production (structured logging / log aggregators)
    const entry: Record<string, unknown> = {
      ts: timestamp,
      level,
      module: prefix,
      msg: message,
    };
    if (data) entry.data = data;
    console.log(JSON.stringify(entry));
  } else {
    // Human-readable output for development
    const color = LEVEL_COLORS[level];
    const levelTag = level.toUpperCase().padEnd(5);
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    console.log(
      `${"\x1b[90m"}${timestamp}${RESET} ${color}${levelTag}${RESET} ${BOLD}[${prefix}]${RESET} ${message}${dataStr}`
    );
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Create a namespaced logger instance.
 *
 * @param prefix - Module or component name (e.g., "telegram", "router")
 * @returns Logger instance with debug/info/warn/error methods
 */
export function createLogger(prefix: string): Logger {
  return {
    debug: (message, data?) => logMessage("debug", prefix, message, data),
    info: (message, data?) => logMessage("info", prefix, message, data),
    warn: (message, data?) => logMessage("warn", prefix, message, data),
    error: (message, data?) => logMessage("error", prefix, message, data),
  };
}
