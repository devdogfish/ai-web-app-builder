export interface ArticleImage {
  id: string;
  articleId: string;
  position: number;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  needsUpload: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticleImageBinary extends ArticleImage {
  bytes: Uint8Array;
}

export interface NewArticleImage {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

/**
 * CMS transport seam. In the Builder, call this through
 * `uploadProductionImage` so website conversion and format rules run first.
 * The host owns authentication, retries, and upload acknowledgement.
 */
export interface ArticleImageCmsUploader {
  upload(input: {
    image: ArticleImageBinary;
    productionPath: string;
  }): Promise<void>;
}

export interface ArticleImageManagerItem extends ArticleImage {
  databasePreviewUrl: string;
  productionFilename: string;
}
