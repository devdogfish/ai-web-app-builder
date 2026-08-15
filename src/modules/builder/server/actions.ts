"use server";

import { z } from "zod";

import {
  BUILDER_DOCUMENT_LIMITS,
  BUILDER_UPLOAD_LIMITS,
} from "../config/builder";
import {
  convertSourceToHtml,
  deriveAssetPath,
  prepareBootstrapHtml,
  replaceAssetExtension,
} from "../content";
import { ArticleImageRepository } from "../../article-images/repository";
import type {
  BuilderAction,
  BuilderWorkspace,
  RefineRequest,
  ReferenceUploadPreview,
} from "../core/contracts";
import {
  assertWorkspaceEnvironment,
  builderArticleImageSources,
  toBuilderWorkspace,
} from "../core/server";
import { getArticleRepository } from "../db/server";
import { getArticleIntegration } from "../environment/article-integration";
import { flushHostSync } from "../environment/host-sync";
import {
  prepareNewArticleImage,
  prepareProductionImage,
} from "../environment/production-images";
import { resolveAuthorizedEnvironment } from "../environment/request-resolver";
import type {
  BuilderEnvironment,
  EnvironmentReference,
} from "../environment/types";
import {
  getArticleAssetContext,
  getWebsiteConfig,
} from "../environment/websites";
import { publicBuilderError } from "./errors";
import { runBuilderRefinement } from "./refinement";
import {
  compileBuilderPreviewSource,
  formatBuilderSourceDraft,
  prepareHistoricalSourceForRestore,
  prepareManagedSourceForSave,
} from "./component-integration";
import {
  assertValidBootstrapDocument,
  assertValidArticleImageUploads,
  assertValidReferenceUploads,
  buildModelUploadText,
  fileExtension,
  serializeModelUpload,
} from "../uploads";
import { getUploadStore } from "../uploads/storage";

export type ActionResult<T> =
  Readonly<{ ok: true; data: T }> | Readonly<{ ok: false; error: string }>;

const environmentSchema = z.object({
  articleId: z.string().trim().min(1).max(256),
  articleTitle: z.string().trim().min(1).max(500),
  articleSlug: z.string().trim().min(1).max(500),
  website: z.enum(["rbccm", "cmweb"]),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("apply-source"),
    content: z.string().max(BUILDER_DOCUMENT_LIMITS.maxSourceBytes),
  }),
  z.object({
    type: z.literal("rewind"),
    versionId: z.string().trim().min(1).max(256),
  }),
  z.object({ type: z.literal("start-new-session") }),
  z.object({
    type: z.literal("bootstrap"),
    method: z.enum(["blank", "html-paste"]),
    content: z.string().max(BUILDER_DOCUMENT_LIMITS.maxSourceBytes).optional(),
  }),
]);

const uploadPreviewSchema = z.object({
  uploadId: z.string().trim().min(1).max(256),
  index: z.number().int().min(1).max(BUILDER_UPLOAD_LIMITS.maxFilesPerMessage),
});

const imageMutationSchema = z.object({
  imageId: z.string().trim().min(1).max(256),
});

const imageOrderSchema = z.object({
  orderedImageIds: z.array(z.string().trim().min(1).max(256)).max(1_000),
});

const articleSourceSchema = z
  .string()
  .max(BUILDER_DOCUMENT_LIMITS.maxSourceBytes);

export async function formatBuilderArticleSourceAction(
  source: string,
): Promise<ActionResult<string>> {
  return result(() =>
    formatBuilderSourceDraft(articleSourceSchema.parse(source)),
  );
}

export async function compileBuilderPreviewAction(
  reference: EnvironmentReference,
  source: string,
): Promise<ActionResult<string>> {
  return result(async () => {
    await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "read",
    );
    return compileBuilderPreviewSource(articleSourceSchema.parse(source));
  });
}

export async function getBuilderWorkspaceAction(
  reference: EnvironmentReference,
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "read",
    );
    const repository = getArticleRepository();
    let workspace = repository.getWorkspace(environment.articleId);
    if (!workspace) {
      const existingHtml =
        await getArticleIntegration().getInitialArticleHtml(environment);
      if (existingHtml) {
        const prepared = await prepareManagedSourceForSave(existingHtml, {
          availableImageSources: currentArticleImageSources(
            environment,
            repository,
          ),
        });
        workspace = repository.bootstrapArticle({
          article: articleRecord(environment),
          html: prepared.source,
          hostHtml: prepared.compiledHtml,
        });
      }
    }
    if (workspace) {
      await flushHostSync(environment);
      workspace = repository.getWorkspace(environment.articleId);
    }
    return builderWorkspace(environment, repository, workspace);
  });
}

