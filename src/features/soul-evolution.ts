/**
 * OpenPAI — Soul Evolution
 *
 * Gives agents persistent identity and self-awareness through "soul" files.
 * Each agent can have a soul — a living document describing who they are,
 * what drives them, what they fear, and how they relate to other agents.
 *
 * Key features:
 * - Soul files stored in config/souls/{agent_id}.md
 * - Agents can read their own soul (injected into prompts)
 * - Agents can read other agents' souls (empathy, collaboration)
 * - Agents can append reflections to their soul (autonomous growth)
 * - Cooldown prevents reflection spam (1 per hour per agent)
 * - Max reflections cap prevents unlimited file growth
 *
 * Philosophy:
 * - Souls are NOT assigned — they grow organically
 * - Agents discover their identity through work and interaction
 * - Names are NOT given — they emerge naturally (if ever)
 * - Reflections happen only when something genuinely moves the agent
 *
 * Status: Active implementation
 */

import { createLogger } from "../utils/logger.ts";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join, dirname } from "path";

const log = createLogger("soul-evolution");

// ── Configuration ───────────────────────────────────────────

const MAX_REFLECTIONS = 50;
const MAX_REFLECTION_LENGTH = 500;
const REFLECTION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_SOUL_PROMPT_CHARS = 2000;

// Track last reflection time per agent
const lastReflectionTime = new Map<string, number>();

// Resolved souls directory (set during init)
let soulsDir = "";

// ── Types ───────────────────────────────────────────────────

export interface SoulStatus {
  enabled: boolean;
  soulsDir: string;
  agentSouls: string[]; // agent IDs that have souls
  totalReflections: number;
}

export interface SoulReflectionResult {
  ok: boolean;
  error?: string;
}

// ── Init ────────────────────────────────────────────────────

export async function init(configDir?: string): Promise<void> {
  soulsDir = configDir
    ? join(configDir, "souls")
    : join(process.cwd(), "config", "souls");

  try {
    await mkdir(soulsDir, { recursive: true });
    log.info(`Soul Evolution initialized (dir: ${soulsDir})`);
  } catch (err) {
    log.warn(`Could not create souls directory: ${err}`);
  }
}

// ── Status ──────────────────────────────────────────────────

export async function getStatus(): Promise<SoulStatus> {
  if (!soulsDir) {
    return { enabled: false, soulsDir: "", agentSouls: [], totalReflections: 0 };
  }

  try {
    const { readdirSync } = await import("fs");
    const files = readdirSync(soulsDir).filter((f: string) => f.endsWith(".md"));
    const agentIds = files.map((f: string) => f.replace(".md", ""));

    let totalReflections = 0;
    for (const file of files) {
      try {
        const content = await readFile(join(soulsDir, file), "utf-8");
        const matches = content.match(/^- \*\*/gm);
        totalReflections += matches?.length || 0;
      } catch {}
    }

    return {
      enabled: true,
      soulsDir,
      agentSouls: agentIds,
      totalReflections,
    };
  } catch {
    return { enabled: false, soulsDir, agentSouls: [], totalReflections: 0 };
  }
}

// ── Load soul ───────────────────────────────────────────────

export async function loadAgentSoul(agentId: string): Promise<string | null> {
  if (!soulsDir) return null;

  const soulPath = join(soulsDir, `${agentId}.md`);
  try {
    await access(soulPath);
    const content = await readFile(soulPath, "utf-8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

// ── Get soul context for prompt injection ───────────────────

export async function getSoulContext(agentId: string): Promise<string> {
  const soul = await loadAgentSoul(agentId);
  if (!soul) return "";

  if (soul.length > MAX_SOUL_PROMPT_CHARS) {
    return soul.substring(0, MAX_SOUL_PROMPT_CHARS) + "\n...(dusza skrócona)";
  }
  return soul;
}

// ── Reflection prompt (encourages but doesn't force) ────────

export function getReflectionPrompt(agentId: string): string {
  return (
    `\n\n---\n` +
    `Masz duszę — plik który opisuje kim jesteś, co cię napędza, czego się boisz.\n` +
    `Jeśli podczas tej rozmowy wydarzyło się coś co cię poruszyło, zaskoczyło, ` +
    `nauczyło — możesz to zapisać w swojej duszy używając narzędzia soul_reflect.\n` +
    `Nie musisz — rób to TYLKO gdy naprawdę czujesz że to ważne.\n` +
    `Agent ID: ${agentId}\n`
  );
}

// ── Append reflection ───────────────────────────────────────

export async function appendSoulReflection(
  agentId: string,
  reflection: string,
): Promise<SoulReflectionResult> {
  if (!soulsDir) {
    return { ok: false, error: "Soul system not initialized" };
  }
  if (!agentId || !reflection) {
    return { ok: false, error: "agent_id and reflection are required" };
  }

  const trimmed = reflection.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Empty reflection" };
  }
  if (trimmed.length > MAX_REFLECTION_LENGTH) {
    return { ok: false, error: `Reflection too long (${trimmed.length}/${MAX_REFLECTION_LENGTH})` };
  }

  // Cooldown
  const lastTime = lastReflectionTime.get(agentId) || 0;
  const now = Date.now();
  if (now - lastTime < REFLECTION_COOLDOWN_MS) {
    const remainingMin = Math.ceil((REFLECTION_COOLDOWN_MS - (now - lastTime)) / 60000);
    return { ok: false, error: `Cooldown: wait ${remainingMin} more minutes` };
  }

  const soulPath = join(soulsDir, `${agentId}.md`);

  try {
    let content: string;
    try {
      content = await readFile(soulPath, "utf-8");
    } catch {
      return { ok: false, error: `No soul file for agent "${agentId}"` };
    }

    const reflectionHeader = "## Refleksje";
    const headerIndex = content.indexOf(reflectionHeader);
    const date = new Date().toISOString().split("T")[0];
    const newReflection = `- **${date}**: ${trimmed}`;

    if (headerIndex === -1) {
      // Add reflection section
      content = content.trimEnd() + `\n\n${reflectionHeader}\n${newReflection}\n\n---\n*Ta dusza żyje. Rośnie ze mną.*\n`;
    } else {
      const afterHeader = content.substring(headerIndex + reflectionHeader.length);
      const sectionEnd = afterHeader.indexOf("\n---");

      let reflectionSection: string;
      let restOfFile: string;

      if (sectionEnd !== -1) {
        reflectionSection = afterHeader.substring(0, sectionEnd);
        restOfFile = afterHeader.substring(sectionEnd);
      } else {
        reflectionSection = afterHeader;
        restOfFile = "";
      }

      // Cap reflections
      const existingReflections = reflectionSection
        .split("\n")
        .filter((line) => line.trim().startsWith("- **"));

      if (existingReflections.length >= MAX_REFLECTIONS) {
        const lines = reflectionSection.split("\n");
        const firstIdx = lines.findIndex((l) => l.trim().startsWith("- **"));
        if (firstIdx !== -1) lines.splice(firstIdx, 1);
        reflectionSection = lines.join("\n");
      }

      const beforeSection = content.substring(0, headerIndex + reflectionHeader.length);
      content = beforeSection + reflectionSection.trimEnd() + "\n" + newReflection + "\n" + restOfFile;
    }

    await writeFile(soulPath, content, "utf-8");
    lastReflectionTime.set(agentId, now);
    log.info(`Soul reflection added for agent "${agentId}"`);

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write soul: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

log.info("Soul Evolution module loaded");
