import "server-only";

import {
  ArticleImageRepository,
  ArticleImageRepositoryError,
  articleImageResponse,
} from "@/modules/article-images/server";
import { getArticleRepository } from "@/modules/builder/db/server";
import { assertBuilderActionAccess } from "@/modules/builder/environment/request-resolver";

interface ArticleImageRouteContext {
  params: Promise<{ articleId: string; imageId: string }>;
}

export async function getArticleImage(
  _request: Request,
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
    return articleImageResponse(image);
  } catch (error) {
    if (
      error instanceof ArticleImageRepositoryError &&
      error.code === "image_not_found"
    ) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
