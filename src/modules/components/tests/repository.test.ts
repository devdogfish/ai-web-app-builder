import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { ArticleRepository } from "../../builder/db/repository";
import { compileArticleSource } from "../compiler";
import type { ComponentDefinitionInput } from "../contracts";
import {
  ComponentRepository,
} from "../repository";
import { parseArticleSource } from "../source";
import {
  serializeComponentSpec,
  serializeComponentSummaryIndex,
} from "../context";

const callout: ComponentDefinitionInput = {
  type: "callout",
  description: "A simple rich callout.",
  htmlTemplate: '<aside class="{{tone}}">{{{content}}}</aside>',
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      tone: {
        type: "choice",
        options: [
          { value: "note", label: "Note" },
          { value: "warning", label: "Warning" },
        ],
      },
      content: { type: "html", minLength: 1 },
    },
    required: ["tone", "content"],
  },
  uiHints: {
    tone: { label: "Tone", control: "select", order: 1 },
    content: { label: "Content", control: "rich-html", order: 2 },
  },
  defaultData: { tone: "note", content: "<p>Callout content.</p>" },
  sampleData: { tone: "warning", content: "<p>Watch out.</p>" },
};

function createRepository(options: { seedBuiltins?: boolean } = {}) {
  let time = 1_700_000_000_000;
  return new ComponentRepository({
    filename: ":memory:",
    now: () => new Date(++time),
    ...options,
  });
}