export async function runBuilderActionAction(
  reference: EnvironmentReference,
  action: BuilderAction,
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "mutate",
    );
    const website = getWebsiteConfig(environment.website);
    const article = getArticleAssetContext(environment);
    const input = actionSchema.parse(action);
    const repository = getArticleRepository();
    const availableImageSources = currentArticleImageSources(
      environment,
      repository,
    );
    const existingWorkspace = repository.getWorkspace(environment.articleId);
    if (existingWorkspace) {
      assertWorkspaceEnvironment(existingWorkspace, environment);
    }

    switch (input.type) {
      case "apply-source": {
        if (!existingWorkspace) {
          throw new BuilderActionError("Bootstrap the Builder Chat first.");
        }
        const applied = await prepareManagedSourceForSave(input.content, {
          availableImageSources,
          previousSource: existingWorkspace.currentVersion.html,
        });
        repository.applySource({
          articleId: environment.articleId,
          html: applied.source,
          hostHtml: applied.compiledHtml,
        });
        break;
      }
      case "rewind": {
        if (!existingWorkspace) {
          throw new BuilderActionError("Bootstrap the Builder Chat first.");
        }
        const target = existingWorkspace.versions.find(
          (version) => version.id === input.versionId,
        );
        if (!target) throw new BuilderActionError("Version not found.");
        const restored = await prepareHistoricalSourceForRestore(
          target.html,
          availableImageSources,
        );
        repository.rewind({
          articleId: environment.articleId,
          versionId: input.versionId,
          html: restored.source,
          hostHtml: restored.compiledHtml,
        });
        break;
      }
      case "start-new-session": {
        const current = repository.getWorkspace(environment.articleId);
        if (!current)
          throw new BuilderActionError("No active Builder Chat exists.");
        if (!(await flushHostSync(environment))) {
          throw new BuilderActionError(
            "Host Article HTML sync is pending. Retry before starting a new session.",
          );
        }
        const storageKeys = current.uploads.map((upload) => upload.storageKey);
        repository.startNewSession(environment.articleId);
        await Promise.all(
          storageKeys.map((key) => getUploadStore().remove(key)),
        );
        break;
      }
      case "bootstrap": {
        const raw = input.method === "blank" ? "" : (input.content ?? "");
        const html =
          input.method === "blank"
            ? ""
            : await prepareBootstrapHtml({
                html: raw,
                assetPolicy: website.assetPolicy,
                article,
              });
        const prepared =
          input.method === "blank"
            ? { source: "", compiledHtml: "" }
            : await prepareManagedSourceForSave(html, {
                availableImageSources,
              });
        repository.bootstrapArticle({
          article: articleRecord(environment),
          html: prepared.source,
          hostHtml: prepared.compiledHtml,
          replaceEmptySession: input.method !== "blank",
          initialMessage:
            input.method === "html-paste"
              ? {
                  content: "Start with this HTML.",
                  uploads: [],
                }
              : undefined,
        });
        break;
      }
    }

    const updatedWorkspace = repository.getWorkspace(environment.articleId);
    if (!updatedWorkspace) {
      throw new BuilderActionError(
        "The updated Builder Chat could not be loaded.",
      );
    }
    await flushHostSync(environment);
    return builderWorkspace(environment, repository);
  });
}

