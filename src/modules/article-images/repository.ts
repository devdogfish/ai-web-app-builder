import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";

import { articles } from "../builder/db/schema";
import { articleImages, type ArticleImageRow } from "./db/schema";

import type {
  ArticleImage,
  ArticleImageBinary,
  NewArticleImage,
} from "./contracts";

const schema = { articles, articleImages };

type ArticleImageDatabase = BetterSQLite3Database<typeof schema>;

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
  private readonly db: ArticleImageDatabase;

  constructor(
    private readonly sqlite: Database.Database,
    options: ArticleImageRepositoryOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.db = drizzle(this.sqlite, { schema });
  }

  list(articleId: string): ArticleImage[] {
    return this.rows(articleId).map(toArticleImage);
  }

  listNeedingUpload(articleId: string): ArticleImage[] {
    return this.db
      .select()
      .from(articleImages)
      .where(
        and(
          eq(articleImages.articleId, articleId),
          eq(articleImages.needsUpload, true),
        ),
      )
      .orderBy(asc(articleImages.position))
      .all()
      .map(toArticleImage);
  }

  getBinary(articleId: string, imageId: string): ArticleImageBinary {
    const row = this.db
      .select()
      .from(articleImages)
      .where(
        and(
          eq(articleImages.articleId, articleId),
          eq(articleImages.id, imageId),
        ),
      )
      .get();

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

    this.db.transaction((tx) => {
      const current = tx
        .select()
        .from(articleImages)
        .where(eq(articleImages.articleId, articleId))
        .orderBy(asc(articleImages.position))
        .all();
      const timestamp = this.now().getTime();

      files.forEach((file, index) => {
        tx.insert(articleImages)
          .values({
            id: this.createId(),
            articleId,
            position: current.length + index + 1,
            originalName: file.name,
            mediaType: file.mediaType,
            sizeBytes: file.bytes.byteLength,
            bytes: Buffer.from(file.bytes),
            needsUpload: true,
            createdAt: new Date(timestamp),
            updatedAt: new Date(timestamp),
          })
          .run();
      });
    });

    return this.list(articleId);
  }

  replaceBinary(
    articleId: string,
    imageId: string,
    file: NewArticleImage,
  ): ArticleImage {
    assertValidFile(file);
    const current = this.getBinary(articleId, imageId);
    const result = this.db
      .update(articleImages)
      .set({
        mediaType: file.mediaType,
        sizeBytes: file.bytes.byteLength,
        bytes: Buffer.from(file.bytes),
        needsUpload: true,
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(articleImages.articleId, articleId),
          eq(articleImages.id, imageId),
        ),
      )
      .run();
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

    this.db.transaction((tx) => {
      const timestamp = this.now().getTime();
      const offset = current.length + 1;

      // Free every positive position first so the unique constraint remains
      // valid while swaps are applied inside this transaction.
      tx.update(articleImages)
        .set({ position: sql`${articleImages.position} + ${offset}` })
        .where(eq(articleImages.articleId, articleId))
        .run();

      const changed = new Set(changedIds);
      orderedImageIds.forEach((id, index) => {
        tx.update(articleImages)
          .set(
            changed.has(id)
              ? {
                  position: index + 1,
                  needsUpload: true,
                  updatedAt: new Date(timestamp),
                }
              : { position: index + 1, updatedAt: new Date(timestamp) },
          )
          .where(
            and(
              eq(articleImages.articleId, articleId),
              eq(articleImages.id, id),
            ),
          )
          .run();
      });
    });

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

    this.db.transaction((tx) => {
      tx.delete(articleImages)
        .where(
          and(
            eq(articleImages.articleId, articleId),
            eq(articleImages.id, imageId),
          ),
        )
        .run();
      tx.update(articleImages)
        .set({
          position: sql`${articleImages.position} - 1`,
          needsUpload: true,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(articleImages.articleId, articleId),
            sql`${articleImages.position} > ${removed.position}`,
          ),
        )
        .run();
    });

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

    this.db
      .update(articleImages)
      .set({ needsUpload: false, updatedAt: this.now() })
      .where(
        and(
          eq(articleImages.articleId, articleId),
          inArray(articleImages.id, ids),
        ),
      )
      .run();

    return this.list(articleId);
  }

  private assertArticleExists(articleId: string): void {
    const row = this.db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.id, articleId))
      .get();
    if (!row) {
      throw new ArticleImageRepositoryError(
        "article_not_found",
        `Article ${articleId} does not exist.`,
      );
    }
  }

  private rows(articleId: string): ArticleImageRow[] {
    return this.db
      .select()
      .from(articleImages)
      .where(eq(articleImages.articleId, articleId))
      .orderBy(asc(articleImages.position))
      .all();
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
  current: readonly ArticleImageRow[],
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

function toArticleImage(row: ArticleImageRow): ArticleImage {
  return {
    id: row.id,
    articleId: row.articleId,
    position: row.position,
    originalName: row.originalName,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    needsUpload: row.needsUpload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
