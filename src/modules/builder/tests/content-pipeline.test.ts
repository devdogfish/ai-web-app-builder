import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  ArticleSourceValidationError,
  ExactEditError,
  applyExactEditsAtomically,
  applyVersionedExactEdits,
  convertSourceToHtml,
  deriveAssetPath,
  estimateContextMeter,
  estimateContextUsage,
  formatArticleHtml,
  planModelContext,
  prepareBootstrapHtml,
  prepareBootstrapSource,
  resolveAssetUrl,
  sanitizeBootstrapHtml,
  validateArticleSource,
  type ArticleAssetContext,
  type SourceConverter,
  type WebsiteAssetPolicy,
} from "../content";

const MINIMAL_DOCX_BASE64 =
  "UEsDBAoAAAAIACK7Dl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMECgAAAAAAIrsOXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAgAIrsOXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBAoAAAAAACK7Dl0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAgAIrsOXQiYmpKuAAAA6AAAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWOu27DMAxFf0XQ3sjNEASGH0OLrOmQAFlVibUNWKRAsnHy97HcocshyEsesOkfaTZ3YJkIW/u+q6wBDBQnHFp7vZzejtaIeox+JoTWPkFs3zVLHSn8JkA1qwClXlo7qubaOQkjJC87yoBr9kOcvK4tD24hjpkpgMjqT7PbV9XBJT+hLcpvis9ScwEXaPd5/rgZhoHLDaFReGjjSlLIG7d9gaBf7LbBn8j9P9m9AFBLAQIUAAoAAAAIACK7Dl15bjPX6AAAAK0BAAATAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQACgAAAAAAIrsOXQAAAAAAAAAAAAAAAAYAAAAAAAAAAAAQAAAAGQEAAF9yZWxzL1BLAQIUAAoAAAAIACK7Dl2b/TfqrQAAACkBAAALAAAAAAAAAAAAAAAAAD0BAABfcmVscy8ucmVsc1BLAQIUAAoAAAAAACK7Dl0AAAAAAAAAAAAAAAAFAAAAAAAAAAAAEAAAABMCAAB3b3JkL1BLAQIUAAoAAAAIACK7Dl0ImJqSrgAAAOgAAAARAAAAAAAAAAAAAAAAADYCAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAABQAFACABAAATAwAAAAA=";

const policy: WebsiteAssetPolicy = {
  cmsOrigin: "https://cms.example.test",
  assetBasePath: "/uploads/news",
  pathTemplate:
    "{articleType}/{articleSlug}/{articleId}-{position}.{extension}",
  preferredImageExtension: ".webp",
  positionPadLength: 3,
};

const article: ArticleAssetContext = {
  websiteId: "site-one",
  articleTypeId: "story",
  articleId: "abc-123",
  articleSlug: "A launch / today",
};

describe("asset paths", () => {
  it("derives stable root-relative paths from policy, article context, and document order", () => {
    expect(deriveAssetPath(policy, article, 2)).toBe(
      "/uploads/news/story/A-launch-today/abc-123-002.webp",
    );
    expect(resolveAssetUrl(policy, deriveAssetPath(policy, article, 2))).toBe(
      "https://cms.example.test/uploads/news/story/A-launch-today/abc-123-002.webp",
    );
  });

  it("rejects traversal and unknown template tokens", () => {
    expect(() =>
      deriveAssetPath({ ...policy, assetBasePath: "../private" }, article, 1),
    ).toThrow(/dot segments/);
    expect(() =>
      deriveAssetPath(
        { ...policy, pathTemplate: "{unknown}.webp" },
        article,
        1,
      ),
    ).toThrow(/unsupported token/);
  });
});

describe("generated Article HTML formatting", () => {
  it("formats an HTML fragment", async () => {
    await expect(
      formatArticleHtml(
        "<article><h1>Title</h1><p>Hello <strong>world</strong></p></article>",
      ),
    ).resolves.toBe(
      "<article>\n  <h1>Title</h1>\n  <p>Hello <strong>world</strong></p>\n</article>\n",
    );
  });

  it("formats a complete HTML document without changing its form", async () => {
    const formatted = await formatArticleHtml(
      "<!doctype html><html><head><title>Title</title></head><body><article><p>Copy</p></article></body></html>",
    );

    expect(formatted).toBe(
      "<!doctype html>\n<html>\n  <head>\n    <title>Title</title>\n  </head>\n  <body>\n    <article><p>Copy</p></article>\n  </body>\n</html>\n",
    );
  });
});

