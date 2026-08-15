"use server";

import { z } from "zod";

import {
  ARTICLE_SYSTEM_INSTRUCTIONS,
  ArticleModelError,
  createArticleModelFromEnv,
  type ArticleModelResult,
} from "../ai";
import {
  BUILDER_DOCUMENT_LIMITS,
  BUILDER_UPLOAD_LIMITS,
} from "../config/builder";
import {
  assertValidArticleSource,
  compactConversationMemory,
  compactedConversationBoundary,
  convertSourceToHtml,
  deriveAssetPath,
  formatArticleHtml,
  planModelContext,
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
import { assertWorkspaceEnvironment, toBuilderWorkspace } from "../core/server";
import type { ArticleWorkspace } from "../db";
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
  hasRefinementInput,
  resolveRefinementPrompt,
} from "../core/refinement-request";
import {
  getArticleAssetContext,
  getWebsiteConfig,
} from "../environment/websites";
import { builderErrorDetails, publicBuilderError } from "./errors";
import { getArticleRefinementCoordinator } from "./refinement-lock";
import {
  assertValidBootstrapDocument,
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

const refineSchema = z.object({
  prompt: z.string().trim().max(20_000),
  uploadIds: z.array(z.string().trim().min(1).max(256)).max(10),
  runtimeError: z.string().max(10_000).optional(),
}).superRefine((input, context) => {
  if (hasRefinementInput(input.prompt, input.uploadIds)) return;
  context.addIssue({
    code: "custom",
    path: ["prompt"],
    message: "Add a message or at least one attachment.",
  });
});

const uploadPreviewSchema = z.object({
  uploadId: z.string().trim().min(1).max(256),
  index: z.number().int().min(1).max(BUILDER_UPLOAD_LIMITS.maxFilesPerMessage),
});

const imageMutationSchema = z.object({
  imageId: z.string().trim().min(1).max(256),
});

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
        assertValidArticleSource(existingHtml);
        const formattedHtml = await formatArticleHtml(existingHtml);
        workspace = repository.bootstrapArticle({
          article: articleRecord(environment),
          html: formattedHtml,
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
    const existingWorkspace = repository.getWorkspace(environment.articleId);
    if (existingWorkspace) {
      assertWorkspaceEnvironment(existingWorkspace, environment);
    }

    switch (input.type) {
      case "apply-source":
        assertValidArticleSource(input.content);
        repository.applySource({
          articleId: environment.articleId,
          html: input.content,
        });
        break;
      case "rewind":
        repository.rewind({
          articleId: environment.articleId,
          versionId: input.versionId,
        });
        break;
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
        repository.bootstrapArticle({
          article: articleRecord(environment),
          html,
          replaceEmptySession: input.method !== "blank",
          initialMessage:
            input.method === "html-paste"
              ? {
                  content:
                    "Start with this HTML.",
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
        extractedText: html,
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
      const workspace = repository.sqlite.transaction(() => {
        const bootstrapped = repository.bootstrapArticle({
          article: articleRecord(environment),
          html,
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
      })();
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
    const prepared = await prepareProductionImage("cmweb", image, {
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

    repository.sqlite.transaction(() => {
      imageRepository.replaceBinary(environment.articleId, imageId, {
        name: image.originalName,
        mediaType: prepared.image.mediaType,
        bytes: prepared.image.bytes,
      });
      repository.applySource({
        articleId: environment.articleId,
        html: workspace.currentVersion.html.replaceAll(pngPath, jpegPath),
      });
    })();
    await flushHostSync(environment);
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
  return result(async () => {
    const environment = await resolveAuthorizedEnvironment(
      environmentSchema.parse(reference),
      "refine",
    );
    return getArticleRefinementCoordinator().run(
      environment.articleId,
      async () => {
        const website = getWebsiteConfig(environment.website);
        const article = getArticleAssetContext(environment);
        const input = refineSchema.parse(request);
        const repository = getArticleRepository();
        const workspace = repository.getWorkspace(environment.articleId);
        if (!workspace)
          throw new BuilderActionError("Bootstrap the Builder Chat first.");
        assertWorkspaceEnvironment(workspace, environment);

        const selectedRecords = input.uploadIds.map((id) => {
          const upload = workspace.uploads.find(
            (candidate) => candidate.id === id,
          );
          if (
            !upload ||
            (upload.messageId &&
              !isRetryableUpload(workspace, upload.messageId))
          ) {
            throw new BuilderActionError("A selected upload is unavailable.");
          }
          return upload;
        });
        const selectedBytes = selectedRecords.reduce(
          (total, upload) => total + upload.sizeBytes,
          0,
        );
        if (selectedBytes > BUILDER_UPLOAD_LIMITS.maxBytesPerMessage) {
          throw new BuilderActionError(
            "Selected references exceed the 50 MB per-message limit.",
          );
        }
        const selectedImageBytes = selectedRecords
          .filter((upload) => isModelImage(upload.name))
          .reduce((total, upload) => total + upload.sizeBytes, 0);
        if (
          selectedImageBytes >
          BUILDER_UPLOAD_LIMITS.maxImageBytesPerModelRequest
        ) {
          throw new BuilderActionError(
            "Selected image references exceed the 20 MB model-request limit.",
          );
        }

        const selectedUploads = await Promise.all(
          selectedRecords.map(async (upload, index) => {
            const image = isModelImage(upload.name);
            const expectedAssetPath = image
              ? deriveAssetPath(website.assetPolicy, article, index + 1)
              : undefined;
            const stored = image
              ? await getUploadStore().get(upload.storageKey)
              : undefined;
            return {
              id: upload.id,
              name: upload.name,
              mediaType: upload.mediaType,
              text: buildModelUploadText(upload, expectedAssetPath),
              dataUrl: stored
                ? `data:${imageMediaType(upload.name)};base64,${Buffer.from(stored.bytes).toString("base64")}`
                : undefined,
            };
          }),
        );
        const requestPrompt = resolveRefinementPrompt(
          input.prompt,
          input.uploadIds,
        );
        const effectivePrompt = input.runtimeError
          ? `${requestPrompt}\n\nPreview runtime error to fix:\n${input.runtimeError}`
          : requestPrompt;
        const recentTurns = workspace.messages.flatMap((message) =>
          message.role === "user" || message.role === "assistant"
            ? [{ id: message.id, role: message.role, text: message.content }]
            : [],
        );
        const compactedThroughMessageId = compactedConversationBoundary(
          workspace.chat.compactMemory,
        );
        const compactionBoundaryIndex = compactedThroughMessageId
          ? recentTurns.findIndex(
              (message) => message.id === compactedThroughMessageId,
            )
          : -1;
        const uncompactedRecentTurns = recentTurns.slice(
          compactionBoundaryIndex + 1,
        );
        const contextPlan = planModelContext({
          systemInstructions: ARTICLE_SYSTEM_INSTRUCTIONS,
          compactMemory: workspace.chat.compactMemory,
          currentRequest: effectivePrompt,
          currentDocument: workspace.currentVersion.html,
          recentMessages: uncompactedRecentTurns,
          selectedUploads,
        });
        if (contextPlan.blocked) {
          const detail = contextPlan.blockingUpload
            ? ` Remove oversized upload ${contextPlan.blockingUpload.name}.`
            : " The current Article HTML and request exceed the input budget.";
          throw new BuilderActionError(`Context cannot fit.${detail}`);
        }
        const compactMemory = compactConversationMemory(
          workspace.chat.compactMemory,
          uncompactedRecentTurns.filter((message) =>
            contextPlan.excludedMessageIds.includes(message.id),
          ),
        );

        const attachmentUploadIds = selectedRecords.map((upload) =>
          upload.messageId
            ? repository.addUpload({
                articleId: environment.articleId,
                name: upload.name,
                mediaType: upload.mediaType,
                sizeBytes: upload.sizeBytes,
                storageKey: upload.storageKey,
                extractedText: upload.extractedText,
              }).id
            : upload.id,
        );
        repository.appendMessage({
          articleId: environment.articleId,
          role: "user",
          content: input.prompt,
          uploadIds: attachmentUploadIds,
        });

        try {
          const model = createArticleModelFromEnv();
          let modelResult: ArticleModelResult | null = null;
          for await (const event of model.stream({
            currentArticleHtml: workspace.currentVersion.html,
            currentPrompt: effectivePrompt,
            selectedUploadExtracts: selectedUploads,
            recentRelevantTurns: contextPlan.messages.map((message) => ({
              role: message.role,
              content: message.text,
            })),
            compactMemory,
            environmentContext: environment,
          })) {
            if (event.type === "finish") modelResult = event.result;
          }
          if (!modelResult) {
            throw new ArticleModelError(
              "malformed_response",
              "The AI provider returned no Builder response.",
            );
          }

          if (modelResult.action === "edit") {
            const formattedArticleHtml = await formatArticleHtml(
              modelResult.articleHtml,
            );
            assertValidArticleSource(formattedArticleHtml);
            repository.commitAssistantVersion({
              articleId: environment.articleId,
              expectedChatId: workspace.chat.id,
              expectedVersionId: workspace.currentVersion.id,
              expectedVersionSha256: workspace.currentVersion.sha256,
              html: formattedArticleHtml,
              response: modelResult.response,
              summary: modelResult.summary,
            });
          } else {
            repository.commitAssistantAnswer({
              articleId: environment.articleId,
              expectedChatId: workspace.chat.id,
              expectedVersionId: workspace.currentVersion.id,
              expectedVersionSha256: workspace.currentVersion.sha256,
              response: modelResult.response,
            });
          }
          if (contextPlan.compacted) {
            repository.setCompactMemory(
              environment.articleId,
              compactMemory ?? null,
            );
          }
          if (modelResult.action === "edit") await flushHostSync(environment);
          return builderWorkspace(environment, repository);
        } catch (error) {
          const publicError = builderErrorDetails(error, {
            fallback:
              "The Builder hit an unexpected error. Retry this request.",
            context: "Builder refinement failed.",
          });
          const activeWorkspace = repository.getWorkspace(
            environment.articleId,
          );
          if (activeWorkspace?.chat.id === workspace.chat.id) {
            repository.appendMessage({
              articleId: environment.articleId,
              role: "assistant",
              content: publicError.message,
              status: "failed",
              errorCode: publicError.code,
            });
          }
          throw new BuilderActionError(publicError.message);
        }
      },
    );
  });
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

function imageMediaType(name: string): string {
  const extension = fileExtension(name);
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return `image/${extension.slice(1)}`;
}

function isRetryableUpload(
  workspace: ArticleWorkspace,
  messageId: string,
): boolean {
  const lastAssistantIndex = workspace.messages.findLastIndex(
    (message) => message.role === "assistant",
  );
  if (lastAssistantIndex < 0) return false;
  const lastAssistant = workspace.messages[lastAssistantIndex];
  if (lastAssistant.status !== "failed" && lastAssistant.status !== "stopped") {
    return false;
  }
  const precedingUser = workspace.messages
    .slice(0, lastAssistantIndex)
    .findLast((message) => message.role === "user");
  return precedingUser?.id === messageId;
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
