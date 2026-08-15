import "server-only";

import type { ArticleWorkspace } from "@/modules/builder/db";
import type { BuilderWorkspace } from "./contracts";
import type { ArticleImage } from "@/modules/article-images";
import {
  compactedConversationBoundary,
  estimateTokens,
} from "@/modules/builder/content";
import { resolveEnvironmentReference } from "@/modules/builder/environment/server";
import type {
  BuilderEnvironment,
  EnvironmentReference,
} from "@/modules/builder/environment/types";
import { assertWorkspaceEnvironment } from "@/modules/builder/environment/ownership";
import { resolveVersionSummary } from "./version-summary";
import {
  deriveAssetPath,
  replaceAssetExtension,
  resolveAssetUrl,
} from "@/modules/builder/content";
import {
  getArticleAssetContext,
  getWebsiteConfig,
} from "@/modules/builder/environment/websites";
import { articleImagePreviewUrl } from "./article-image-preview-url";

export { assertWorkspaceEnvironment } from "@/modules/builder/environment/ownership";

export function resolveRequestEnvironment(
  reference: EnvironmentReference,
): BuilderEnvironment {
  resolveEnvironmentReference(reference);
  return reference;
}

export function emptyWorkspace(
  environment: BuilderEnvironment,
): BuilderWorkspace {
  return {
    environment,
    needsBootstrap: true,
    chatId: null,
    articleHtml: "",
    currentVersionId: null,
    messages: [],
    versions: [],
    uploads: [],
    articleImages: [],
    compactMemoryTokenEstimate: 0,
    compactedThroughMessageId: null,
    hostSyncPending: false,
  };
}

export function toBuilderWorkspace(
  environment: BuilderEnvironment,
  workspace: ArticleWorkspace | null,
  articleImages: readonly ArticleImage[] = [],
): BuilderWorkspace {
  if (!workspace) return emptyWorkspace(environment);
  assertWorkspaceEnvironment(workspace, environment);

  return {
    environment,
    needsBootstrap: false,
    chatId: workspace.chat.id,
    articleHtml: workspace.article.html,
    currentVersionId: workspace.chat.currentVersionId,
    messages: workspace.messages.map((message) => ({
      id: message.id,
      role: message.role,
      kind: message.kind,
      content: message.content,
      status: message.status,
      versionId:
        workspace.versions.find((version) => version.messageId === message.id)
          ?.id ?? null,
      uploadIds: workspace.uploads
        .filter((upload) => upload.messageId === message.id)
        .map((upload) => upload.id),
      errorCode: message.errorCode,
      durationMs: message.durationMs,
      thinkingMs: message.thinkingMs,
      createdAt: message.createdAt.toISOString(),
    })),
    versions: workspace.versions.map((version) => ({
      id: version.id,
      number: version.number,
      parentVersionId: version.parentVersionId,
      content: version.html,
      summary: resolveVersionSummary(version, workspace.versions),
      source: version.source,
      sha256: version.sha256,
      createdAt: version.createdAt.toISOString(),
    })),
    uploads: workspace.uploads.map((upload) => ({
      id: upload.id,
      name: upload.name,
      mimeType: upload.mediaType,
      size: upload.sizeBytes,
      status: "ready",
      contextTokenEstimate:
        estimateTokens(
          upload.extractedText ??
            `Binary reference: ${upload.name} (${upload.mediaType}).`,
        ) + (isModelImage(upload.name) ? 256 : 0),
      createdAt: upload.createdAt.toISOString(),
    })),
    articleImages: articleImages.map((image) => {
      const website = getWebsiteConfig(environment.website);
      const extension =
        image.mediaType === "image/png"
          ? "png"
          : image.mediaType === "image/jpeg"
            ? "jpg"
            : "webp";
      const productionPath = replaceAssetExtension(
        deriveAssetPath(
          website.assetPolicy,
          getArticleAssetContext(environment),
          image.position,
        ),
        extension,
      );
      return {
        id: image.id,
        position: image.position,
        originalName: image.originalName,
        mediaType: image.mediaType,
        sizeBytes: image.sizeBytes,
        needsUpload: image.needsUpload,
        productionPath,
        productionUrl: resolveAssetUrl(website.assetPolicy, productionPath),
        databasePreviewUrl: articleImagePreviewUrl(
          environment.articleId,
          image.id,
        ),
        canConvertPngToJpeg:
          environment.website === "cmweb" && image.mediaType === "image/png",
      };
    }),
    compactMemoryTokenEstimate: estimateTokens(
      workspace.chat.compactMemory ?? "",
    ),
    compactedThroughMessageId: compactedConversationBoundary(
      workspace.chat.compactMemory,
    ),
    hostSyncPending: workspace.hostSyncPending,
  };
}

function isModelImage(name: string): boolean {
  return /\.(?:png|jpe?g|webp|gif)$/i.test(name);
}