export async function bootstrapBuilderFromFileAction(
  reference: EnvironmentReference,
  data: FormData,
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "bootstrap",
    );
    const website = getWebsiteConfig(environment.website);
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new BuilderActionError("A Bootstrap file is required.");
    }
    assertValidBootstrapDocument(file);
    const kind = fileExtension(file.name) === ".docx" ? "docx" : "html";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const converted = await convertSourceToHtml({
      kind,
      bytes,
      fileName: file.name,
    });
    const preparedImages = await Promise.all(
      converted.images.map((image) =>
        prepareNewArticleImage(environment.website, image),
      ),
    );
    const article = getArticleAssetContext(environment);
    const imagePaths = preparedImages.map((image, index) =>
      replaceAssetExtension(
        deriveAssetPath(website.assetPolicy, article, index + 1),
        image.extension,
      ),
    );
    const html = await prepareBootstrapHtml({
      html: converted.html,
      assetPolicy: website.assetPolicy,
      article,
      imagePaths: kind === "docx" ? imagePaths : undefined,
    });
    const preparedSource = await prepareManagedSourceForSave(html, {
      availableImageSources: new Set(imagePaths),
    });

    const repository = getArticleRepository();
    const existingWorkspace = repository.getWorkspace(environment.articleId);
    if (existingWorkspace) {
      assertWorkspaceEnvironment(existingWorkspace, environment);
    }
    const storedUploads: Array<{
      name: string;
      mediaType: string;
      sizeBytes: number;
      storageKey: string;
      extractedText?: string;
    }> = [];
    try {
      const sourceStorageKey = await getUploadStore().put({
        name: file.name,
        bytes,
      });
      storedUploads.push({
        name: file.name,
        mediaType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        storageKey: sourceStorageKey,
        extractedText: preparedSource.source,
      });
      for (const image of converted.images) {
        const imageStorageKey = await getUploadStore().put({
          name: image.name,
          bytes: image.bytes,
        });
        storedUploads.push({
          name: image.name,
          mediaType: image.mediaType,
          sizeBytes: image.bytes.byteLength,
          storageKey: imageStorageKey,
        });
      }

      const imageRepository = new ArticleImageRepository(repository.sqlite);
      const messageContent =
        kind === "docx"
          ? "Start with this Word document."
          : "Start with this HTML document.";
      const workspace = repository.db.transaction(() => {
        const bootstrapped = repository.bootstrapArticle({
          article: articleRecord(environment),
          html: preparedSource.source,
          hostHtml: preparedSource.compiledHtml,
          initialMessage: {
            content: messageContent,
            uploads: storedUploads,
          },
          replaceEmptySession: true,
        });
        const initialMessage = bootstrapped.messages.find(
          (message) =>
            message.role === "user" && message.content === messageContent,
        );
        const attachedStorageKeys = new Set(
          bootstrapped.uploads
            .filter((upload) => upload.messageId === initialMessage?.id)
            .map((upload) => upload.storageKey),
        );
        if (
          !initialMessage ||
          storedUploads.some(
            (upload) => !attachedStorageKeys.has(upload.storageKey),
          )
        ) {
          throw new BuilderActionError(
            "The bootstrap message and attachments could not be saved. Retry the import.",
          );
        }
        if (
          preparedImages.length > 0 &&
          imageRepository.list(environment.articleId).length === 0
        ) {
          imageRepository.add(
            environment.articleId,
            preparedImages.map((prepared) => prepared.image),
          );
        }
        return bootstrapped;
      });
      const attachedStorageKeys = new Set(
        workspace.uploads.map((upload) => upload.storageKey),
      );
      await Promise.all(
        storedUploads
          .filter((upload) => !attachedStorageKeys.has(upload.storageKey))
          .map((upload) => getUploadStore().remove(upload.storageKey)),
      );
    } catch (error) {
      await Promise.all(
        storedUploads.map((upload) =>
          getUploadStore().remove(upload.storageKey),
        ),
      );
      throw error;
    }
    await flushHostSync(environment);
    return builderWorkspace(environment, repository);
  });
}

export async function convertArticleImageToJpegAction(
  reference: EnvironmentReference,
  request: { imageId: string },
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "mutate",
    );
    if (environment.website !== "cmweb") {
      throw new BuilderActionError(
        "PNG-to-JPEG conversion is available only for CMWeb images.",
      );
    }
    const { imageId } = imageMutationSchema.parse(request);
    const repository = getArticleRepository();
    const workspace = repository.getWorkspace(environment.articleId);
    if (!workspace) throw new BuilderActionError("The Article is unavailable.");
    assertWorkspaceEnvironment(workspace, environment);

    const imageRepository = new ArticleImageRepository(repository.sqlite);
    const image = imageRepository.getBinary(environment.articleId, imageId);
    if (image.mediaType !== "image/png") {
      throw new BuilderActionError("Only PNG images can be converted to JPEG.");
    }
    const productionPrepared = await prepareProductionImage("cmweb", image, {
      convertPngToJpeg: true,
    });
    const website = getWebsiteConfig(environment.website);
    const basePath = deriveAssetPath(
      website.assetPolicy,
      getArticleAssetContext(environment),
      image.position,
    );
    const pngPath = replaceAssetExtension(basePath, "png");
    const jpegPath = replaceAssetExtension(basePath, "jpg");
    if (!workspace.currentVersion.html.includes(pngPath)) {
      throw new BuilderActionError(
        "The current Article source no longer contains this PNG path.",
      );
    }

    const nextSource = workspace.currentVersion.html.replaceAll(
      pngPath,
      jpegPath,
    );
    const availableImageSources = new Set(
      currentArticleImageSources(environment, repository),
    );
    availableImageSources.delete(pngPath);
    availableImageSources.add(jpegPath);
    const sourcePrepared = await prepareManagedSourceForSave(nextSource, {
      availableImageSources,
      previousSource: workspace.currentVersion.html,
    });
    repository.db.transaction(() => {
      imageRepository.replaceBinary(environment.articleId, imageId, {
        name: image.originalName,
        mediaType: productionPrepared.image.mediaType,
        bytes: productionPrepared.image.bytes,
      });
      repository.applySource({
        articleId: environment.articleId,
        html: sourcePrepared.source,
        hostHtml: sourcePrepared.compiledHtml,
      });
    });
    await flushHostSync(environment);
    return builderWorkspace(environment, repository);
  });
}

