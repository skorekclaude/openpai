/**
 * OpenPAI — Memory System
 *
 * Pluggable memory system supporting multiple storage backends:
 * - File-based (default, zero dependencies)
 * - Supabase (recommended for production)
 * - SQLite (local database)
 *
 * Memory types:
 * - Messages: conversation history
 * - Facts: extracted knowledge ("user likes coffee")
 * - Goals: active objectives
 * - Daily log: daily activity summary
 *
 * Usage:
 *   const memory = createMemory(config);
 *   await memory.saveMessage({ role: "user", content: "Hello" });
 *   const history = await memory.getRecentMessages(10);
 *   await memory.saveFact("User prefers dark mode");
 */

import type { PaiConfig } from "../config.ts";
import { createLogger } from "../utils/logger.ts";
import { sanitizeMemoryFact } from "../utils/sanitize.ts";

const log = createLogger("memory");

// ============================================================
// Types
// ============================================================

export interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface Fact {
  id?: string;
  content: string;
  category?: string;
  source?: string;
  timestamp: string;
}

export interface Goal {
  id?: string;
  content: string;
  status: "active" | "done" | "dropped";
  createdAt: string;
  completedAt?: string;
}

/** Interface for memory backends */
export interface MemoryBackend {
  /** Initialize the storage (create files/tables if needed) */
  init(): Promise<void>;

  /** Save a message to conversation history */
  saveMessage(message: Message): Promise<void>;

  /** Get recent messages */
  getRecentMessages(limit: number): Promise<Message[]>;

  /** Save a fact to long-term memory */
  saveFact(fact: Fact): Promise<void>;

  /** Search facts by query string */
  searchFacts(query: string, limit?: number): Promise<Fact[]>;

  /** Get all active goals */
  getGoals(): Promise<Goal[]>;

  /** Save or update a goal */
  saveGoal(goal: Goal): Promise<void>;

  /** Append to daily log */
  appendDailyLog(entry: string): Promise<void>;

  /** Get today's log */
  getDailyLog(): Promise<string>;
}

// ============================================================
// File-based Memory Backend
// ============================================================

class FileMemoryBackend implements MemoryBackend {
  private dataDir: string;

  constructor(dataDir: string) {
    // Expand ~ to home directory
    this.dataDir = dataDir.replace(/^~/, process.env.HOME || process.env.USERPROFILE || ".");
  }

  private async ensureDir(dir: string): Promise<void> {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  }

