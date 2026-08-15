import type { ArticleWorkspace } from "../db";
import type { BuilderEnvironment } from "./types";
import { getWebsiteConfig } from "./websites";

export function assertWorkspaceEnvironment(
  workspace: ArticleWorkspace,
  environment: BuilderEnvironment,
): void {
  const website = getWebsiteConfig(environment.website);
  if (
    workspace.article.website !== website.storageWebsite ||
    workspace.article.articleType !== website.storageArticleType
  ) {
    throw new Error(
      "The News Article does not belong to this website and article type.",
    );
  }
}