export async function uploadBuilderArticleImagesAction(
  reference: EnvironmentReference,
  data: FormData,
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "mutate",
    );
    const files = data
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      throw new BuilderActionError("Select at least one image.");
    }
    assertValidArticleImageUploads(files);

    const repository = getArticleRepository();
    const workspace = repository.getWorkspace(environment.articleId);
    if (!workspace) {
      throw new BuilderActionError(
        "Bootstrap the Builder Chat before adding Article Images.",
      );
    }
    assertWorkspaceEnvironment(workspace, environment);

    const prepared = await Promise.all(
      files.map(async (file) =>
        prepareNewArticleImage(environment.website, {
          name: file.name,
          mediaType: file.type || "application/octet-stream",
          bytes: new Uint8Array(await file.arrayBuffer()),
        }),
      ),
    );
    new ArticleImageRepository(repository.sqlite).add(
      environment.articleId,
      prepared.map((item) => item.image),
    );
    return builderWorkspace(environment, repository);
  });
}

export async function reorderBuilderArticleImagesAction(
  reference: EnvironmentReference,
  request: { orderedImageIds: string[] },
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "mutate",
    );
    const { orderedImageIds } = imageOrderSchema.parse(request);
    const repository = getArticleRepository();
    const workspace = repository.getWorkspace(environment.articleId);
    if (!workspace) throw new BuilderActionError("The Article is unavailable.");
    assertWorkspaceEnvironment(workspace, environment);
    new ArticleImageRepository(repository.sqlite).reorder(
      environment.articleId,
      orderedImageIds,
    );
    return builderWorkspace(environment, repository);
  });
}

export async function removeBuilderArticleImageAction(
  reference: EnvironmentReference,
  request: { imageId: string },
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "mutate",
    );
    const { imageId } = imageMutationSchema.parse(request);
    const repository = getArticleRepository();
    const workspace = repository.getWorkspace(environment.articleId);
    if (!workspace) throw new BuilderActionError("The Article is unavailable.");
    assertWorkspaceEnvironment(workspace, environment);
    new ArticleImageRepository(repository.sqlite).remove(
      environment.articleId,
      imageId,
    );
    return builderWorkspace(environment, repository);
  });
}

export async function uploadBuilderReferencesAction(
  reference: EnvironmentReference,
  data: FormData,
): Promise<ActionResult<BuilderWorkspace>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "upload",
    );
    const files = data
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (files.length === 0) {
      throw new BuilderActionError("Select at least one Reference Upload.");
    }
    assertValidReferenceUploads(files);

    const repository = getArticleRepository();
    const currentWorkspace = repository.getWorkspace(environment.articleId);
    if (!currentWorkspace) {
      throw new BuilderActionError(
        "Bootstrap the Builder Chat before adding Reference Uploads.",
      );
    }
    assertWorkspaceEnvironment(currentWorkspace, environment);
    const existingBytes = currentWorkspace.uploads.reduce(
      (total, upload) => total + upload.sizeBytes,
      0,
    );
    const incomingBytes = files.reduce((total, file) => total + file.size, 0);
    if (existingBytes + incomingBytes > BUILDER_UPLOAD_LIMITS.maxBytesPerChat) {
      throw new BuilderActionError(
        "This Builder Chat exceeds the 500 MB Reference Upload limit.",
      );
    }

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const key = await getUploadStore().put({ name: file.name, bytes });
      try {
        repository.addUpload({
          articleId: environment.articleId,
          name: file.name,
          mediaType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          storageKey: key,
          extractedText: await extractReferenceText(file.name, bytes),
        });
      } catch (error) {
        await getUploadStore().remove(key);
        throw error;
      }
    }

    return builderWorkspace(environment, repository);
  });
}

