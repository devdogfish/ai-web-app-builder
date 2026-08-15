import { BUILDER_CONTEXT_LIMITS } from "../config/builder";
import type { ContextMessage } from "./context-budget";

type MemoryEntry = Readonly<{
  id: string;
  role: ContextMessage["role"];
  excerpt: string;
}>;

type CompactMemory = Readonly<{
  compactedThroughMessageId: string | null;
  historicalTurns: MemoryEntry[];
}>;

/** Bounded, inert excerpts from turns removed by the context planner. */
export function compactConversationMemory(
  existing: string | null | undefined,
  excluded: readonly ContextMessage[],
): string | undefined {
  const existingMemory = parseMemory(existing);
  const entries = new Map(
    existingMemory.historicalTurns.map((entry) => [entry.id, entry]),
  );
  for (const message of excluded) {
    entries.set(message.id, {
      id: message.id,
      role: message.role,
      excerpt: message.text.replaceAll(/\s+/g, " ").trim().slice(0, 320),
    });
  }

  const compactedThroughMessageId =
    excluded.at(-1)?.id ?? existingMemory.compactedThroughMessageId;
  if (!compactedThroughMessageId) return undefined;

  const newest = [...entries.values()];
  while (true) {
    const serialized = JSON.stringify({
      compactedThroughMessageId,
      historicalTurns: newest,
    });
    if (
      serialized.length <= BUILDER_CONTEXT_LIMITS.maxCompactMemoryCharacters
    ) {
      return serialized;
    }
    if (newest.length === 0) return undefined;
    newest.shift();
  }
}

/** Ordered boundary separating compacted history from full recent turns. */
export function compactedConversationBoundary(
  value: string | null | undefined,
): string | null {
  return parseMemory(value).compactedThroughMessageId;
}

function parseMemory(value: string | null | undefined): CompactMemory {
  if (!value) return emptyMemory();
  try {
    const parsed = JSON.parse(value) as {
      compactedThroughMessageId?: unknown;
      historicalTurns?: unknown;
    };
    const historicalTurns = Array.isArray(parsed.historicalTurns)
      ? parsed.historicalTurns.filter(isMemoryEntry)
      : [];
    const explicitBoundary =
      typeof parsed.compactedThroughMessageId === "string"
        ? parsed.compactedThroughMessageId
        : null;
    return {
      compactedThroughMessageId:
        explicitBoundary ?? historicalTurns.at(-1)?.id ?? null,
      historicalTurns,
    };
  } catch {
    return emptyMemory();
  }
}

function emptyMemory(): CompactMemory {
  return { compactedThroughMessageId: null, historicalTurns: [] };
}

function isMemoryEntry(value: unknown): value is MemoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    (entry.role === "user" || entry.role === "assistant") &&
    typeof entry.excerpt === "string"
  );
}