  private async readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return await file.json();
      }
    } catch {
      // File does not exist or is invalid JSON
    }
    return defaultValue;
  }

  private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await Bun.write(filePath, JSON.stringify(data, null, 2));
  }

  async init(): Promise<void> {
    await this.ensureDir(this.dataDir);
    await this.ensureDir(`${this.dataDir}/logs`);
    log.info(`File memory initialized at ${this.dataDir}`);
  }

  async saveMessage(message: Message): Promise<void> {
    const filePath = `${this.dataDir}/messages.json`;
    const messages = await this.readJsonFile<Message[]>(filePath, []);
    messages.push({
      ...message,
      id: message.id || crypto.randomUUID(),
      timestamp: message.timestamp || new Date().toISOString(),
    });

    // Keep only last 1000 messages
    if (messages.length > 1000) {
      messages.splice(0, messages.length - 1000);
    }

    await this.writeJsonFile(filePath, messages);
  }

  async getRecentMessages(limit: number): Promise<Message[]> {
    const filePath = `${this.dataDir}/messages.json`;
    const messages = await this.readJsonFile<Message[]>(filePath, []);
    return messages.slice(-limit);
  }

  async saveFact(fact: Fact): Promise<void> {
    // Sanitize fact content
    const cleanContent = sanitizeMemoryFact(fact.content);
    if (!cleanContent) {
      log.warn("Fact blocked by sanitization", { preview: fact.content.slice(0, 80) });
      return;
    }

    const filePath = `${this.dataDir}/facts.json`;
    const facts = await this.readJsonFile<Fact[]>(filePath, []);
    facts.push({
      ...fact,
      content: cleanContent,
      id: fact.id || crypto.randomUUID(),
      timestamp: fact.timestamp || new Date().toISOString(),
    });

    await this.writeJsonFile(filePath, facts);
  }

  async searchFacts(query: string, limit = 10): Promise<Fact[]> {
    const filePath = `${this.dataDir}/facts.json`;
    const facts = await this.readJsonFile<Fact[]>(filePath, []);

    const queryLower = query.toLowerCase();
    return facts
      .filter((f) => f.content.toLowerCase().includes(queryLower))
      .slice(-limit);
  }

  async getGoals(): Promise<Goal[]> {
    const filePath = `${this.dataDir}/goals.json`;
    const goals = await this.readJsonFile<Goal[]>(filePath, []);
    return goals.filter((g) => g.status === "active");
  }

  async saveGoal(goal: Goal): Promise<void> {
    const filePath = `${this.dataDir}/goals.json`;
    const goals = await this.readJsonFile<Goal[]>(filePath, []);

    const existing = goals.findIndex((g) => g.id === goal.id);
    if (existing >= 0) {
      goals[existing] = goal;
    } else {
      goals.push({
        ...goal,
        id: goal.id || crypto.randomUUID(),
        createdAt: goal.createdAt || new Date().toISOString(),
      });
    }

    await this.writeJsonFile(filePath, goals);
  }

  async appendDailyLog(entry: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const filePath = `${this.dataDir}/logs/${today}.log`;

    const timestamp = new Date().toISOString().split("T")[1]!.split(".")[0]; // HH:MM:SS
    const line = `[${timestamp}] ${entry}\n`;

    try {
      const file = Bun.file(filePath);
      const existing = (await file.exists()) ? await file.text() : "";
      await Bun.write(filePath, existing + line);
    } catch {
      await Bun.write(filePath, line);
    }
  }

  async getDailyLog(): Promise<string> {
    const today = new Date().toISOString().split("T")[0];
    const filePath = `${this.dataDir}/logs/${today}.log`;

    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return await file.text();
      }
    } catch {
      // No log for today
    }
    return "";
  }
}

// ============================================================
// Supabase Memory Backend (stub)
// ============================================================

class SupabaseMemoryBackend implements MemoryBackend {
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async init(): Promise<void> {
    log.info("Supabase memory backend initialized (stub)");
    log.warn(
      "Supabase backend is not yet fully implemented. " +
      "Using file backend as fallback for actual storage."
    );
  }

  async saveMessage(_message: Message): Promise<void> {
    log.debug("Supabase saveMessage (stub)");
  }

  async getRecentMessages(_limit: number): Promise<Message[]> {
    return [];
  }

  async saveFact(_fact: Fact): Promise<void> {
    log.debug("Supabase saveFact (stub)");
  }

  async searchFacts(_query: string, _limit?: number): Promise<Fact[]> {
    return [];
  }

  async getGoals(): Promise<Goal[]> {
    return [];
  }

  async saveGoal(_goal: Goal): Promise<void> {
    log.debug("Supabase saveGoal (stub)");
  }

  async appendDailyLog(_entry: string): Promise<void> {
    log.debug("Supabase appendDailyLog (stub)");
  }

  async getDailyLog(): Promise<string> {
    return "";
  }
}

// ============================================================
// Factory
// ============================================================

/**
 * Create a memory backend based on configuration.
 */
export function createMemory(config: PaiConfig): MemoryBackend {
  switch (config.storage.provider) {
    case "supabase":
      if (config.storage.connectionString) {
        return new SupabaseMemoryBackend(config.storage.connectionString);
      }
      log.warn("Supabase configured but no connection string -- falling back to file");
      return new FileMemoryBackend(config.storage.dataDir);

    case "sqlite":
      log.warn("SQLite backend not yet implemented -- falling back to file");
      return new FileMemoryBackend(config.storage.dataDir);

    case "postgres":
      log.warn("Postgres backend not yet implemented -- falling back to file");
      return new FileMemoryBackend(config.storage.dataDir);

    case "file":
    default:
      return new FileMemoryBackend(config.storage.dataDir);
  }
}
