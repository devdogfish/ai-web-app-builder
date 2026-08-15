export class RefinementInProgressError extends Error {
  readonly code = "refinement_in_progress" as const;

  constructor() {
    super("Refinement already in progress.");
    this.name = "RefinementInProgressError";
  }
}

export class ArticleRefinementCoordinator {
  private readonly activeArticleIds = new Set<string>();

  async run<T>(articleId: string, operation: () => Promise<T>): Promise<T> {
    if (this.activeArticleIds.has(articleId)) {
      throw new RefinementInProgressError();
    }

    this.activeArticleIds.add(articleId);
    try {
      return await operation();
    } finally {
      this.activeArticleIds.delete(articleId);
    }
  }
}

const coordinatorGlobal = globalThis as typeof globalThis & {
  articleRefinementCoordinator?: ArticleRefinementCoordinator;
};

export function getArticleRefinementCoordinator(): ArticleRefinementCoordinator {
  return (coordinatorGlobal.articleRefinementCoordinator ??=
    new ArticleRefinementCoordinator());
}
