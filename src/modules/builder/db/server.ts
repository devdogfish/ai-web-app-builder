import "server-only";

import { createArticleRepository, type ArticleRepository } from "./index";

// Bump when repository behavior changes so Next dev does not retain an old
// class instance across a server hot reload.
const REPOSITORY_IMPLEMENTATION_VERSION = 3;

const repositoryGlobal = globalThis as typeof globalThis & {
  articleBuilderRepository?: ArticleRepository;
  articleBuilderRepositoryImplementation?: number;
};

export function getArticleRepository(): ArticleRepository {
  if (
    !repositoryGlobal.articleBuilderRepository ||
    repositoryGlobal.articleBuilderRepositoryImplementation !==
      REPOSITORY_IMPLEMENTATION_VERSION
  ) {
    repositoryGlobal.articleBuilderRepository?.close();
    repositoryGlobal.articleBuilderRepository = createArticleRepository();
    repositoryGlobal.articleBuilderRepositoryImplementation =
      REPOSITORY_IMPLEMENTATION_VERSION;
  }
  return repositoryGlobal.articleBuilderRepository;
}
