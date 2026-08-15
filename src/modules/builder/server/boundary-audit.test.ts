import { existsSync, readFileSync } from "node:fs";
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

describe("Builder module boundary", () => {
  it("removes the old layer-first feature roots", () => {
    expect(findExistingPaths(LEGACY_FEATURE_ROOTS)).toEqual([]);
  });

  it("removes the Builder API route surface", () => {
    expect(findExistingPaths(["src/app/api/builder"])).toEqual([]);
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

  it("renders bootstrap images only as message attachments", () => {
    const conversation = readWorkspaceFile(
      "src/modules/builder/components/conversation-panel.tsx",
    );

    expect(conversation).not.toContain("ArticleImagesPanel");
    expect(conversation).not.toContain("article-images-panel");
  });

  it("uses link semantics for the image viewer open action", () => {
    const viewer = readWorkspaceFile(
      "src/modules/builder/components/attachment-viewer.tsx",
    );

    expect(viewer).toMatch(
      /<Button[\s\S]*?nativeButton=\{false\}[\s\S]*?render=\{[\s\S]*?<a[^>]*href=\{source\}/,
    );
  });
});

function findExistingPaths(relativePaths: readonly string[]) {
  return relativePaths.filter((relativePath) =>
    existsSync(path.join(WORKSPACE_ROOT, relativePath)),
  );
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
