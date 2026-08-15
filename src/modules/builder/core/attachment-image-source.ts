import type { BuilderArticleImage } from "./contracts";

export interface AttachmentImageSources {
  remoteUrl: string;
  localUrl: string;
}

export function resolveAttachmentImageSources(
  uploadName: string | undefined,
  articleImages: readonly BuilderArticleImage[],
): AttachmentImageSources | null {
  if (!uploadName) return null;
  const image = articleImages.find(
    (candidate) => candidate.originalName === uploadName,
  );
  return image
    ? {
        remoteUrl: image.productionUrl,
        localUrl: image.databasePreviewUrl,
      }
    : null;
}
