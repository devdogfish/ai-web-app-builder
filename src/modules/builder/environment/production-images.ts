import sharp from "sharp";

import type {
  ArticleImageBinary,
  ArticleImageCmsUploader,
  NewArticleImage,
} from "../../article-images/contracts";

import type { Website } from "./types";
import { getWebsiteConfig } from "./websites";

export class ProductionImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionImageError";
  }
}

export interface PreparedProductionImage {
  image: ArticleImageBinary;
  extension: "webp" | "jpg" | "png";
  warnings: readonly string[];
}

export interface PreparedNewArticleImage {
  image: NewArticleImage;
  extension: "webp" | "jpg" | "png";
  warnings: readonly string[];
}

export interface ProductionImageOptions {
  convertPngToJpeg?: boolean;
}

export interface ProductionImageUploadResult extends PreparedProductionImage {
  productionPath: string;
}

export async function prepareProductionImage(
  website: Website,
  image: ArticleImageBinary,
  options: ProductionImageOptions = {},
): Promise<PreparedProductionImage> {
  const prepared = await prepareNewArticleImage(
    website,
    {
      name: image.originalName,
      mediaType: image.mediaType,
      bytes: image.bytes,
    },
    options,
  );
  return {
    image: withFile(image, prepared.image.bytes, prepared.image.mediaType),
    extension: prepared.extension,
    warnings: prepared.warnings,
  };
}

export async function prepareNewArticleImage(
  website: Website,
  image: NewArticleImage,
  options: ProductionImageOptions = {},
): Promise<PreparedNewArticleImage> {
  const config = getWebsiteConfig(website);
  const input = sharp(image.bytes, { animated: true });
  const metadata = await input.metadata().catch(() => null);

  if (!metadata?.format) {
    throw new ProductionImageError(`${image.name} is not a valid image.`);
  }

  if (config.imagePolicy.handling === "convert-to-webp") {
    const bytes = new Uint8Array(await input.webp().toBuffer());
    return {
      image: withNewFile(image, bytes, "image/webp"),
      extension: "webp",
      warnings: [],
    };
  }

  if (metadata.format === "jpeg") {
    return {
      image: withNewFile(image, image.bytes, "image/jpeg"),
      extension: "jpg",
      warnings: [],
    };
  }

  if (metadata.format === "png" && !options.convertPngToJpeg) {
    return {
      image: withNewFile(image, image.bytes, "image/png"),
      extension: "png",
      warnings: [
        `${image.name} is a PNG. CMWeb allows PNG, but JPEG is strongly recommended.`,
      ],
    };
  }

  const bytes = new Uint8Array(await input.jpeg().toBuffer());
  return {
    image: withNewFile(image, bytes, "image/jpeg"),
    extension: "jpg",
    warnings: [],
  };
}

export async function uploadProductionImage(input: {
  website: Website;
  image: ArticleImageBinary;
  productionPath: string;
  uploader: ArticleImageCmsUploader;
}): Promise<ProductionImageUploadResult> {
  const prepared = await prepareProductionImage(input.website, input.image);
  const productionPath = withExtension(
    input.productionPath,
    prepared.extension,
  );
  await input.uploader.upload({ image: prepared.image, productionPath });
  return { ...prepared, productionPath };
}

function withFile(
  image: ArticleImageBinary,
  bytes: Uint8Array,
  mediaType: string,
): ArticleImageBinary {
  return {
    ...image,
    mediaType,
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

function withNewFile(
  image: NewArticleImage,
  bytes: Uint8Array,
  mediaType: string,
): NewArticleImage {
  return { ...image, bytes, mediaType };
}

function withExtension(path: string, extension: string): string {
  return /\.[^./]+$/.test(path)
    ? path.replace(/\.[^./]+$/, `.${extension}`)
    : `${path}.${extension}`;
}
