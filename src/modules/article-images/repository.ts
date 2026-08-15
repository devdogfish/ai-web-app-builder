import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ArticleImage,
  ArticleImageBinary,
  NewArticleImage,
} from "./contracts";

interface ArticleImageDatabaseRow {
  id: string;
  article_id: string;
  position: number;
  original_name: string;
  media_type: string;
  size_bytes: number;
  bytes: Buffer;
  needs_upload: number;
  created_at: number;
  updated_at: number;
}

export type ArticleImageRepositoryErrorCode =
  "article_not_found" | "image_not_found" | "invalid_file" | "invalid_order";

export class ArticleImageRepositoryError extends Error {
  constructor(
    readonly code: ArticleImageRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArticleImageRepositoryError";
  }
}

export interface ArticleImageRepositoryOptions {
  createId?: () => string;
  now?: () => Date;
}

/**
 * SQLite adapter for the portable Article Images domain. Pass the host app's
 * existing connection; this class never opens or closes it.
 */
export class ArticleImageRepository {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly sqlite: Database.Database,
    options: ArticleImageRepositoryOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  list(articleId: string): ArticleImage[] {
    return this.rows(articleId).map(toArticleImage);
  }

  listNeedingUpload(articleId: string): ArticleImage[] {
    return this.rows(articleId)
      .filter((row) => row.needs_upload === 1)
      .map(toArticleImage);
  }

  getBinary(articleId: string, imageId: string): ArticleImageBinary {
    const row = this.sqlite
      .prepare(`SELECT * FROM article_images WHERE article_id = ? AND id = ?`)
      .get(articleId, imageId) as ArticleImageDatabaseRow | undefined;

    if (!row) {
      throw new ArticleImageRepositoryError(
        "image_not_found",
        `Article image ${imageId} does not exist on article ${articleId}.`,
      );
    }

    return { ...toArticleImage(row), bytes: new Uint8Array(row.bytes) };
  }

