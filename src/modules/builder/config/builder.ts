const uploads = Object.freeze({
  maxFilesPerMessage: 10,
  maxBytesPerFile: 20 * 1024 * 1024,
  maxBytesPerMessage: 50 * 1024 * 1024,
  maxBytesPerChat: 500 * 1024 * 1024,
  maxImageBytesPerModelRequest: 20 * 1024 * 1024,
  maxExtractedReferenceCharacters: 400_000,
  referenceExtensions: [
    ".html",
    ".htm",
    ".txt",
    ".md",
    ".pdf",
    ".docx",
    ".css",
    ".js",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
  ] as const,
  imageExtensions: [
    ".avif",
    ".bmp",
    ".gif",
    ".heic",
    ".heif",
    ".jpg",
    ".jpeg",
    ".png",
    ".svg",
    ".tif",
    ".tiff",
    ".webp",
  ] as const,
  bootstrapExtensions: [".html", ".htm", ".docx"] as const,
});

const context = Object.freeze({
  maxContextTokens: 128_000,
  reservedOutputTokens: 16_000,
  maxCompactMemoryCharacters: 4_000,
  warningRatio: 0.8,
  retainedTurnsAfterCompaction: 8,
  estimatedCharactersPerToken: 4,
  estimatedTokensPerItem: 8,
});

const document = Object.freeze({
  maxSourceBytes: 4 * 1024 * 1024,
});

const preview = Object.freeze({
  sandboxTokens: ["allow-scripts"] as const,
  referrerPolicy: "no-referrer" as const,
});

/** Single UI/server source for all product-level limits and security toggles. */
export const BUILDER_LIMITS = Object.freeze({
  uploads,
  context,
  document,
  preview,
});

export const BUILDER_UPLOAD_LIMITS = BUILDER_LIMITS.uploads;
export const BUILDER_CONTEXT_LIMITS = BUILDER_LIMITS.context;
export const BUILDER_DOCUMENT_LIMITS = BUILDER_LIMITS.document;
