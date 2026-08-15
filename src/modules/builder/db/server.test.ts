import { afterEach, describe, expect, it, vi } from "vitest";

import { ARTICLE_BUILDER_DATABASE_ENV } from "./constants";

vi.mock("server-only", () => ({}));

const repositoryGlobal = globalThis as typeof globalThis & {
  articleBuilderRepository?: { close(): void };
  articleBuilderRepositoryImplementation?: number;
};

const previousDatabasePath = process.env[ARTICLE_BUILDER_DATABASE_ENV];

afterEach(() => {
  repositoryGlobal.articleBuilderRepository?.close();
  delete repositoryGlobal.articleBuilderRepository;
  delete repositoryGlobal.articleBuilderRepositoryImplementation;
  if (previousDatabasePath === undefined) {
    delete process.env[ARTICLE_BUILDER_DATABASE_ENV];
  } else {
    process.env[ARTICLE_BUILDER_DATABASE_ENV] = previousDatabasePath;
  }
  vi.resetModules();
});

describe("development repository lifetime", () => {
  it("replaces the v2 repository retained before bootstrap provenance support", async () => {
    const staleRepository = { close: vi.fn() };
    repositoryGlobal.articleBuilderRepository = staleRepository;
    repositoryGlobal.articleBuilderRepositoryImplementation = 2;
    process.env[ARTICLE_BUILDER_DATABASE_ENV] = ":memory:";

    const { getArticleRepository } = await import("./server");
    const repository = getArticleRepository();

    expect(repository).not.toBe(staleRepository);
    expect(staleRepository.close).toHaveBeenCalledOnce();
  });
});
