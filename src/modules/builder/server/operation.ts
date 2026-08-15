import "server-only";

import { z } from "zod";

import { ArticleImageRepository } from "../../article-images/repository";
import {
  assertWorkspaceEnvironment,
  builderArticleImageSources,
  toBuilderWorkspace,
} from "../core/server";
import { getArticleRepository } from "../db/server";
import {
  resolveAuthorizedEnvironment,
  type BuilderOperation,
} from "../environment/request-resolver";
import {
  getArticleAssetContext,
  getWebsiteConfig,
} from "../environment/websites";

export const environmentSchema = z.object({
  articleId: z.string().trim().min(1).max(256),
  articleTitle: z.string().trim().min(1).max(500),
  articleSlug: z.string().trim().min(1).max(500),
  website: z.enum(["rbccm", "cmweb"]),
});

export async function createBuilderOperation(
  reference: unknown,
  operation: BuilderOperation,
) {
  const environment = await resolveAuthorizedEnvironment(
    environmentSchema.parse(reference),
    operation,
  );
  const repository = getArticleRepository();
  const images = new ArticleImageRepository(repository.sqlite);
  const workspace = repository.getWorkspace(environment.articleId);
  const website = getWebsiteConfig(environment.website);
  if (workspace) assertWorkspaceEnvironment(workspace, environment);

  return {
    environment,
    repository,
    images,
    workspace,
    website,
    article: getArticleAssetContext(environment),
    articleRecord: {
      id: environment.articleId,
      website: website.storageWebsite,
      articleType: website.storageArticleType,
      title: environment.articleTitle,
    },
    imageSources: () =>
      builderArticleImageSources(
        environment,
        images.list(environment.articleId),
      ),
    toWorkspace: () => {
      const current = repository.getWorkspace(environment.articleId);
      return toBuilderWorkspace(
        environment,
        current,
        current ? images.list(environment.articleId) : [],
      );
    },
  };
}
