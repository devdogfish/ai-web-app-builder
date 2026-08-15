import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { formatArticleHtml } from "../content";
import { createArticleRepository } from "../db";
import { initializeDatabase } from "../db/initialize";

function createTestRepository() {
  let id = 0;
  let time = 1_700_000_000_000;
  return createArticleRepository({
    filename: ":memory:",
    createId: () => `id-${++id}`,
    now: () => new Date(++time),
  });
}

function commitAssistant(
  repository: ReturnType<typeof createTestRepository>,
  html: string,
  summary = "Assistant update",
) {
  const workspace = repository.getWorkspace("article-1");
  if (!workspace) throw new Error("Missing test workspace");
  return repository.commitAssistantVersion({
    articleId: "article-1",
    expectedChatId: workspace.chat.id,
    expectedVersionId: workspace.currentVersion.id,
    expectedVersionSha256: workspace.currentVersion.sha256,
    html,
    response: summary,
    summary,
  });
}

describe("ArticleRepository", () => {
  it("stores Article Source in versions and compiled HTML in the host outbox", () => {
    const repository = createTestRepository();
    const baseline = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "<p>Before</p>",
      hostHtml: "<p>Before</p>",
    });
    const baselineTask = repository.getPendingHostSync("article-1")[0];
    repository.completeHostSync(baselineTask!.versionId);

    const source = '<Component type="tabs" data={{ tabs: [] }} />';
    const compiled = '<section class="tabs"></section>';
    repository.applySource({
      articleId: "article-1",
      html: source,
      hostHtml: compiled,
    });

    const workspace = repository.getWorkspace("article-1");
    const [task] = repository.getPendingHostSync("article-1");
    expect(workspace?.article.html).toBe(source);
    expect(workspace?.currentVersion.html).toBe(source);
    expect(task?.html).toBe(compiled);
    expect(task?.sha256).toBe(hash(compiled));
    expect(task?.expectedPreviousSha256).toBe(baselineTask?.sha256);
    expect(workspace?.currentVersion.id).toBe(baseline.currentVersion.id);

    repository.close();
  });

  it("queues a fresh compiled handoff when the managed source is unchanged", () => {
    const repository = createTestRepository();
    const source = '<Component type="tabs" data={{ tabs: [] }} />';
    const firstCompiled = '<section class="tabs old"></section>';
    const workspace = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: source,
      hostHtml: firstCompiled,
    });
    repository.completeHostSync(workspace.currentVersion.id);

    const nextCompiled = '<section class="tabs new"></section>';
    repository.applySource({
      articleId: "article-1",
      html: source,
      hostHtml: nextCompiled,
    });

    expect(repository.getWorkspace("article-1")?.currentVersion.html).toBe(
      source,
    );
    expect(repository.getPendingHostSync("article-1")).toEqual([
      expect.objectContaining({
        html: nextCompiled,
        sha256: hash(nextCompiled),
        expectedPreviousSha256: hash(firstCompiled),
      }),
    ]);
    repository.close();
  });

  it("upgrades a local messages table with durable error codes", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'chat',
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'complete',
        created_at INTEGER NOT NULL
      );
    `);

    initializeDatabase(sqlite);

    expect(
      (sqlite.pragma("table_info(messages)") as Array<{ name: string }>).some(
        (column) => column.name === "error_code",
      ),
    ).toBe(true);
    sqlite.close();
  });

  it("bootstraps one active chat and one full baseline snapshot", () => {
    const repository = createTestRepository();

    const workspace = repository.bootstrapArticle({
      article: {
        id: "article-1",
        website: "news",
        articleType: "story",
        title: "A title",
      },
      html: "<p>Existing article</p>",
    });

    expect(workspace.article.html).toBe("<p>Existing article</p>");
    expect(workspace.versions).toHaveLength(1);
    expect(workspace.currentVersion).toMatchObject({
      number: 1,
      html: "<p>Existing article</p>",
      source: "baseline",
      parentVersionId: null,
    });
    expect(workspace.hostSyncPending).toBe(true);
    const [sync] = repository.getPendingHostSync("article-1");
    expect(sync).toMatchObject({
      versionNumber: 1,
      html: "<p>Existing article</p>",
    });
    repository.completeHostSync(sync.versionId);
    expect(repository.getWorkspace("article-1")?.hostSyncPending).toBe(false);
    expect(
      repository.bootstrapArticle({
        article: {
          id: "article-1",
          website: "other",
          articleType: "other",
        },
        html: "must not replace an existing workspace",
      }).chat.id,
    ).toBe(workspace.chat.id);

    repository.close();
  });

  it("attaches an initial document and its extracted images to the first user message", () => {
    const repository = createTestRepository();

    const workspace = repository.bootstrapArticle({
      article: {
        id: "article-1",
        website: "news",
        articleType: "story",
      },
      html: "<p>Imported article</p>",
      initialMessage: {
        content: "Start with this Word document.",
        uploads: [
          {
            name: "article.docx",
            mediaType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 42,
            storageKey: "uploads/article.docx",
            extractedText: "Imported article",
          },
          {
            name: "article-image-01.png",
            mediaType: "image/png",
            sizeBytes: 10,
            storageKey: "uploads/article-image-01.png",
          },
          {
            name: "article-image-02.png",
            mediaType: "image/png",
            sizeBytes: 11,
            storageKey: "uploads/article-image-02.png",
          },
        ],
      },
    });

    expect(workspace.messages).toEqual([
      expect.objectContaining({
        role: "user",
        kind: "chat",
        content: "Start with this Word document.",
      }),
    ]);
    expect(workspace.uploads).toHaveLength(3);
    expect(workspace.uploads.map((upload) => upload.name)).toEqual([
      "article.docx",
      "article-image-01.png",
      "article-image-02.png",
    ]);
    expect(workspace.uploads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: workspace.messages[0]?.id,
          name: "article.docx",
          storageKey: "uploads/article.docx",
        }),
      ]),
    );
    expect(workspace.currentVersion.html).toBe("<p>Imported article</p>");

    repository.close();
  });

  it("preserves bootstrap provenance when the workspace is reopened", () => {
    const directory = mkdtempSync(join(tmpdir(), "builder-bootstrap-"));
    const filename = join(directory, "builder.sqlite");
    let repository: ReturnType<typeof createArticleRepository> | null = null;

    try {
      repository = createArticleRepository({ filename });
      repository.bootstrapArticle({
        article: {
          id: "article-1",
          website: "news",
          articleType: "story",
        },
        html: "<p>Imported article</p>",
        initialMessage: {
          content: "Start with this Word document.",
          uploads: [
            {
              name: "article.docx",
              mediaType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              sizeBytes: 42,
              storageKey: "uploads/article.docx",
            },
            {
              name: "article-image-01.png",
              mediaType: "image/png",
              sizeBytes: 10,
              storageKey: "uploads/article-image-01.png",
            },
          ],
        },
      });
      repository.close();

      repository = createArticleRepository({ filename });
      const reopened = repository.getWorkspace("article-1");

      expect(reopened?.messages).toEqual([
        expect.objectContaining({
          role: "user",
          content: "Start with this Word document.",
        }),
      ]);
      expect(reopened?.uploads.map((upload) => upload.name)).toEqual([
        "article.docx",
        "article-image-01.png",
      ]);
      expect(reopened?.uploads.every((upload) => upload.messageId)).toBe(true);
    } finally {
      repository?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("replaces a concurrently-created empty bootstrap with the source document", () => {
    const repository = createTestRepository();
    const racedWorkspace = repository.bootstrapArticle({
      article: {
        id: "article-1",
        website: "news",
        articleType: "story",
      },
      html: "<p>Host bootstrap won the race</p>",
    });

    const workspace = repository.bootstrapArticle({
      article: {
        id: "article-1",
        website: "news",
        articleType: "story",
      },
      html: "<p>Imported Word document</p>",
      initialMessage: {
        content: "",
        uploads: [
          {
            name: "article.docx",
            mediaType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 42,
            storageKey: "uploads/article.docx",
            extractedText: "Imported Word document",
          },
        ],
      },
      replaceEmptySession: true,
    } as Parameters<typeof repository.bootstrapArticle>[0]);

    expect(workspace.chat.id).not.toBe(racedWorkspace.chat.id);
    expect(workspace.currentVersion.html).toBe(
      "<p>Imported Word document</p>",
    );
    expect(workspace.messages).toEqual([
      expect.objectContaining({ role: "user", kind: "chat", content: "" }),
    ]);
    expect(workspace.uploads).toEqual([
      expect.objectContaining({
        messageId: workspace.messages[0]?.id,
        name: "article.docx",
      }),
    ]);

    repository.close();
  });

  it("folds manual saves into the active version without adding history", () => {
    const repository = createTestRepository();
    const baseline = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "<p>v1</p>",
    });

    repository.applySource({
      articleId: "article-1",
      html: "<p>v2</p>",
    });
    const applied = repository.applySource({
      articleId: "article-1",
      html: "<p>v3</p>",
    });
    const workspace = repository.getWorkspace("article-1");

    expect(applied).toMatchObject({
      id: baseline.currentVersion.id,
      number: 1,
      parentVersionId: null,
      source: "baseline",
      html: "<p>v3</p>",
    });
    expect(workspace?.versions).toHaveLength(1);
    expect(workspace?.messages).toEqual([]);
    expect(workspace?.article.html).toBe("<p>v3</p>");
    expect(repository.getPendingHostSync("article-1")).toEqual([
      expect.objectContaining({
        versionId: baseline.currentVersion.id,
        versionNumber: 1,
        html: "<p>v3</p>",
        expectedPreviousSha256: null,
      }),
    ]);

    commitAssistant(repository, "<p>AI version</p>");
    expect(() =>
      repository.sqlite
        .prepare("UPDATE versions SET html = ? WHERE id = ?")
        .run("changed", baseline.currentVersion.id),
    ).toThrow("only active version content is mutable");
    expect(() =>
      repository.sqlite
        .prepare("UPDATE versions SET summary = ? WHERE id = ?")
        .run(
          "changed",
          repository.getWorkspace("article-1")?.currentVersion.id,
        ),
    ).toThrow("only active version content is mutable");

    repository.close();
  });

  it("queues a new sync for a manual save after its version was synced", () => {
    const repository = createTestRepository();
    const baseline = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "before",
    });
    repository.completeHostSync(baseline.currentVersion.id);

    repository.applySource({ articleId: "article-1", html: "after" });

    expect(repository.getPendingHostSync("article-1")).toEqual([
      expect.objectContaining({
        versionId: baseline.currentVersion.id,
        html: "after",
        expectedPreviousSha256: baseline.currentVersion.sha256,
      }),
    ]);

    repository.close();
  });

  it("collapses legacy manual versions and source-edit messages", () => {
    const repository = createTestRepository();
    const baseline = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "baseline",
    });

    repository.sqlite.exec(`
      DROP TRIGGER versions_are_immutable;
      INSERT INTO messages
        (id, chat_id, role, kind, content, status, created_at)
      VALUES
        ('legacy-message-1', '${baseline.chat.id}', 'user', 'source_apply', 'Applied source edit', 'complete', 2),
        ('legacy-message-2', '${baseline.chat.id}', 'user', 'source_apply', 'Applied source edit', 'complete', 3);
      INSERT INTO versions
        (id, chat_id, message_id, parent_version_id, restored_from_version_id, number, html, summary, source, sha256, created_at)
      VALUES
        ('legacy-version-1', '${baseline.chat.id}', 'legacy-message-1', '${baseline.currentVersion.id}', NULL, 2, 'manual one', 'Applied source edit', 'manual', 'sha-manual-one', 2),
        ('legacy-version-2', '${baseline.chat.id}', 'legacy-message-2', 'legacy-version-1', NULL, 3, 'manual two', 'Applied source edit', 'manual', 'sha-manual-two', 3);
      UPDATE builder_chats
        SET current_version_id = 'legacy-version-2'
        WHERE id = '${baseline.chat.id}';
      UPDATE articles SET html = 'manual two' WHERE id = 'article-1';
    `);

    initializeDatabase(repository.sqlite);
    const workspace = repository.getWorkspace("article-1");

    expect(workspace?.versions).toHaveLength(1);
    expect(workspace?.messages).toEqual([]);
    expect(workspace?.currentVersion).toMatchObject({
      id: baseline.currentVersion.id,
      number: 1,
      html: "manual two",
      sha256: "sha-manual-two",
    });
    expect(repository.getPendingHostSync("article-1")).toEqual([
      expect.objectContaining({
        versionId: baseline.currentVersion.id,
        versionNumber: 1,
        html: "manual two",
        sha256: "sha-manual-two",
      }),
    ]);

    repository.close();
  });

  it("restores the manual edits folded into an LLM version", () => {
    const repository = createTestRepository();
    repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "v1",
    });
    const { version: second } = commitAssistant(repository, "v2");
    repository.applySource({ articleId: "article-1", html: "v2 + manual" });
    const { version: third } = commitAssistant(repository, "v3");

    const restored = repository.rewind({
      articleId: "article-1",
      versionId: second.id,
    });
    const workspace = repository.getWorkspace("article-1");

    expect(restored).toMatchObject({
      number: 4,
      html: "v2 + manual",
      summary: "Reverted v2",
      source: "rewind",
      parentVersionId: third.id,
      restoredFromVersionId: second.id,
    });
    expect(workspace?.versions.map((version) => version.html)).toEqual([
      "v1",
      "v2 + manual",
      "v3",
      "v2 + manual",
    ]);
    expect(workspace?.article.html).toBe("v2 + manual");

    repository.close();
  });

  it("rejects an assistant result created against a stale Version or session", () => {
    const repository = createTestRepository();
    const baseline = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "v1",
    });
    repository.applySource({ articleId: "article-1", html: "manual" });

    expect(() =>
      repository.commitAssistantVersion({
        articleId: "article-1",
        expectedChatId: baseline.chat.id,
        expectedVersionId: baseline.currentVersion.id,
        expectedVersionSha256: baseline.currentVersion.sha256,
        html: "stale AI result",
        response: "Updated",
        summary: "Updated",
      }),
    ).toThrow("changed while the refinement was running");
    expect(repository.getWorkspace("article-1")?.article.html).toBe("manual");

    repository.close();
  });

  it("stores an assistant answer without creating or changing a Version", () => {
    const repository = createTestRepository();
    const baseline = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "<article><h1>Current</h1></article>",
    });

    const answer = repository.commitAssistantAnswer({
      articleId: "article-1",
      expectedChatId: baseline.chat.id,
      expectedVersionId: baseline.currentVersion.id,
      expectedVersionSha256: baseline.currentVersion.sha256,
      response: "The headline is Current.",
    });
    const workspace = repository.getWorkspace("article-1");

    expect(answer).toMatchObject({
      role: "assistant",
      content: "The headline is Current.",
      status: "complete",
    });
    expect(workspace?.versions).toHaveLength(1);
    expect(workspace?.currentVersion).toEqual(baseline.currentVersion);
    expect(workspace?.article.html).toBe("<article><h1>Current</h1></article>");

    repository.close();
  });

  it("persists formatting-only LLM edits as a new synced Version", async () => {
    const repository = createTestRepository();
    const baseline = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "<article><h1>Current</h1><p>Copy</p></article>",
    });
    repository.completeHostSync(baseline.currentVersion.id);

    const formatted = await formatArticleHtml(baseline.currentVersion.html);
    const { version } = commitAssistant(
      repository,
      formatted,
      "Formatted article code",
    );

    expect(version).toMatchObject({
      number: 2,
      html: formatted,
      source: "assistant",
      parentVersionId: baseline.currentVersion.id,
    });
    expect(repository.getWorkspace("article-1")?.versions).toHaveLength(2);
    expect(repository.getPendingHostSync("article-1")).toEqual([
      expect.objectContaining({
        versionId: version.id,
        versionNumber: 2,
        html: formatted,
      }),
    ]);

    repository.close();
  });

  it("persists a safe error code with a failed assistant message", () => {
    const repository = createTestRepository();
    repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "<p>Current</p>",
    });

    repository.appendMessage({
      articleId: "article-1",
      role: "assistant",
      content: "The Builder hit an unexpected error. Retry this request.",
      status: "failed",
      errorCode: "internal_error",
    });

    expect(repository.getWorkspace("article-1")?.messages.at(-1)).toMatchObject(
      {
        status: "failed",
        errorCode: "internal_error",
      },
    );
    repository.close();
  });

  it("stores uploads with their selected message", () => {
    const repository = createTestRepository();
    repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
    });
    const upload = repository.addUpload({
      articleId: "article-1",
      name: "reference.md",
      mediaType: "text/markdown",
      sizeBytes: 42,
      storageKey: "uploads/reference.md",
      extractedText: "reference",
    });

    const message = repository.appendMessage({
      articleId: "article-1",
      role: "user",
      content: "Use this reference",
      uploadIds: [upload.id],
    });

    expect(repository.getWorkspace("article-1")?.uploads[0].messageId).toBe(
      message.id,
    );
    expect(() =>
      repository.appendMessage({
        articleId: "article-1",
        role: "user",
        content: "Attach twice",
        uploadIds: [upload.id],
      }),
    ).toThrow("An upload can be attached to only one message");

    repository.close();
  });

  it("starts a replacement session atomically from current applied HTML", () => {
    const repository = createTestRepository();
    const previous = repository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: "v1",
    });
    repository.applySource({ articleId: "article-1", html: "latest" });
    repository.addUpload({
      articleId: "article-1",
      name: "reference.txt",
      mediaType: "text/plain",
      sizeBytes: 2,
      storageKey: "upload-key",
    });

    const replacement = repository.startNewSession("article-1");

    expect(replacement.chat.id).not.toBe(previous.chat.id);
    expect(replacement.currentVersion).toMatchObject({
      number: 1,
      html: "latest",
      source: "baseline",
      parentVersionId: null,
    });
    expect(replacement.messages).toEqual([]);
    expect(replacement.uploads).toEqual([]);
    expect(
      repository.sqlite
        .prepare("SELECT count(*) AS count FROM versions WHERE chat_id = ?")
        .get(previous.chat.id),
    ).toEqual({ count: 0 });

    repository.close();
  });
});

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