describe("bootstrap sanitization", () => {
  it("sanitizes and formats pasted HTML before it becomes version 1", async () => {
    const result = await prepareBootstrapHtml({
      html: "<article><h1>Title</h1><p>Copy</p></article>",
      assetPolicy: policy,
      article,
    });

    expect(result).toBe(
      "<article>\n  <h1>Title</h1>\n  <p>Copy</p>\n</article>\n",
    );
  });

  it("converts DOCX bytes with Mammoth's Node input contract", async () => {
    const result = await convertSourceToHtml({
      kind: "docx",
      bytes: Buffer.from(MINIMAL_DOCX_BASE64, "base64"),
      fileName: "minimal.docx",
    });

    expect(result.html).toContain("<p>DOCX regression text</p>");
    expect(result.images).toEqual([]);
  });

  it("extracts embedded DOCX image bytes in document order", async () => {
    const result = await convertSourceToHtml({
      kind: "docx",
      bytes: await docxWithPng(),
      fileName: "article.docx",
    });

    expect(result.html).toContain('src="bootstrap-image-1"');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      name: "article-image-01.png",
      mediaType: "image/png",
    });
    expect(Array.from(result.images[0].bytes.slice(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });

  it("structurally removes active content, unwraps spans/unknown tags, and replaces image sources", () => {
    const source = `
      <html><head><style>.bad { color:red }</style><script>alert(1)</script></head>
      <body onload="steal()">
        <article data-secret="x" style="color:red">
          <custom><span class="kept" style="font-size:99px">Hello <b onclick="x()">world</b></span></custom>
          <img src="data:image/png;base64,AAAA" alt="First" width="640" height="480" style="width:999px" onerror="x()">
          <form><p>do not preserve this control subtree</p><input value="secret"></form>
          <img src="https://untrusted.example/image.jpg" alt="Second" loading="lazy">
        </article>
      </body></html>`;

    const result = sanitizeBootstrapHtml({
      html: source,
      assetPolicy: policy,
      article,
    });

    expect(result).toContain("Hello <b>world</b>");
    expect(result).not.toMatch(
      /script|width:999px|color:red|font-size:99px|onclick|onload|data-secret|<span|<custom|<form|secret/,
    );
    expect(result).toContain(
      '<img src="/uploads/news/story/A-launch-today/abc-123-001.webp" alt="First" width="640" height="480" style="max-width: 100%;" />',
    );
    expect(result).toContain(
      '<img src="/uploads/news/story/A-launch-today/abc-123-002.webp" alt="Second" loading="lazy" style="max-width: 100%;" />',
    );
  });

  it("uses the same sanitizer after an injected format converter", async () => {
    const converter: SourceConverter = {
      kind: "docx",
      async convert() {
        return {
          html: '<p style="color:red">Converted</p><img src="embedded">',
          warnings: ["note"],
          images: [],
        };
      },
    };

    const result = await prepareBootstrapSource(
      { kind: "docx", bytes: new Uint8Array([1]), fileName: "source.docx" },
      { assetPolicy: policy, article },
      { docx: converter, html: { ...converter, kind: "html" } },
    );

    expect(result.warnings).toEqual(["note"]);
    expect(result.html).toBe(await formatArticleHtml(result.html));
    expect(result.html).toContain("<p>Converted</p>\n<img");
  });
});

async function docxWithPng(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
      </Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <w:body><w:p><w:r><w:drawing><wp:inline>
          <wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Image 1"/>
          <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>
              <pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
              <pic:spPr><a:xfrm/><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
            </pic:pic>
          </a:graphicData></a:graphic>
        </wp:inline></w:drawing></w:r></w:p><w:sectPr/></w:body>
      </w:document>`,
  );
  zip.file(
    "word/media/image1.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("atomic exact edits", () => {
  it("applies all edits against the same base", () => {
    expect(
      applyExactEditsAtomically("<h1>Title</h1><p>Old Old</p>", [
        { oldText: "Title", newText: "New title" },
        { oldText: "Old", newText: "Fresh", replaceAll: true },
      ]),
    ).toBe("<h1>New title</h1><p>Fresh Fresh</p>");
  });

  it("rejects the whole set on missing, ambiguous, overlapping, and stale edits", () => {
    expect(() =>
      applyExactEditsAtomically("one two two", [
        { oldText: "one", newText: "1" },
        { oldText: "missing", newText: "x" },
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<ExactEditError>>({
        code: "missing_match",
      }),
    );
    expect(() =>
      applyExactEditsAtomically("two two", [{ oldText: "two", newText: "2" }]),
    ).toThrowError(
      expect.objectContaining<Partial<ExactEditError>>({
        code: "ambiguous_match",
      }),
    );
    expect(() =>
      applyExactEditsAtomically("abcdef", [
        { oldText: "abcd", newText: "x" },
        { oldText: "cdef", newText: "y" },
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<ExactEditError>>({
        code: "overlapping_edits",
      }),
    );
    expect(() =>
      applyVersionedExactEdits({
        content: "old",
        baseVersionId: "v1",
        latestVersionId: "v2",
        edits: [{ oldText: "old", newText: "new" }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ExactEditError>>({
        code: "stale_version",
      }),
    );
  });
});

describe("context budget", () => {
  it("exposes a direct usage estimate for the UI meter", () => {
    expect(
      estimateContextUsage("a".repeat(40), {
        maxContextTokens: 20,
        reservedOutputTokens: 0,
      }),
    ).toMatchObject({
      estimatedTokens: 18,
      inputBudgetTokens: 20,
      usageRatio: 0.9,
      warning: true,
    });
  });

  it("lets context pressure grow until compaction, then resets it", () => {
    const messages = Array.from({ length: 100 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `turn-${index} ${"x".repeat(400)}`,
    }));
    const eightTurns = estimateContextMeter({
      fixedContent: ["system", "environment", "document", "prompt"],
      messages: messages.slice(0, 8),
    });
    const oneHundredTurns = estimateContextMeter({
      fixedContent: ["system", "environment", "document", "prompt"],
      messages,
    });
    const afterCompaction = estimateContextMeter({
      fixedContent: ["system", "environment", "document", "prompt"],
      messages,
      compactedThroughMessageId: "m91",
      compactMemoryTokens: 1_000,
    });

    expect(oneHundredTurns.percentage).toBeGreaterThan(eightTurns.percentage);
    expect(afterCompaction.percentage).toBeLessThan(oneHundredTurns.percentage);
    expect(afterCompaction.historyCompacted).toBe(true);
  });

  it("keeps all turns while raw context pressure is below the threshold", () => {
    const result = planModelContext({
      systemInstructions: "sys",
      currentRequest: "request",
      currentDocument: "document",
      recentMessages: [
        { id: "m1", role: "user", text: "one" },
        { id: "m2", role: "assistant", text: "two" },
        { id: "m3", role: "user", text: "three" },
      ],
      options: {
        maxContextTokens: 1_000,
        reservedOutputTokens: 0,
        retainedTurnsAfterCompaction: 2,
      },
    });

    expect(result.messages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
    expect(result.compacted).toBe(false);
  });

  it("retains recent turns and reports compaction at the pressure threshold", () => {
    const result = planModelContext({
      systemInstructions: "sys",
      currentRequest: "request",
      currentDocument: "document",
      recentMessages: [
        { id: "m1", role: "user", text: "a".repeat(80) },
        { id: "m2", role: "assistant", text: "b".repeat(80) },
        { id: "m3", role: "user", text: "c".repeat(80) },
      ],
      options: {
        maxContextTokens: 100,
        reservedOutputTokens: 10,
        warningRatio: 0.5,
        retainedTurnsAfterCompaction: 2,
      },
    });

    expect(result.blocked).toBe(false);
    expect(result.messages.map((message) => message.id)).toEqual(["m2", "m3"]);
    expect(result.excludedMessageIds).toEqual(["m1"]);
    expect(result.compacted).toBe(true);
  });

  it("blocks only when essentials cannot fit and identifies the largest selected upload", () => {
    const result = planModelContext({
      systemInstructions: "sys",
      currentRequest: "request",
      currentDocument: "document",
      recentMessages: [],
      selectedUploads: [
        { id: "small", name: "small.txt", text: "a".repeat(10) },
        { id: "large", name: "large.txt", text: "b".repeat(500) },
      ],
      options: { maxContextTokens: 100, reservedOutputTokens: 10 },
    });

    expect(result.blocked).toBe(true);
    expect(result.blockingUpload?.name).toBe("large.txt");
  });

  it("budgets the Component index and progressively loaded specs as essentials", () => {
    const withoutComponents = planModelContext({
      systemInstructions: "sys",
      currentRequest: "request",
      currentDocument: "<p>article</p>",
      recentMessages: [],
      options: { maxContextTokens: 80, reservedOutputTokens: 0 },
    });
    const withComponents = planModelContext({
      systemInstructions: "sys",
      currentRequest: "request",
      currentDocument: "<p>article</p>",
      additionalFixedContent: ["component spec ".repeat(80)],
      recentMessages: [],
      options: { maxContextTokens: 80, reservedOutputTokens: 0 },
    });

    expect(withoutComponents.blocked).toBe(false);
    expect(withComponents.blocked).toBe(true);
    expect(withComponents.estimatedTokens).toBeGreaterThan(
      withoutComponents.estimatedTokens,
    );
  });
});

describe("article source validation", () => {
  it("accepts fragments and complete documents without rewriting either", () => {
    expect(validateArticleSource("<article><p>Hello</p></article>").valid).toBe(
      true,
    );
    expect(
      validateArticleSource('<article><img src="/image.webp" alt=""></article>')
        .valid,
    ).toBe(true);
    expect(
      validateArticleSource("<!doctype html><html><body>Hello</body></html>")
        .valid,
    ).toBe(true);
  });

  it("rejects likely malformed provider output", () => {
    expect(
      validateArticleSource("```html\n<p>Hello</p>\n```").issues[0].code,
    ).toBe("markdown_fence");
    expect(
      validateArticleSource("<!doctype html><html><body>truncated").issues,
    ).toContainEqual(expect.objectContaining({ code: "incomplete_document" }));
    expect(
      validateArticleSource("<article><div>truncated").issues,
    ).toContainEqual(expect.objectContaining({ code: "unclosed_tag" }));
    expect(() => {
      const validation = validateArticleSource("");
      if (!validation.valid) throw new ArticleSourceValidationError(validation);
    }).toThrow(ArticleSourceValidationError);
  });
});