  add(articleId: string, files: readonly NewArticleImage[]): ArticleImage[] {
    if (files.length === 0) return this.list(articleId);
    this.assertArticleExists(articleId);
    files.forEach(assertValidFile);

    const add = this.sqlite.transaction(() => {
      const current = this.rows(articleId);
      const timestamp = this.now().getTime();
      const insert = this.sqlite.prepare(`
        INSERT INTO article_images (
          id, article_id, position, original_name, media_type, size_bytes,
          bytes, needs_upload, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);

      files.forEach((file, index) => {
        insert.run(
          this.createId(),
          articleId,
          current.length + index + 1,
          file.name,
          file.mediaType,
          file.bytes.byteLength,
          Buffer.from(file.bytes),
          timestamp,
          timestamp,
        );
      });
    });

    add();
    return this.list(articleId);
  }

  replaceBinary(
    articleId: string,
    imageId: string,
    file: NewArticleImage,
  ): ArticleImage {
    assertValidFile(file);
    const current = this.getBinary(articleId, imageId);
    const result = this.sqlite
      .prepare(
        `
        UPDATE article_images
        SET media_type = ?, size_bytes = ?, bytes = ?, needs_upload = 1,
            updated_at = ?
        WHERE article_id = ? AND id = ?
      `,
      )
      .run(
        file.mediaType,
        file.bytes.byteLength,
        Buffer.from(file.bytes),
        this.now().getTime(),
        articleId,
        imageId,
      );
    if (result.changes !== 1) {
      throw new ArticleImageRepositoryError(
        "image_not_found",
        `Article image ${imageId} does not exist on article ${articleId}.`,
      );
    }
    return {
      ...this.getBinary(articleId, imageId),
      originalName: current.originalName,
    };
  }

  reorder(
    articleId: string,
    orderedImageIds: readonly string[],
  ): ArticleImage[] {
    const current = this.rows(articleId);
    assertCompleteOrder(current, orderedImageIds);

    const currentPosition = new Map(
      current.map((image) => [image.id, image.position]),
    );
    const changedIds = orderedImageIds.filter(
      (id, index) => currentPosition.get(id) !== index + 1,
    );
    if (changedIds.length === 0) return current.map(toArticleImage);

    const reorder = this.sqlite.transaction(() => {
      const timestamp = this.now().getTime();
      const offset = current.length + 1;

      // Free every positive position first so the unique constraint remains
      // valid while swaps are applied inside this transaction.
      this.sqlite
        .prepare(
          `UPDATE article_images SET position = position + ? WHERE article_id = ?`,
        )
        .run(offset, articleId);

      const update = this.sqlite.prepare(`
        UPDATE article_images
        SET position = ?,
            needs_upload = CASE WHEN ? = 1 THEN 1 ELSE needs_upload END,
            updated_at = ?
        WHERE article_id = ? AND id = ?
      `);
      const changed = new Set(changedIds);
      orderedImageIds.forEach((id, index) => {
        update.run(
          index + 1,
          changed.has(id) ? 1 : 0,
          timestamp,
          articleId,
          id,
        );
      });
    });

    reorder();
    return this.list(articleId);
  }

  remove(articleId: string, imageId: string): ArticleImage[] {
    const current = this.rows(articleId);
    const removed = current.find((image) => image.id === imageId);
    if (!removed) {
      throw new ArticleImageRepositoryError(
        "image_not_found",
        `Article image ${imageId} does not exist on article ${articleId}.`,
      );
    }

    const remove = this.sqlite.transaction(() => {
      this.sqlite
        .prepare(`DELETE FROM article_images WHERE article_id = ? AND id = ?`)
        .run(articleId, imageId);
      this.sqlite
        .prepare(
          `
          UPDATE article_images
          SET position = position - 1, needs_upload = 1, updated_at = ?
          WHERE article_id = ? AND position > ?
        `,
        )
        .run(this.now().getTime(), articleId, removed.position);
    });

    remove();
    return this.list(articleId);
  }

  markUploaded(
    articleId: string,
    imageIds?: readonly string[],
  ): ArticleImage[] {
    if (imageIds?.length === 0) return this.list(articleId);
    const current = this.rows(articleId);
    const ids = imageIds ?? current.map((image) => image.id);
    const currentIds = new Set(current.map((image) => image.id));
    if (ids.some((id) => !currentIds.has(id))) {
      throw new ArticleImageRepositoryError(
        "image_not_found",
        "At least one acknowledged image does not belong to this article.",
      );
    }

    const placeholders = ids.map(() => "?").join(", ");
    this.sqlite
      .prepare(
        `
        UPDATE article_images
        SET needs_upload = 0, updated_at = ?
        WHERE article_id = ? AND id IN (${placeholders})
      `,
      )
      .run(this.now().getTime(), articleId, ...ids);

    return this.list(articleId);
  }

  private assertArticleExists(articleId: string): void {
    const row = this.sqlite
      .prepare(`SELECT 1 FROM articles WHERE id = ?`)
      .get(articleId);
    if (!row) {
      throw new ArticleImageRepositoryError(
        "article_not_found",
        `Article ${articleId} does not exist.`,
      );
    }
  }

  private rows(articleId: string): ArticleImageDatabaseRow[] {
    return this.sqlite
      .prepare(
        `SELECT * FROM article_images WHERE article_id = ? ORDER BY position`,
      )
      .all(articleId) as ArticleImageDatabaseRow[];
  }
}

function assertValidFile(file: NewArticleImage): void {
  if (!file.name.trim() || !file.mediaType.startsWith("image/")) {
    throw new ArticleImageRepositoryError(
      "invalid_file",
      "Article images require a filename and image media type.",
    );
  }
  if (
    !Number.isSafeInteger(file.bytes.byteLength) ||
    file.bytes.byteLength < 1
  ) {
    throw new ArticleImageRepositoryError(
      "invalid_file",
      `${file.name} is empty or has an invalid size.`,
    );
  }
}

function assertCompleteOrder(
  current: readonly ArticleImageDatabaseRow[],
  orderedImageIds: readonly string[],
): void {
  const currentIds = new Set(current.map((image) => image.id));
  const submittedIds = new Set(orderedImageIds);
  if (
    current.length !== orderedImageIds.length ||
    submittedIds.size !== orderedImageIds.length ||
    orderedImageIds.some((id) => !currentIds.has(id))
  ) {
    throw new ArticleImageRepositoryError(
      "invalid_order",
      "A reorder must contain every Article Image exactly once.",
    );
  }
}

function toArticleImage(row: ArticleImageDatabaseRow): ArticleImage {
  return {
    id: row.id,
    articleId: row.article_id,
    position: row.position,
    originalName: row.original_name,
    mediaType: row.media_type,
    sizeBytes: row.size_bytes,
    needsUpload: row.needs_upload === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