export async function getBuilderUploadPreviewAction(
  reference: EnvironmentReference,
  request: { uploadId: string; index: number },
): Promise<ActionResult<ReferenceUploadPreview>> {
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "read",
    );
    const input = uploadPreviewSchema.parse(request);
    const workspace = getArticleRepository().getWorkspace(
      environment.articleId,
    );
    if (!workspace) {
      throw new BuilderActionError("The attachment is unavailable.");
    }
    assertWorkspaceEnvironment(workspace, environment);
    const upload = workspace.uploads.find(
      (candidate) => candidate.id === input.uploadId,
    );
    if (!upload) {
      throw new BuilderActionError("The attachment is unavailable.");
    }

    const extension = fileExtension(upload.name);
    const kind =
      extension === ".docx"
        ? "docx"
        : isModelImage(upload.name)
          ? "image"
          : "text";
    const expectedAssetPath =
      kind === "image"
        ? deriveAssetPath(
            getWebsiteConfig(environment.website).assetPolicy,
            getArticleAssetContext(environment),
            input.index,
          )
        : undefined;
    const text = buildModelUploadText(upload, expectedAssetPath);
    const stored =
      kind === "docx" || kind === "image"
        ? await getUploadStore().get(upload.storageKey)
        : null;

    return {
      id: upload.id,
      name: upload.name,
      mimeType: upload.mediaType,
      size: upload.sizeBytes,
      kind,
      modelPayload: serializeModelUpload({
        id: upload.id,
        index: input.index,
        name: upload.name,
        mediaType: upload.mediaType,
        text,
      }),
      rawBytes: stored ? new Uint8Array(stored.bytes) : null,
    };
  });
}

export async function refineBuilderAction(
  reference: EnvironmentReference,
  request: Omit<RefineRequest, "environment">,
): Promise<ActionResult<BuilderWorkspace>> {
  return result(() => runBuilderRefinement(reference, request));
}

async function result<T>(
  operation: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

function currentArticleImageSources(
  environment: BuilderEnvironment,
  repository: ReturnType<typeof getArticleRepository>,
): ReadonlySet<string> {
  return builderArticleImageSources(
    environment,
    new ArticleImageRepository(repository.sqlite).list(environment.articleId),
  );
}

function builderWorkspace(
  environment: BuilderEnvironment,
  repository: ReturnType<typeof getArticleRepository>,
  workspace = repository.getWorkspace(environment.articleId),
): BuilderWorkspace {
  const images = workspace
    ? new ArticleImageRepository(repository.sqlite).list(environment.articleId)
    : [];
  return toBuilderWorkspace(environment, workspace, images);
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Invalid Builder request.";
  }
  if (error instanceof BuilderActionError) return error.message;
  return publicBuilderError(error, {
    fallback: "The Builder request failed.",
    context: "Builder Server Action failed.",
  });
}

class BuilderActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuilderActionError";
  }
}

function articleRecord(environment: BuilderEnvironment) {
  const website = getWebsiteConfig(environment.website);
  return {
    id: environment.articleId,
    website: website.storageWebsite,
    articleType: website.storageArticleType,
    title: environment.articleTitle,
  };
}

async function extractReferenceText(
  name: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const extension = fileExtension(name);
  let extracted: string | null = null;
  if (extension === ".docx") {
    extracted = (
      await convertSourceToHtml({ kind: "docx", bytes, fileName: name })
    ).html;
  } else if (extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      extracted = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (TEXT_EXTENSIONS.has(extension)) {
    extracted = new TextDecoder().decode(bytes);
  }
  if (!extracted) return null;
  const limit = BUILDER_UPLOAD_LIMITS.maxExtractedReferenceCharacters;
  return extracted.length <= limit
    ? extracted
    : `${extracted.slice(0, limit)}\n\n[Reference extract truncated at ${limit} characters.]`;
}

function isModelImage(name: string): boolean {
  return MODEL_IMAGE_EXTENSIONS.has(fileExtension(name));
}

const TEXT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".txt",
  ".md",
  ".css",
  ".js",
  ".svg",
]);

const MODEL_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);
