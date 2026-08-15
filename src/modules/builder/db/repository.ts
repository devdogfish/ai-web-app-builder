import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";

import {
  ARTICLE_BUILDER_DATABASE_ENV,
  BASELINE_VERSION_SUMMARY,
  DEFAULT_ARTICLE_BUILDER_DATABASE_PATH,
} from "./constants";
import { initializeDatabase } from "./initialize";
import * as schema from "./schema";
import {
  articles,
  builderChats,
  hostSyncOutbox,
  messages,
  uploads,
  versions,
  type Article,
  type ArticleVersion,
  type BuilderChat,
  type BuilderMessage,
  type ReferenceUpload,
} from "./schema";
import {
  normalizeVersionSummary,
  revertedVersionSummary,
} from "../core/version-summary";

export type ArticleRepositoryDatabase = BetterSQLite3Database<typeof schema>;

export interface ArticleWorkspace {
  article: Article;
  chat: BuilderChat;
  messages: BuilderMessage[];
  versions: ArticleVersion[];
  uploads: ReferenceUpload[];
  currentVersion: ArticleVersion;
  hostSyncPending: boolean;
}

export interface ArticleIdentity {
  id: string;
  website: string;
  articleType: string;
  title?: string;
}

export type HostSyncTask = typeof hostSyncOutbox.$inferSelect;

export interface BootstrapArticleInput {
  article: ArticleIdentity;
  html?: string;
  summary?: string;
  replaceEmptySession?: boolean;
  initialMessage?: {
    content: string;
    uploads: BootstrapUploadInput[];
  };
}

export interface BootstrapUploadInput {
  name: string;
  mediaType: string;
  sizeBytes: number;
  storageKey: string;
  extractedText?: string | null;
}

export interface AppendMessageInput {
  articleId: string;
  role: "user" | "assistant" | "system";
  content: string;
  kind?: "chat" | "source_apply" | "rewind" | "baseline";
  status?: "complete" | "failed" | "stopped";
  errorCode?: string | null;
  uploadIds?: string[];
}

export interface AddUploadInput {
  articleId: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  storageKey: string;
  extractedText?: string | null;
  messageId?: string | null;
}

export interface CommitAssistantVersionInput {
  articleId: string;
  expectedChatId: string;
  expectedVersionId: string;
  expectedVersionSha256: string;
  html: string;
  response: string;
  summary: string;
  uploadIds?: string[];
}

export interface CommitAssistantAnswerInput {
  articleId: string;
  expectedChatId: string;
  expectedVersionId: string;
  expectedVersionSha256: string;
  response: string;
}

export interface ApplySourceInput {
  articleId: string;
  html: string;
}

export interface RewindInput {
  articleId: string;
  versionId: string;
  summary?: string;
}

export interface ArticleRepositoryOptions {
  filename?: string;
  sqlite?: Database.Database;
  now?: () => Date;
  createId?: () => string;
}

export class ArticleRepositoryError extends Error {
  constructor(
    public readonly code:
      | "article_not_found"
      | "chat_not_found"
      | "message_not_found"
      | "chat_not_empty"
      | "version_not_found"
      | "upload_not_found"
      | "upload_already_attached"
      | "invalid_upload_size"
      | "stale_version",
    message: string,
  ) {
    super(message);
    this.name = "ArticleRepositoryError";
  }
}

