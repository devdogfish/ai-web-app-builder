import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { ArticleRepository } from "../../builder/db/repository";
import { compileArticleSource } from "../compiler";
import type { ComponentDefinitionInput } from "../contracts";
import { initializeComponentsDatabase } from "../db/initialize";
import { formatComponentSource } from "../format-source";
import {
  serializeComponentSpec,
  serializeComponentSummaryIndex,
} from "../context";
import { ComponentRepository } from "../repository";
import { parseArticleSource } from "../source";

const callout: ComponentDefinitionInput = {
  source: `
type Props = {
  tone: "note" | "warning";
  content: React.ReactNode;
};

/** A simple rich callout. */
export default function Callout({
  tone = "note",
  content = "<p>Callout content.</p>",
}: Props) {
  return <aside className={tone}>{content}</aside>;
}`,
};

const warningOnly: ComponentDefinitionInput = {
  source: callout.source
    .replace('tone: "note" | "warning"', 'tone: "warning"')
    .replace('tone = "note"', 'tone = "warning"'),
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
  it("creates the current Component schema through Drizzle migrations", () => {
    const sqlite = new Database(":memory:");
    initializeComponentsDatabase(sqlite);

    expect(
      (
        sqlite
          .prepare("PRAGMA table_info(component_definitions)")
          .all() as Array<{
          name: string;
        }>
      ).map((column) => column.name),
    ).toEqual(
      expect.arrayContaining([
        "id",
        "tag",
        "name",
        "source",
        "compiled_source",
      ]),
    );
    sqlite.close();
  });

  it("does not reapply the baseline migration", () => {
    const sqlite = new Database(":memory:");
    initializeComponentsDatabase(sqlite);
    initializeComponentsDatabase(sqlite);
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations")
        .get(),
    ).toEqual({ count: 1 });
    sqlite.close();
  });

  it("seeds authoritative self-contained TSX Components", () => {
    const sqlite = new Database(":memory:");
    const repository = new ComponentRepository({ sqlite });
    expect(repository.listSummaries()).toEqual([
      expect.objectContaining({ tag: "AttributedQuote" }),
      expect.objectContaining({ tag: "ImageCarousel" }),
      expect.objectContaining({ tag: "Tabs" }),
    ]);
    expect(repository.getByTag("Tabs")?.source).toContain("tabs.map");
    expect(repository.getByTag("Tabs")?.source).toContain("<script>");
    expect(repository.getByTag("Tabs")?.source).not.toContain("TABS_SCRIPT");
    expect(repository.getByTag("Tabs")?.source).not.toContain("<style");
    repository.sqlite
      .prepare("UPDATE component_definitions SET source = ? WHERE id = ?")
      .run("legacy source", "tabs");
    repository.close();

    const reseeded = new ComponentRepository({ sqlite });
    expect(reseeded.get("tabs")?.source).not.toBe("legacy source");
    expect(reseeded.get("tabs")?.source).toContain('style={{ border: "1px');
    reseeded.close();
    sqlite.close();
  });

  it("creates, reads, updates, and validates Component Source", async () => {
    const repository = createRepository({ seedBuiltins: false });
    const created = await repository.create(callout);
    expect(repository.get(created.id)).toEqual(created);
    expect(created.source).toBe(await formatComponentSource(callout.source));

    const updated = await repository.update(created.id, {
      name: "Editorial Callout",
      description: "Updated description.",
      source: callout.source.replace(
        "A simple rich callout.",
        "Source documentation changed.",
      ),
    });
    expect(updated.tag).toBe("EditorialCallout");
    expect(updated.name).toBe("Editorial Callout");
    expect(updated.description).toBe("Updated description.");
    expect(updated.createdAt).toEqual(created.createdAt);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );

    await expect(
      repository.create({ ...callout, name: "Editorial Callout" }),
    ).rejects.toMatchObject({
      code: "component_exists",
    });
    const renamedFunction = await repository.update(created.id, {
      source: callout.source.replace("function Callout", "function Renamed"),
    });
    expect(renamedFunction.tag).toBe("EditorialCallout");
    expect(renamedFunction.name).toBe("Editorial Callout");
    expect(renamedFunction.description).toBe("Updated description.");
    expect(renamedFunction.source).toContain("function Renamed");
    await expect(
      repository.create({ source: `import x from "x"; ${callout.source}` }),
    ).rejects.toThrow("imports are not allowed");
    repository.close();
  });

  it("keeps identity stable while tag follows the Component name", async () => {
    const repository = createRepository({ seedBuiltins: false });
    const created = await repository.create({
      ...callout,
      name: "New Component",
    });

    const updated = await repository.update(created.id, {
      ...callout,
      name: "Simple Tabs",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.tag).toBe("SimpleTabs");
    expect(repository.get(created.id)?.tag).toBe("SimpleTabs");
    expect(repository.listSummaries()).toContainEqual(
      expect.objectContaining({ id: created.id, tag: "SimpleTabs" }),
    );
    repository.close();
  });

  it("rejects duplicate active tags derived from Component names", async () => {
    const repository = createRepository({ seedBuiltins: false });
    await repository.create({ ...callout, name: "Simple Tabs" });

    await expect(
      repository.create({
        ...callout,
        name: "Simple   Tabs!",
        source: callout.source.replace("function Callout", "function Other"),
      }),
    ).rejects.toMatchObject({ code: "component_exists" });
    repository.close();
  });

  it("keeps executable source out of model context", async () => {
    const repository = createRepository({ seedBuiltins: false });
    const definition = await repository.create(callout);
    const index = serializeComponentSummaryIndex(repository.list());
    const spec = serializeComponentSpec(definition);

    expect(index).toContain("A simple rich callout");
    expect(index).not.toContain(definition.id);
    expect(index).not.toContain("compiledSource");
    expect(index).not.toContain("<aside");
    expect(spec).toContain('"schema"');
    expect(spec).toContain('"sampleData"');
    expect(spec).not.toContain(definition.id);
    expect(spec).not.toContain("compiledSource");
    expect(spec).not.toContain("<aside");
    repository.close();
  });

  it("rejects a prop change that invalidates a historical managed instance", async () => {
    const sqlite = new Database(":memory:");
    const articleRepository = new ArticleRepository({ sqlite });
    const componentRepository = new ComponentRepository({
      sqlite,
      seedBuiltins: false,
    });
    const component = await componentRepository.create(callout);
    const source = `<Component id="${component.id}" data={{ tone: "note", content: html\`<p>Hi</p>\` }} />`;
    articleRepository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: source,
      hostHtml: await compileArticleSource(source, componentRepository),
    });

    await expect(
      componentRepository.update(component.id, warningOnly),
    ).rejects.toMatchObject({ code: "component_update_breaks_articles" });
    sqlite.close();
  });

  it("ignores broken references in articles that do not use the updated Component", async () => {
    const sqlite = new Database(":memory:");
    const articleRepository = new ArticleRepository({ sqlite });
    const componentRepository = new ComponentRepository({
      sqlite,
      seedBuiltins: false,
    });
    const component = await componentRepository.create(callout);
    articleRepository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: '<Component type="missing" data={{}} />',
      hostHtml: "<p>Legacy output</p>",
    });

    const updated = await componentRepository.update(component.id, {
      ...callout,
      name: "Renamed Callout",
    });

    expect(updated.tag).toBe("RenamedCallout");
    expect(updated.name).toBe("Renamed Callout");
    sqlite.close();
  });

  it("materializes current sources and retains a historical tombstone", async () => {
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
    const component = await componentRepository.create(callout);
    const historicalSource = `<p>V1</p><Component id="${component.id}" data={{ tone: "note", content: html\`<p>Old</p>\` }} />`;
    articleRepository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: historicalSource,
      hostHtml: await compileArticleSource(
        historicalSource,
        componentRepository,
      ),
    });
    const workspace = articleRepository.getWorkspace("article-1")!;
    const currentSource = `<p>V2</p><Component id="${component.id}" data={{ tone: "warning", content: html\`<p>Current</p>\` }} />`;
    articleRepository.commitAssistantVersion({
      articleId: "article-1",
      expectedChatId: workspace.chat.id,
      expectedVersionId: workspace.currentVersion.id,
      expectedVersionSha256: workspace.currentVersion.sha256,
      html: currentSource,
      hostHtml: await compileArticleSource(currentSource, componentRepository),
      response: "Updated",
      summary: "Updated callout",
    });
    const outboxBefore = sqlite
      .prepare(
        "SELECT version_id, html, sha256 FROM host_sync_outbox ORDER BY version_number",
      )
      .all();

    const deleted = await componentRepository.deleteAndMaterialize(
      component.id,
    );
    const after = articleRepository.getWorkspace("article-1")!;

    expect(deleted).toMatchObject({
      materializedArticles: 1,
      materializedActiveVersions: 1,
    });
    expect(parseArticleSource(after.article.html).references).toHaveLength(0);
    expect(
      parseArticleSource(after.currentVersion.html).references,
    ).toHaveLength(0);
    expect(after.currentVersion.html).toContain(
      '<aside class="warning"><p>Current</p></aside>',
    );
    expect(after.versions[0]?.html).toBe(historicalSource);
    expect(componentRepository.get(component.id)).toBeNull();
    const tombstone = componentRepository.getForCompilation(component.id);
    expect(tombstone?.deletedAt).toBeInstanceOf(Date);
    expect(
      await compileArticleSource(historicalSource, componentRepository),
    ).toContain('<aside class="note"><p>Old</p></aside>');
    expect(
      sqlite
        .prepare(
          "SELECT version_id, html, sha256 FROM host_sync_outbox ORDER BY version_number",
        )
        .all(),
    ).toEqual(outboxBefore);
    const replacement = await componentRepository.create(callout);
    expect(replacement.tag).toBe("Callout");
    expect(replacement.id).not.toBe(component.id);
    sqlite.close();
  });

  it("keeps sources unchanged when materialization fails", async () => {
    const sqlite = new Database(":memory:");
    const articleRepository = new ArticleRepository({ sqlite });
    const componentRepository = new ComponentRepository({
      sqlite,
      seedBuiltins: false,
    });
    const component = await componentRepository.create(callout);
    const source = `<Component id="${component.id}" data={{ tone: "note", content: html\`<p>Good</p>\` }} />`;
    articleRepository.bootstrapArticle({
      article: { id: "article-1", website: "news", articleType: "story" },
      html: source,
      hostHtml: await compileArticleSource(source, componentRepository),
    });
    sqlite
      .prepare("UPDATE articles SET html = ? WHERE id = ?")
      .run(
        `<Component id="${component.id}" data={{ tone: "invalid", content: html\`<p>Bad</p>\` }} />`,
        "article-1",
      );

    await expect(
      componentRepository.deleteAndMaterialize(component.id),
    ).rejects.toThrow();
    expect(componentRepository.get(component.id)).not.toBeNull();
    expect(articleRepository.getWorkspace("article-1")?.article.html).toContain(
      'tone: "invalid"',
    );
    sqlite.close();
  });
});
