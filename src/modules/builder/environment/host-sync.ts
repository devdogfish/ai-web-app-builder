import "server-only";

import { getArticleRepository } from "@/modules/builder/db/server";
import { getArticleIntegration } from "./article-integration";
import type { BuilderEnvironment } from "./types";

const syncGlobal = globalThis as typeof globalThis & {
  articleHostSyncLocks?: Map<string, Promise<void>>;
};

/** Flushes the durable outbox in Version order; failures remain retryable. */
export async function flushHostSync(
  environment: BuilderEnvironment,
): Promise<boolean> {
  const locks = (syncGlobal.articleHostSyncLocks ??= new Map());
  const previous = locks.get(environment.articleId) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => flush(environment));
  locks.set(environment.articleId, current);
  try {
    await current;
  } finally {
    if (locks.get(environment.articleId) === current)
      locks.delete(environment.articleId);
  }
  return (
    getArticleRepository().getPendingHostSync(environment.articleId).length ===
    0
  );
}

async function flush(environment: BuilderEnvironment): Promise<void> {
  const repository = getArticleRepository();
  for (const task of repository.getPendingHostSync(environment.articleId)) {
    try {
      await getArticleIntegration().writeArticleHtml(environment, task.html, {
        id: task.versionId,
        number: task.versionNumber,
        sha256: task.sha256,
        expectedPreviousSha256: task.expectedPreviousSha256,
      });
      repository.completeHostSync(task.versionId);
    } catch (error) {
      repository.failHostSync(
        task.versionId,
        error instanceof Error
          ? error.message
          : "Host Article HTML sync failed.",
      );
      break;
    }
  }
}