function digest(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

function configuredFilename(): string {
  return (
    process.env[ARTICLE_BUILDER_DATABASE_ENV] ??
    DEFAULT_ARTICLE_BUILDER_DATABASE_PATH
  );
}

function openSqlite(filename: string): Database.Database {
  if (filename !== ":memory:" && !filename.startsWith("file:")) {
    mkdirSync(dirname(filename), { recursive: true });
  }

  return new Database(filename);
}

export class ArticleRepository {
  readonly db: ArticleRepositoryDatabase;
  readonly sqlite: Database.Database;

  private readonly ownsConnection: boolean;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: ArticleRepositoryOptions = {}) {
    this.sqlite =
      options.sqlite ?? openSqlite(options.filename ?? configuredFilename());
    this.ownsConnection = !options.sqlite;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    initializeDatabase(this.sqlite);
    this.db = drizzle(this.sqlite, { schema });
  }

  close(): void {
    if (this.ownsConnection && this.sqlite.open) {
      this.sqlite.close();
    }
  }

  getWorkspace(articleId: string): ArticleWorkspace | null {
    const article = this.db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .get();
    if (!article) return null;

    const chat = this.db
      .select()
      .from(builderChats)
      .where(eq(builderChats.articleId, articleId))
      .get();
    if (!chat) return null;

    const chatMessages = this.db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chat.id))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .all();
    const chatVersions = this.db
      .select()
      .from(versions)
      .where(eq(versions.chatId, chat.id))
      .orderBy(asc(versions.number))
      .all();
    const chatUploads = this.db
      .select()
      .from(uploads)
      .where(eq(uploads.chatId, chat.id))
      .orderBy(asc(uploads.createdAt), asc(uploads.id))
      .all();
    const currentVersion = chatVersions.find(
      (version) => version.id === chat.currentVersionId,
    );

    if (!currentVersion) {
      throw new ArticleRepositoryError(
        "version_not_found",
        `Current version for article ${articleId} does not exist`,
      );
    }

    return {
      article,
      chat,
      messages: chatMessages,
      versions: chatVersions,
      uploads: chatUploads,
      currentVersion,
      hostSyncPending:
        this.db
          .select()
          .from(hostSyncOutbox)
          .where(eq(hostSyncOutbox.articleId, articleId))
          .all().length > 0,
    };
  }

  bootstrapArticle(input: BootstrapArticleInput): ArticleWorkspace {
    const existing = this.getWorkspace(input.article.id);
    if (existing && !input.replaceEmptySession) return existing;
    if (
      existing &&
      (existing.messages.length > 0 ||
        existing.uploads.length > 0 ||
        existing.versions.length !== 1)
    ) {
      throw new ArticleRepositoryError(
        "chat_not_empty",
        "An active Builder Chat cannot be replaced during bootstrap",
      );
    }

    if (
      input.initialMessage?.uploads.some(
        (upload) =>
          !Number.isSafeInteger(upload.sizeBytes) || upload.sizeBytes < 0,
      )
    ) {
      throw new ArticleRepositoryError(
        "invalid_upload_size",
        "Upload size must be a non-negative safe integer",
      );
    }

    const timestamp = this.now();
    const chatId = this.createId();
    const versionId = this.createId();

    this.db.transaction((tx) => {
      if (existing) {
        tx.delete(builderChats)
          .where(eq(builderChats.id, existing.chat.id))
          .run();
      }

      const article = tx
        .select()
        .from(articles)
        .where(eq(articles.id, input.article.id))
        .get();
      const html = input.html ?? article?.html ?? "";

      if (article) {
        tx.update(articles)
          .set({
            website: input.article.website,
            articleType: input.article.articleType,
            title: input.article.title ?? article.title,
            html,
            updatedAt: timestamp,
          })
          .where(eq(articles.id, input.article.id))
          .run();
      } else {
        tx.insert(articles)
          .values({
            id: input.article.id,
            website: input.article.website,
            articleType: input.article.articleType,
            title: input.article.title ?? "",
            html,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run();
      }

      tx.insert(builderChats)
        .values({
          id: chatId,
          articleId: input.article.id,
          currentVersionId: versionId,
          compactMemory: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      tx.insert(versions)
        .values({
          id: versionId,
          chatId,
          messageId: null,
          parentVersionId: null,
          restoredFromVersionId: null,
          number: 1,
          html,
          summary: normalizeVersionSummary(
            input.summary ?? BASELINE_VERSION_SUMMARY,
          ),
          source: "baseline",
          sha256: digest(html),
          createdAt: timestamp,
        })
        .run();
      if (input.initialMessage) {
        const messageId = this.createId();
        tx.insert(messages)
          .values({
            id: messageId,
            chatId,
            role: "user",
            kind: "chat",
            content: input.initialMessage.content,
            status: "complete",
            createdAt: timestamp,
          })
          .run();
        input.initialMessage.uploads.forEach((upload, index) => {
          tx.insert(uploads)
            .values({
              id: this.createId(),
              chatId,
              messageId,
              name: upload.name,
              mediaType: upload.mediaType,
              sizeBytes: upload.sizeBytes,
              storageKey: upload.storageKey,
              extractedText: upload.extractedText ?? null,
              createdAt: new Date(timestamp.getTime() + index),
            })
            .run();
        });
      }
      tx.insert(hostSyncOutbox)
        .values({
          versionId,
          articleId: input.article.id,
          versionNumber: 1,
          html,
          sha256: digest(html),
          expectedPreviousSha256: article?.html ? digest(article.html) : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
    });

    return this.requireWorkspace(input.article.id);
  }

  appendMessage(input: AppendMessageInput): BuilderMessage {
    const timestamp = this.now();
    const messageId = this.createId();

    return this.db.transaction((tx) => {
      const chat = tx
        .select()
        .from(builderChats)
        .where(eq(builderChats.articleId, input.articleId))
        .get();
      if (!chat) this.throwChatNotFound(input.articleId);
      this.assertUploadsAttachable(tx, chat.id, input.uploadIds ?? []);

      const message = tx
        .insert(messages)
        .values({
          id: messageId,
          chatId: chat.id,
          role: input.role,
          kind: input.kind ?? "chat",
          content: input.content,
          status: input.status ?? "complete",
          errorCode: input.errorCode ?? null,
          createdAt: timestamp,
        })
        .returning()
        .get();

      this.attachUploads(tx, chat.id, message.id, input.uploadIds ?? []);
      tx.update(builderChats)
        .set({ updatedAt: timestamp })
        .where(eq(builderChats.id, chat.id))
        .run();
      return message;
    });
  }

  addUpload(input: AddUploadInput): ReferenceUpload {
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
      throw new ArticleRepositoryError(
        "invalid_upload_size",
        "Upload size must be a non-negative safe integer",
      );
    }

    const chat = this.db
      .select()
      .from(builderChats)
      .where(eq(builderChats.articleId, input.articleId))
      .get();
    if (!chat) this.throwChatNotFound(input.articleId);

    if (input.messageId) {
      const message = this.db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(eq(messages.id, input.messageId), eq(messages.chatId, chat.id)),
        )
        .get();
      if (!message) {
        throw new ArticleRepositoryError(
          "message_not_found",
          `Message ${input.messageId} does not belong to the active chat`,
        );
      }
    }

    return this.db
      .insert(uploads)
      .values({
        id: this.createId(),
        chatId: chat.id,
        messageId: input.messageId ?? null,
        name: input.name,
        mediaType: input.mediaType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        extractedText: input.extractedText ?? null,
        createdAt: this.now(),
      })
      .returning()
      .get();
  }

  commitAssistantVersion(input: CommitAssistantVersionInput): {
    message: BuilderMessage;
    version: ArticleVersion;
  } {
    const timestamp = this.now();

    return this.db.transaction((tx) => {
      const chat = tx
        .select()
        .from(builderChats)
        .where(eq(builderChats.articleId, input.articleId))
        .get();
      if (!chat) this.throwChatNotFound(input.articleId);
      const currentVersion = tx
        .select({ sha256: versions.sha256 })
        .from(versions)
        .where(
          and(
            eq(versions.id, chat.currentVersionId ?? ""),
            eq(versions.chatId, chat.id),
          ),
        )
        .get();
      if (!currentVersion) {
        throw new ArticleRepositoryError(
          "version_not_found",
          `Current version for article ${input.articleId} does not exist`,
        );
      }
      if (
        chat.id !== input.expectedChatId ||
        chat.currentVersionId !== input.expectedVersionId ||
        currentVersion.sha256 !== input.expectedVersionSha256
      ) {
        throw new ArticleRepositoryError(
          "stale_version",
          "Article HTML changed while the refinement was running.",
        );
      }

      this.assertUploadsAttachable(tx, chat.id, input.uploadIds ?? []);
      const message = tx
        .insert(messages)
        .values({
          id: this.createId(),
          chatId: chat.id,
          role: "assistant",
          kind: "chat",
          content: input.response,
          status: "complete",
          createdAt: timestamp,
        })
        .returning()
        .get();
      this.attachUploads(tx, chat.id, message.id, input.uploadIds ?? []);

      const version = this.insertNextVersion(tx, {
        articleId: input.articleId,
        chat,
        html: input.html,
        summary: normalizeVersionSummary(input.summary),
        source: "assistant",
        messageId: message.id,
        restoredFromVersionId: null,
        timestamp,
      });
      return { message, version };
    });
  }

  commitAssistantAnswer(input: CommitAssistantAnswerInput): BuilderMessage {
    const timestamp = this.now();

    return this.db.transaction((tx) => {
      const chat = tx
        .select()
        .from(builderChats)
        .where(eq(builderChats.articleId, input.articleId))
        .get();
      if (!chat) this.throwChatNotFound(input.articleId);
      const currentVersion = tx
        .select({ sha256: versions.sha256 })
        .from(versions)
        .where(
          and(
            eq(versions.id, chat.currentVersionId ?? ""),
            eq(versions.chatId, chat.id),
          ),
        )
        .get();
      if (!currentVersion) {
        throw new ArticleRepositoryError(
          "version_not_found",
          `Current version for article ${input.articleId} does not exist`,
        );
      }
      if (
        chat.id !== input.expectedChatId ||
        chat.currentVersionId !== input.expectedVersionId ||
        currentVersion.sha256 !== input.expectedVersionSha256
      ) {
        throw new ArticleRepositoryError(
          "stale_version",
          "Article HTML changed while the answer was being prepared.",
        );
      }

      const message = tx
        .insert(messages)
        .values({
          id: this.createId(),
          chatId: chat.id,
          role: "assistant",
          kind: "chat",
          content: input.response,
          status: "complete",
          createdAt: timestamp,
        })
        .returning()
        .get();
      tx.update(builderChats)
        .set({ updatedAt: timestamp })
        .where(eq(builderChats.id, chat.id))
        .run();
      return message;
    });
  }

  applySource(input: ApplySourceInput): ArticleVersion {
    const timestamp = this.now();

    return this.db.transaction((tx) => {
      const chat = tx
        .select()
        .from(builderChats)
        .where(eq(builderChats.articleId, input.articleId))
        .get();
      if (!chat) this.throwChatNotFound(input.articleId);

      const currentVersion = tx
        .select()
        .from(versions)
        .where(
          and(
            eq(versions.id, chat.currentVersionId ?? ""),
            eq(versions.chatId, chat.id),
          ),
        )
        .get();
      if (!currentVersion) {
        throw new ArticleRepositoryError(
          "version_not_found",
          `Current version for article ${input.articleId} does not exist`,
        );
      }
      if (currentVersion.html === input.html) return currentVersion;

      const sha256 = digest(input.html);
      const version = tx
        .update(versions)
        .set({ html: input.html, sha256 })
        .where(eq(versions.id, currentVersion.id))
        .returning()
        .get();

      tx.insert(hostSyncOutbox)
        .values({
          versionId: version.id,
          articleId: input.articleId,
          versionNumber: version.number,
          html: version.html,
          sha256: version.sha256,
          expectedPreviousSha256: currentVersion.sha256,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: hostSyncOutbox.versionId,
          set: {
            html: version.html,
            sha256: version.sha256,
            attempts: 0,
            lastError: null,
            updatedAt: timestamp,
          },
        })
        .run();
      tx.update(builderChats)
        .set({ updatedAt: timestamp })
        .where(eq(builderChats.id, chat.id))
        .run();
      tx.update(articles)
        .set({ html: input.html, updatedAt: timestamp })
        .where(eq(articles.id, input.articleId))
        .run();
      return version;
    });
  }

  rewind(input: RewindInput): ArticleVersion {
    const timestamp = this.now();

    return this.db.transaction((tx) => {
      const chat = tx
        .select()
        .from(builderChats)
        .where(eq(builderChats.articleId, input.articleId))
        .get();
      if (!chat) this.throwChatNotFound(input.articleId);

      const target = tx
        .select()
        .from(versions)
        .where(
          and(eq(versions.id, input.versionId), eq(versions.chatId, chat.id)),
        )
        .get();
      if (!target) {
        throw new ArticleRepositoryError(
          "version_not_found",
          `Version ${input.versionId} does not belong to the active chat`,
        );
      }

      const summary = input.summary
        ? normalizeVersionSummary(input.summary)
        : revertedVersionSummary(target.number);
      const message = tx
        .insert(messages)
        .values({
          id: this.createId(),
          chatId: chat.id,
          role: "user",
          kind: "rewind",
          content: summary,
          status: "complete",
          createdAt: timestamp,
        })
        .returning()
        .get();

      return this.insertNextVersion(tx, {
        articleId: input.articleId,
        chat,
        html: target.html,
        summary,
        source: "rewind",
        messageId: message.id,
        restoredFromVersionId: target.id,
        timestamp,
      });
    });
  }

  startNewSession(articleId: string): ArticleWorkspace {
    const timestamp = this.now();

    this.db.transaction((tx) => {
      const article = tx
        .select()
        .from(articles)
        .where(eq(articles.id, articleId))
        .get();
      if (!article) {
        throw new ArticleRepositoryError(
          "article_not_found",
          `Article ${articleId} does not exist`,
        );
      }

      const previousChat = tx
        .select()
        .from(builderChats)
        .where(eq(builderChats.articleId, articleId))
        .get();
      if (!previousChat) this.throwChatNotFound(articleId);

      const current = tx
        .select()
        .from(versions)
        .where(
          and(
            eq(versions.id, previousChat.currentVersionId ?? ""),
            eq(versions.chatId, previousChat.id),
          ),
        )
        .get();
      if (!current) {
        throw new ArticleRepositoryError(
          "version_not_found",
          `Current version for article ${articleId} does not exist`,
        );
      }

      // Cascades remove messages, version history, uploads, and memory.
      tx.delete(builderChats).where(eq(builderChats.id, previousChat.id)).run();

      const chatId = this.createId();
      const versionId = this.createId();
      tx.insert(builderChats)
        .values({
          id: chatId,
          articleId,
          currentVersionId: versionId,
          compactMemory: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      tx.insert(versions)
        .values({
          id: versionId,
          chatId,
          messageId: null,
          parentVersionId: null,
          restoredFromVersionId: null,
          number: 1,
          html: current.html,
          summary: BASELINE_VERSION_SUMMARY,
          source: "baseline",
          sha256: current.sha256,
          createdAt: timestamp,
        })
        .run();
      tx.update(articles)
        .set({ html: current.html, updatedAt: timestamp })
        .where(eq(articles.id, articleId))
        .run();
    });

    return this.requireWorkspace(articleId);
  }

  setCompactMemory(articleId: string, memory: string | null): void {
    const result = this.db
      .update(builderChats)
      .set({ compactMemory: memory, updatedAt: this.now() })
      .where(eq(builderChats.articleId, articleId))
      .run();
    if (result.changes === 0) this.throwChatNotFound(articleId);
  }

  getPendingHostSync(articleId: string): HostSyncTask[] {
    return this.db
      .select()
      .from(hostSyncOutbox)
      .where(eq(hostSyncOutbox.articleId, articleId))
      .orderBy(asc(hostSyncOutbox.versionNumber))
      .all();
  }

  completeHostSync(versionId: string): void {
    this.db
      .delete(hostSyncOutbox)
      .where(eq(hostSyncOutbox.versionId, versionId))
      .run();
  }

  failHostSync(versionId: string, error: string): void {
    const current = this.db
      .select()
      .from(hostSyncOutbox)
      .where(eq(hostSyncOutbox.versionId, versionId))
      .get();
    if (!current) return;
    this.db
      .update(hostSyncOutbox)
      .set({
        attempts: current.attempts + 1,
        lastError: error.slice(0, 500),
        updatedAt: this.now(),
      })
      .where(eq(hostSyncOutbox.versionId, versionId))
      .run();
  }

  private requireWorkspace(articleId: string): ArticleWorkspace {
    const workspace = this.getWorkspace(articleId);
    if (!workspace) {
      throw new ArticleRepositoryError(
        "chat_not_found",
        `Active Builder Chat for article ${articleId} does not exist`,
      );
    }
    return workspace;
  }

  private throwChatNotFound(articleId: string): never {
    throw new ArticleRepositoryError(
      "chat_not_found",
      `Active Builder Chat for article ${articleId} does not exist`,
    );
  }

  private assertUploadsAttachable(
    tx: Parameters<Parameters<ArticleRepositoryDatabase["transaction"]>[0]>[0],
    chatId: string,
    uploadIds: string[],
  ): void {
    const ids = [...new Set(uploadIds)];
    if (ids.length === 0) return;

    const found = tx
      .select({ id: uploads.id, messageId: uploads.messageId })
      .from(uploads)
      .where(and(eq(uploads.chatId, chatId), inArray(uploads.id, ids)))
      .all();
    if (found.length !== ids.length) {
      throw new ArticleRepositoryError(
        "upload_not_found",
        "One or more uploads do not belong to the active chat",
      );
    }
    if (found.some((upload) => upload.messageId !== null)) {
      throw new ArticleRepositoryError(
        "upload_already_attached",
        "An upload can be attached to only one message",
      );
    }
  }

  private attachUploads(
    tx: Parameters<Parameters<ArticleRepositoryDatabase["transaction"]>[0]>[0],
    chatId: string,
    messageId: string,
    uploadIds: string[],
  ): void {
    const ids = [...new Set(uploadIds)];
    if (ids.length === 0) return;

    tx.update(uploads)
      .set({ messageId })
      .where(and(eq(uploads.chatId, chatId), inArray(uploads.id, ids)))
      .run();
  }

  private insertNextVersion(
    tx: Parameters<Parameters<ArticleRepositoryDatabase["transaction"]>[0]>[0],
    input: {
      articleId: string;
      chat: BuilderChat;
      html: string;
      summary: string;
      source: "assistant" | "manual" | "rewind";
      messageId: string | null;
      restoredFromVersionId: string | null;
      timestamp: Date;
    },
  ): ArticleVersion {
    const latest = tx
      .select()
      .from(versions)
      .where(eq(versions.chatId, input.chat.id))
      .orderBy(asc(versions.number))
      .all()
      .at(-1);
    if (!latest) {
      throw new ArticleRepositoryError(
        "version_not_found",
        `Active Builder Chat for article ${input.articleId} has no baseline`,
      );
    }

    const version = tx
      .insert(versions)
      .values({
        id: this.createId(),
        chatId: input.chat.id,
        messageId: input.messageId,
        parentVersionId: input.chat.currentVersionId,
        restoredFromVersionId: input.restoredFromVersionId,
        number: latest.number + 1,
        html: input.html,
        summary: normalizeVersionSummary(input.summary),
        source: input.source,
        sha256: digest(input.html),
        createdAt: input.timestamp,
      })
      .returning()
      .get();

    tx.insert(hostSyncOutbox)
      .values({
        versionId: version.id,
        articleId: input.articleId,
        versionNumber: version.number,
        html: version.html,
        sha256: version.sha256,
        expectedPreviousSha256: latest.sha256,
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
      })
      .run();

    tx.update(builderChats)
      .set({ currentVersionId: version.id, updatedAt: input.timestamp })
      .where(eq(builderChats.id, input.chat.id))
      .run();
    tx.update(articles)
      .set({ html: input.html, updatedAt: input.timestamp })
      .where(eq(articles.id, input.articleId))
      .run();
    return version;
  }
}

export function createArticleRepository(
  options: ArticleRepositoryOptions = {},
): ArticleRepository {
  return new ArticleRepository(options);
}
