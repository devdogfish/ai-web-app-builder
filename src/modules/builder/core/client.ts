import {
  bootstrapBuilderFromFileAction,
  compileBuilderPreviewAction,
  convertArticleImageToJpegAction,
  getBuilderUploadPreviewAction,
  getBuilderWorkspaceAction,
  formatBuilderArticleSourceAction,
  removeBuilderArticleImageAction,
  reorderBuilderArticleImagesAction,
  runBuilderActionAction,
  uploadBuilderArticleImagesAction,
  uploadBuilderReferencesAction,
  type ActionResult,
} from "../server/actions";
import type {
  BuilderEnvironment,
  EnvironmentReference,
} from "../environment/types";
import type {
  BuilderAction,
  BuilderWorkspace,
  RefineRequest,
  ReferenceUploadPreview,
} from "./contracts";

function reference(environment: BuilderEnvironment): EnvironmentReference {
  return {
    articleId: environment.articleId,
    articleTitle: environment.articleTitle,
    articleSlug: environment.articleSlug,
    website: environment.website,
  };
}

function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function fetchWorkspace(
  environment: BuilderEnvironment,
): Promise<BuilderWorkspace> {
  return unwrap(await getBuilderWorkspaceAction(reference(environment)));
}

export async function formatBuilderArticleSource(
  source: string,
): Promise<string> {
  return unwrap(await formatBuilderArticleSourceAction(source));
}

export async function compileBuilderPreview(
  environment: BuilderEnvironment,
  source: string,
): Promise<string> {
  return unwrap(
    await compileBuilderPreviewAction(reference(environment), source),
  );
}

export async function runBuilderAction(
  environment: BuilderEnvironment,
  action: BuilderAction,
): Promise<BuilderWorkspace> {
  return unwrap(await runBuilderActionAction(reference(environment), action));
}

export async function bootstrapFromFile(
  environment: BuilderEnvironment,
  file: File,
): Promise<BuilderWorkspace> {
  const data = new FormData();
  data.set("file", file);
  return unwrap(
    await bootstrapBuilderFromFileAction(reference(environment), data),
  );
}

export async function convertArticleImageToJpeg(
  environment: BuilderEnvironment,
  imageId: string,
): Promise<BuilderWorkspace> {
  return unwrap(
    await convertArticleImageToJpegAction(reference(environment), { imageId }),
  );
}

export async function uploadArticleImages(
  environment: BuilderEnvironment,
  files: File[],
): Promise<BuilderWorkspace> {
  const data = new FormData();
  files.forEach((file) => data.append("files", file));
  return unwrap(
    await uploadBuilderArticleImagesAction(reference(environment), data),
  );
}

export async function reorderArticleImages(
  environment: BuilderEnvironment,
  orderedImageIds: string[],
): Promise<BuilderWorkspace> {
  return unwrap(
    await reorderBuilderArticleImagesAction(reference(environment), {
      orderedImageIds,
    }),
  );
}

export async function removeArticleImage(
  environment: BuilderEnvironment,
  imageId: string,
): Promise<BuilderWorkspace> {
  return unwrap(
    await removeBuilderArticleImageAction(reference(environment), { imageId }),
  );
}

export async function uploadReferences(
  environment: BuilderEnvironment,
  files: File[],
): Promise<BuilderWorkspace> {
  const data = new FormData();
  files.forEach((file) => data.append("files", file));
  return unwrap(
    await uploadBuilderReferencesAction(reference(environment), data),
  );
}

export async function getUploadPreview(
  environment: BuilderEnvironment,
  uploadId: string,
  index: number,
): Promise<ReferenceUploadPreview> {
  return unwrap(
    await getBuilderUploadPreviewAction(reference(environment), {
      uploadId,
      index,
    }),
  );
}

export async function refineBuilder(
  environment: BuilderEnvironment,
  input: Omit<RefineRequest, "environment">,
  options: Readonly<{ signal?: AbortSignal }> = {},
): Promise<BuilderWorkspace> {
  const response = await fetch("/api/builder/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ environment: reference(environment), input }),
    signal: options.signal,
  });
  const result = (await response.json()) as ActionResult<BuilderWorkspace>;
  return unwrap(result);
}