describe("ComponentRepository", () => {
  it("seeds the discussed self-contained Components once", () => {
    const repository = createRepository();
    expect(repository.listSummaries()).toEqual([
      expect.objectContaining({ type: "attributed-quote" }),
      expect.objectContaining({ type: "image-carousel" }),
      expect.objectContaining({ type: "tabs" }),
    ]);
    expect(repository.get("tabs")?.htmlTemplate).toContain("<script>");
    expect(repository.get("tabs")?.htmlTemplate).toContain("<style>");
    repository.close();
  });

  it("creates, reads, updates, and strictly validates Components", () => {
    const repository = createRepository({ seedBuiltins: false });
    const created = repository.create(callout);
    expect(repository.get("callout")).toEqual(created);

    const updated = repository.update("callout", {
      ...callout,
      description: "Updated description.",
      htmlTemplate: '<aside data-tone="{{tone}}">{{{content}}}</aside>',
    });
    expect(updated.description).toBe("Updated description.");
    expect(updated.createdAt).toEqual(created.createdAt);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());

    expect(() => repository.create(callout)).toThrowError(
      expect.objectContaining({ code: "component_exists" }),
    );
    expect(() =>
      repository.update("callout", { ...callout, type: "renamed" }),
    ).toThrowError(expect.objectContaining({ code: "component_type_immutable" }));
    expect(() =>
      repository.create({
        ...callout,
        type: "Bad Type",
      }),
    ).toThrow("lowercase kebab-case");
    expect(() =>
      repository.create({
        ...callout,
        type: "bad-template",
        htmlTemplate: "<aside>{{{tone}}}</aside>",
      }),
    ).toThrow("must reference an html field");
    repository.close();
  });

  it("keeps shell code out of summary and progressively disclosed spec context", () => {
    const repository = createRepository({ seedBuiltins: false });
    const definition = repository.create(callout);
    const index = serializeComponentSummaryIndex(repository.list());
    const spec = serializeComponentSpec(definition);

    expect(index).toContain("A simple rich callout");
    expect(index).not.toContain("htmlTemplate");
    expect(index).not.toContain("<aside");
    expect(spec).toContain('"schema"');
    expect(spec).toContain('"sampleData"');
    expect(spec).not.toContain("htmlTemplate");
    expect(spec).not.toContain("<aside");
    repository.close();
  });

  it("rejects a schema change that would invalidate a historical managed instance", () => {
    const sqlite = new Database(":memory:");
    const articleRepository = new ArticleRepository({ sqlite });
    const componentRepository = new ComponentRepository({ sqlite, seedBuiltins: false });
    componentRepository.create(callout);
    const source =
      '<Component type="callout" data={{ tone: "note", content: html`<p>Hi</p>` }} />';
    articleRepository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: source,
      hostHtml: compileArticleSource(source, componentRepository),
    });
    const workspace = articleRepository.getWorkspace("article-1")!;
    const currentSource =
      '<Component type="callout" data={{ tone: "warning", content: html`<p>Current</p>` }} />';
    articleRepository.commitAssistantVersion({
      articleId: "article-1",
      expectedChatId: workspace.chat.id,
      expectedVersionId: workspace.currentVersion.id,
      expectedVersionSha256: workspace.currentVersion.sha256,
      html: currentSource,
      hostHtml: compileArticleSource(currentSource, componentRepository),
      response: "Updated",
      summary: "Updated callout",
    });

    expect(() =>
      componentRepository.update("callout", {
        ...callout,
        schema: {
          ...callout.schema,
          properties: {
            ...callout.schema.properties,
            tone: {
              type: "choice",
              options: [{ value: "warning", label: "Warning" }],
            },
          },
          required: ["tone", "content"],
        },
        defaultData: { ...callout.defaultData, tone: "warning" },
        sampleData: { ...callout.sampleData, tone: "warning" },
      }),
    ).toThrowError(expect.objectContaining({ code: "component_update_breaks_articles" }));

    sqlite.close();
  });

  it("materializes current sources transactionally and retains a hidden historical tombstone", () => {
    const sqlite = new Database(":memory:");
    let id = 0;
    let time = 1_700_000_000_000;
    const articleRepository = new ArticleRepository({
      sqlite,
      createId: () => `id-${++id}`,
      now: () => new Date(++time),
    });
    const componentRepository = new ComponentRepository({
      sqlite,
      seedBuiltins: false,
      now: () => new Date(++time),
    });
    componentRepository.create(callout);
    const historicalSource =
      '<p>V1</p><Component type="callout" data={{ tone: "note", content: html`<p>Old</p>` }} />';
    articleRepository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: historicalSource,
      hostHtml: compileArticleSource(historicalSource, componentRepository),
    });
    const workspace = articleRepository.getWorkspace("article-1")!;
    const currentSource =
      '<p>V2</p><Component type="callout" data={{ tone: "warning", content: html`<p>Current</p>` }} />';
    articleRepository.commitAssistantVersion({
      articleId: "article-1",
      expectedChatId: workspace.chat.id,
      expectedVersionId: workspace.currentVersion.id,
      expectedVersionSha256: workspace.currentVersion.sha256,
      html: currentSource,
      hostHtml: compileArticleSource(currentSource, componentRepository),
      response: "Updated",
      summary: "Updated callout",
    });
    const outboxBefore = sqlite
      .prepare("SELECT version_id, html, sha256 FROM host_sync_outbox ORDER BY version_number")
      .all();

    const deleted = componentRepository.deleteAndMaterialize("callout");
    const after = articleRepository.getWorkspace("article-1")!;

    expect(deleted).toMatchObject({
      materializedArticles: 1,
      materializedActiveVersions: 1,
    });
    expect(parseArticleSource(after.article.html).references).toHaveLength(0);
    expect(parseArticleSource(after.currentVersion.html).references).toHaveLength(0);
    expect(after.currentVersion.html).toContain('<aside class="warning"><p>Current</p></aside>');
    expect(after.versions[0]?.html).toBe(historicalSource);
    expect(componentRepository.get("callout")).toBeNull();
    const tombstone = componentRepository.getForCompilation("callout");
    expect(tombstone?.deletedAt).toBeInstanceOf(Date);
    expect(compileArticleSource(historicalSource, componentRepository)).toContain(
      '<aside class="note"><p>Old</p></aside>',
    );
    expect(
      sqlite.prepare("SELECT version_id, html, sha256 FROM host_sync_outbox ORDER BY version_number").all(),
    ).toEqual(outboxBefore);
    expect(() => componentRepository.create(callout)).toThrowError(
      expect.objectContaining({ code: "component_type_retired" }),
    );
    sqlite.close();
  });

  it("rolls back all source changes when one materialization fails", () => {
    const sqlite = new Database(":memory:");
    const articleRepository = new ArticleRepository({ sqlite });
    const componentRepository = new ComponentRepository({ sqlite, seedBuiltins: false });
    componentRepository.create(callout);
    const source =
      '<Component type="callout" data={{ tone: "note", content: html`<p>Good</p>` }} />';
    articleRepository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: source,
      hostHtml: compileArticleSource(source, componentRepository),
    });
    sqlite
      .prepare("UPDATE articles SET html = ? WHERE id = ?")
      .run('<Component type="callout" data={{ tone: "invalid", content: html`<p>Bad</p>` }} />', "article-1");

    expect(() => componentRepository.deleteAndMaterialize("callout")).toThrow();
    expect(componentRepository.get("callout")).not.toBeNull();
    expect(articleRepository.getWorkspace("article-1")?.article.html).toContain('tone: "invalid"');
    sqlite.close();
  });
});
