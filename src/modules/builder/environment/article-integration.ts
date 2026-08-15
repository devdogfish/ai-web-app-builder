import "server-only";

import type { BuilderEnvironment } from "./types";

/**
 * Host integration boundary for an Article HTML field that predates Builder Chat.
 * Replace this adapter with the original application's authenticated article query.
 */
export interface ArticleIntegration {
  getInitialArticleHtml(
    environment: BuilderEnvironment,
  ): Promise<string | null>;
  writeArticleHtml(
    environment: BuilderEnvironment,
    html: string,
    version: {
      id: string;
      number: number;
      sha256: string;
      expectedPreviousSha256: string | null;
    },
  ): Promise<void>;
}

class DevelopmentArticleIntegration implements ArticleIntegration {
  async getInitialArticleHtml(): Promise<string | null> {
    return process.env.BUILDER_DEVELOPMENT_INITIAL_ARTICLE_HTML?.trim() || null;
  }

  async writeArticleHtml(): Promise<void> {
    // The standalone app's Drizzle articles table is the canonical field.
  }
}

const integrationGlobal = globalThis as typeof globalThis & {
  articleBuilderIntegration?: ArticleIntegration;
};

export function getArticleIntegration(): ArticleIntegration {
  integrationGlobal.articleBuilderIntegration ??=
    new DevelopmentArticleIntegration();
  return integrationGlobal.articleBuilderIntegration;
}
