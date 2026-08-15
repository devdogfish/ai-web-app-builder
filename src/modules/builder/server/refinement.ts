import "server-only";

import { z } from "zod";

import { ARTICLE_SYSTEM_INSTRUCTIONS } from "../ai/prompt";
import { createArticleModelFromEnv } from "../ai/server";
import { ArticleModelError, type ArticleModelResult } from "../ai/types";
import { BUILDER_UPLOAD_LIMITS } from "../config/builder";
import {
  assertValidArticleSource,
  compactConversationMemory,
  compactedConversationBoundary,
  deriveAssetPath,
  formatArticleHtml,
  planModelContext,
} from "../content";
import type { BuilderWorkspace } from "../core/contracts";
import { assertWorkspaceEnvironment, toBuilderWorkspace } from "../core/server";
import {
  hasRefinementInput,
  resolveRefinementPrompt,
} from "../core/refinement-request";
import type { ArticleWorkspace } from "../db";
import { getArticleRepository } from "../db/server";
import { flushHostSync } from "../environment/host-sync";
import { resolveAuthorizedEnvironment } from "../environment/request-resolver";
import {
  getArticleAssetContext,
  getWebsiteConfig,
} from "../environment/websites";
import { buildModelUploadText, fileExtension } from "../uploads";
import { getUploadStore } from "../uploads/storage";
import { builderErrorDetails } from "./errors";
import { getArticleRefinementCoordinator } from "./refinement-lock";

const refinementRequestSchema = z
  .object({
    environment: z.object({
      articleId: z.string().trim().min(1).max(256),
      articleTitle: z.string().trim().min(1).max(500),
      articleSlug: z.string().trim().min(1).max(500),
      website: z.enum(["rbccm", "cmweb"]),
    }),
    prompt: z.string().trim().max(20_000),
    uploadIds: z.array(z.string().trim().min(1).max(256)).max(10),
    runtimeError: z.string().max(10_000).optional(),
  })
  .superRefine((input, context) => {
    if (hasRefinementInput(input.prompt, input.uploadIds)) return;
    context.addIssue({
      code: "custom",
      path: ["prompt"],
      message: "Add a message or at least one attachment.",
    });
  });

export async function runBuilderRefinement(
  reference: unknown,
  request: unknown,
  signal?: AbortSignal,
): Promise<BuilderWorkspace> {
  const input = refinementRequestSchema.parse({
    environment: reference,
    ...(isRecord(request) ? request : {}),
  });
  const environment = await resolveAuthorizedEnvironment(
    input.environment,
    "refine",
  );

  return getArticleRefinementCoordinator().run(
    environment.articleId,
    async () => {
      const website = getWebsiteConfig(environment.website);
      const article = getArticleAssetContext(environment);
      const repository = getArticleRepository();
      const workspace = repository.getWorkspace(environment.articleId);
      if (!workspace) {
        throw new BuilderRefinementError("Bootstrap the Builder Chat first.");
      }
      assertWorkspaceEnvironment(workspace, environment);

      const selectedRecords = input.uploadIds.map((id) => {
        const upload = workspace.uploads.find(
          (candidate) => candidate.id === id,
        );
        if (
          !upload ||
          (upload.messageId && !isRetryableUpload(workspace, upload.messageId))
        ) {
          throw new BuilderRefinementError("A selected upload is unavailable.");
        }
        return upload;
      });
      const selectedBytes = selectedRecords.reduce(
        (total, upload) => total + upload.sizeBytes,
        0,
      );
      if (selectedBytes > BUILDER_UPLOAD_LIMITS.maxBytesPerMessage) {
        throw new BuilderRefinementError(
          "Selected references exceed the 50 MB per-message limit.",
        );
      }
      const selectedImageBytes = selectedRecords
        .filter((upload) => isModelImage(upload.name))
        .reduce((total, upload) => total + upload.sizeBytes, 0);
      if (
        selectedImageBytes > BUILDER_UPLOAD_LIMITS.maxImageBytesPerModelRequest
      ) {
        throw new BuilderRefinementError(
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
        throw new BuilderRefinementError(`Context cannot fit.${detail}`);
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
        throwIfCancelled(signal);
        const model = createArticleModelFromEnv();
        let modelResult: ArticleModelResult | null = null;
        for await (const event of model.stream(
          {
            currentArticleHtml: workspace.currentVersion.html,
            currentPrompt: effectivePrompt,
            selectedUploadExtracts: selectedUploads,
            recentRelevantTurns: contextPlan.messages.map((message) => ({
              role: message.role,
              content: message.text,
            })),
            compactMemory,
            environmentContext: environment,
          },
          { signal },
        )) {
          if (event.type === "finish") modelResult = event.result;
        }
        if (!modelResult) {
          throw new ArticleModelError(
            "malformed_response",
            "The AI provider returned no Builder response.",
          );
        }
        throwIfCancelled(signal);

        if (modelResult.action === "edit") {
          const formattedArticleHtml = await formatArticleHtml(
            modelResult.articleHtml,
          );
          assertValidArticleSource(formattedArticleHtml);
          throwIfCancelled(signal);
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
        return toBuilderWorkspace(
          environment,
          repository.getWorkspace(environment.articleId),
        );
      } catch (error) {
        const publicError = builderErrorDetails(error, {
          fallback: "The Builder hit an unexpected error. Retry this request.",
          context: "Builder refinement failed.",
        });
        const activeWorkspace = repository.getWorkspace(environment.articleId);
        if (activeWorkspace?.chat.id === workspace.chat.id) {
          repository.appendMessage({
            articleId: environment.articleId,
            role: "assistant",
            content: publicError.message,
            status: publicError.code === "cancelled" ? "stopped" : "failed",
            errorCode: publicError.code,
          });
        }
        if (publicError.code === "cancelled") {
          return toBuilderWorkspace(
            environment,
            repository.getWorkspace(environment.articleId),
          );
        }
        throw new BuilderRefinementError(publicError.message);
      }
    },
  );
}

export class BuilderRefinementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuilderRefinementError";
  }
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new ArticleModelError("cancelled", "Generation stopped.");
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

const MODEL_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
