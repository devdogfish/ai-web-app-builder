import { Buffer } from "node:buffer";

import type { ArticleAssetContext, WebsiteAssetPolicy } from "./assets";
import { formatArticleHtml } from "./format";
import { sanitizeBootstrapHtml } from "./sanitize";
import { assertValidArticleSource } from "./validate";

export type BootstrapSourceKind = "html" | "docx";

export interface SourceConversionInput {
  kind: BootstrapSourceKind;
  bytes: Uint8Array | ArrayBuffer;
  fileName?: string;
}

export interface SourceConversionResult {
  html: string;
  warnings: string[];
  images: ExtractedSourceImage[];
}

export interface ExtractedSourceImage {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

export interface SourceConverter {
  readonly kind: BootstrapSourceKind;
  convert(input: SourceConversionInput): Promise<SourceConversionResult>;
}

function asNodeBuffer(bytes: Uint8Array | ArrayBuffer): Buffer {
  return bytes instanceof Uint8Array
    ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : Buffer.from(bytes);
}

export const htmlSourceConverter: SourceConverter = {
  kind: "html",
  async convert(input) {
    return {
      html: new TextDecoder("utf-8").decode(input.bytes),
      warnings: [],
      images: [],
    };
  },
};

export const docxSourceConverter: SourceConverter = {
  kind: "docx",
  async convert(input) {
    const mammothModule = await import("mammoth");
    const mammoth = mammothModule.default;
    const images: ExtractedSourceImage[] = [];
    const result = await mammoth.convertToHtml(
      { buffer: asNodeBuffer(input.bytes) },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const position = images.length + 1;
          const mediaType = normalizeImageMediaType(image.contentType);
          const name = embeddedImageName(input.fileName, position, mediaType);
          const imageIndex = images.length;
          images.push({ name, mediaType, bytes: new Uint8Array() });
          const bytes = new Uint8Array(await image.readAsArrayBuffer());
          images[imageIndex] = { name, mediaType, bytes };
          return { src: `bootstrap-image-${position}` };
        }),
        externalFileAccess: false,
      },
    );
    return {
      html: result.value,
      warnings: result.messages.map((message) => message.message),
      images,
    };
  },
};

function normalizeImageMediaType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("image/")
    ? normalized
    : "application/octet-stream";
}

function embeddedImageName(
  documentName: string | undefined,
  position: number,
  mediaType: string,
): string {
  const base =
    (documentName ?? "document").replace(/\.[^.]+$/, "").trim() || "document";
  const extension = imageExtension(mediaType);
  return `${base}-image-${String(position).padStart(2, "0")}.${extension}`;
}

function imageExtension(mediaType: string): string {
  if (mediaType === "image/jpeg") return "jpg";
  const subtype = mediaType.split("/", 2)[1]?.replace(/^x-/, "");
  return subtype?.replace(/[^a-z0-9.+-]/g, "") || "bin";
}

const DEFAULT_CONVERTERS: Readonly<
  Record<BootstrapSourceKind, SourceConverter>
> = {
  html: htmlSourceConverter,
  docx: docxSourceConverter,
};

export async function convertSourceToHtml(
  input: SourceConversionInput,
  converters: Readonly<
    Record<BootstrapSourceKind, SourceConverter>
  > = DEFAULT_CONVERTERS,
): Promise<SourceConversionResult> {
  return converters[input.kind].convert(input);
}

export async function prepareBootstrapSource(
  input: SourceConversionInput,
  context: { assetPolicy: WebsiteAssetPolicy; article: ArticleAssetContext },
  converters?: Readonly<Record<BootstrapSourceKind, SourceConverter>>,
): Promise<SourceConversionResult> {
  const converted = await convertSourceToHtml(input, converters);
  return {
    ...converted,
    html: await prepareBootstrapHtml({
      html: converted.html,
      assetPolicy: context.assetPolicy,
      article: context.article,
    }),
  };
}

export async function prepareBootstrapHtml(input: {
  html: string;
  assetPolicy: WebsiteAssetPolicy;
  article: ArticleAssetContext;
  imagePaths?: readonly string[];
}): Promise<string> {
  const sanitized = sanitizeBootstrapHtml(input);
  assertValidArticleSource(sanitized);
  return formatArticleHtml(sanitized);
}
