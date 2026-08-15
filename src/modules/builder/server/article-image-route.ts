import "server-only";

import {
  ArticleImageRepository,
  ArticleImageRepositoryError,
  articleImageResponse,
} from "@/modules/article-images/server";
import { getArticleRepository } from "@/modules/builder/db/server";
import { assertBuilderActionAccess } from "@/modules/builder/environment/request-resolver";
import {
  getWebsiteConfig,
  WEBSITES,
} from "@/modules/builder/environment/websites";
import {
  articleImagePreviewResponse,
  PreviewImageProxyError,
} from "./preview-image-proxy";

interface ArticleImageRouteContext {
  params: Promise<{ articleId: string; imageId: string }>;
}

export async function getArticleImage(
  request: Request,
  context: ArticleImageRouteContext,
): Promise<Response> {
  await assertBuilderActionAccess("read");
  const { articleId, imageId } = await context.params;
  const repository = getArticleRepository();

  try {
    const image = new ArticleImageRepository(repository.sqlite).getBinary(
      articleId,
      imageId,
    );
    const productionUrl = new URL(request.url).searchParams.get("production");
    if (!productionUrl) return articleImageResponse(image);

    const workspace = repository.getWorkspace(articleId);
    const website = workspace
      ? WEBSITES.map(getWebsiteConfig).find(
          (candidate) =>
            candidate.storageWebsite === workspace.article.website &&
            candidate.storageArticleType === workspace.article.articleType,
        )
      : undefined;
    if (!website) {
      return new Response("Article website not found", { status: 404 });
    }
    return await articleImagePreviewResponse({
      image,
      policy: website.assetPolicy,
      productionUrl,
    });
  } catch (error) {
    if (
      error instanceof ArticleImageRepositoryError &&
      error.code === "image_not_found"
    ) {
      return new Response("Not found", { status: 404 });
    }
    if (error instanceof PreviewImageProxyError) {
      return new Response(error.message, { status: 400 });
    }
    throw error;
  }
}
