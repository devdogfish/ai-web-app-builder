import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");
const LEGACY_FEATURE_ROOTS = [
  "src/components",
  "src/config",
  "src/db",
  "src/hooks",
  "src/lib",
  "tests",
] as const;
const NEXT_SHELLS = ["src/app/page.tsx", "src/app/layout.tsx"] as const;
const ARTICLE_IMAGE_ROUTE =
  "src/app/api/articles/[articleId]/images/[imageId]/route.ts";
const BUILDER_REFINEMENT_ROUTE = "src/app/api/builder/refine/route.ts";

describe("Builder module boundary", () => {
  it("removes the old layer-first feature roots", () => {
    expect(findExistingPaths(LEGACY_FEATURE_ROOTS)).toEqual([]);
  });

  it("limits the Builder API route surface to cancellable refinement", () => {
    expect(findRouteFiles("src/app/api/builder")).toEqual([
      BUILDER_REFINEMENT_ROUTE,
    ]);
  });

  it("keeps Next route shells on the Builder public interface", () => {
    for (const shell of NEXT_SHELLS) {
      const contents = readWorkspaceFile(shell);
      const moduleImports = extractImportSpecifiers(contents).filter((source) =>
        source.startsWith("@/modules/builder"),
      );

      expect(moduleImports, shell).toEqual(["@/modules/builder"]);
      expect(contents, shell).not.toContain("@/modules/builder/");
    }
  });

  it("keeps the Article Image route as a framework-only shell", () => {
    const route = readWorkspaceFile(ARTICLE_IMAGE_ROUTE);

    expect(extractImportSpecifiers(route)).toEqual([
      "@/modules/builder/server",
    ]);
    expect(nonEmptyLineCount(route)).toBeLessThanOrEqual(2);
  });

  it("keeps the Builder refinement route as a framework-only shell", () => {
    const route = readWorkspaceFile(BUILDER_REFINEMENT_ROUTE);

    expect(extractImportSpecifiers(route)).toEqual([
      "@/modules/builder/server",
    ]);
    expect(nonEmptyLineCount(route)).toBeLessThanOrEqual(2);
  });

  it("keeps the page runtime configuration at the Next boundary", () => {
    const page = readWorkspaceFile("src/app/page.tsx");

    expect(page).toContain('export const runtime = "nodejs";');
    expect(page).toContain("export const maxDuration = 300;");
    expect(page).toContain("BuilderPage as default");
  });

  it("keeps framework shells thin", () => {
    expect(
      nonEmptyLineCount(readWorkspaceFile("src/app/page.tsx")),
    ).toBeLessThanOrEqual(4);
    expect(
      nonEmptyLineCount(readWorkspaceFile("src/app/layout.tsx")),
    ).toBeLessThanOrEqual(6);
  });

  it("keeps Server Action transaction boundaries in Drizzle", () => {
    const actions = readWorkspaceFile("src/modules/builder/server/actions.ts");

    expect(actions).not.toContain("repository.sqlite.transaction(");
    expect(actions).toContain("repository.db.transaction(");
  });

  it("keeps runtime persistence and schema setup in Drizzle", () => {
    const repositories = [
      "src/modules/builder/db/repository.ts",
      "src/modules/article-images/repository.ts",
      "src/modules/components/repository.ts",
    ];

    for (const repository of repositories) {
      const contents = readWorkspaceFile(repository);
      expect(contents, repository).toContain("drizzle-orm/better-sqlite3");
      expect(contents, repository).not.toContain(".prepare(");
      expect(contents, repository).not.toContain(".exec(");
    }

    const initializer = readWorkspaceFile(
      "src/modules/builder/db/initialize.ts",
    );
    expect(initializer).toContain("migrate(drizzle(sqlite)");
    expect(initializer).not.toContain(".exec(");
    expect(initializer).not.toContain("sqlite_master");
  });

  it("keeps Article Image management out of the conversation transcript", () => {
    const conversation = readWorkspaceFile(
      "src/modules/builder/components/conversation-panel.tsx",
    );

    expect(conversation).not.toContain("ArticleImagesPanel");
    expect(conversation).not.toContain("article-images-panel");
    expect(conversation).toContain("ArticleImageManagerDialog");
    expect(conversation).toContain("ArticleImageStackTrigger");
  });

  it("uses link semantics for the image viewer open action", () => {
    const viewer = readWorkspaceFile(
      "src/modules/builder/components/attachment-viewer.tsx",
    );

    expect(viewer).toMatch(
      /<Button[\s\S]*?nativeButton=\{false\}[\s\S]*?render=\{[\s\S]*?<a[^>]*href=\{source\}/,
    );
  });

  it("preserves attachment image aspect ratios within the viewport", () => {
    const viewer = readWorkspaceFile(
      "src/modules/builder/components/attachment-viewer.tsx",
    );

    expect(viewer).toContain(
      "style={displayWidth ? { width: displayWidth } : undefined}",
    );
    expect(viewer).toContain(
      "aspectRatio: `${dimensions.width} / ${dimensions.height}`",
    );
    expect(viewer).toContain('? "w-full max-w-none"');
  });

  it("preloads image geometry and keeps attachment interactions still", () => {
    const conversation = readWorkspaceFile(
      "src/modules/builder/components/conversation-panel.tsx",
    );
    const viewer = readWorkspaceFile(
      "src/modules/builder/components/attachment-viewer.tsx",
    );

    expect(conversation).toContain("imageDimensions:");
    expect(conversation).toContain("imagePreviewUrl:");
    expect(conversation).not.toContain("hover:-translate-y");
    expect(viewer).not.toContain("motion=");
    expect(viewer).toContain("initialDimensions={target.imageDimensions}");
  });
});

function findExistingPaths(relativePaths: readonly string[]) {
  return relativePaths.filter((relativePath) =>
    existsSync(path.join(WORKSPACE_ROOT, relativePath)),
  );
}

function findRouteFiles(relativeRoot: string): string[] {
  const absoluteRoot = path.join(WORKSPACE_ROOT, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  return readdirSync(absoluteRoot, { recursive: true, encoding: "utf8" })
    .filter((relativePath) => relativePath.endsWith("route.ts"))
    .map((relativePath) => path.join(relativeRoot, relativePath))
    .sort();
}

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8");
}

function extractImportSpecifiers(contents: string) {
  return [...contents.matchAll(/from\s+["']([^"']+)["']/g)].map(
    ([, source]) => source,
  );
}

function nonEmptyLineCount(contents: string) {
  return contents.split("\n").filter((line) => line.trim() !== "").length;
}
