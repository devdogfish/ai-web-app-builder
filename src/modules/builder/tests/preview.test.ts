import { describe, expect, it } from "vitest";

import { createPreviewDocument } from "../preview/create-preview-document";

const policy = {
  cmsOrigin: "https://cms.example.test",
  assetBasePath: "/media/articles" as const,
  namingConvention: "article-slug-position" as const,
  preferredImageExtension: "webp" as const,
  allowedPreviewOrigins: ["https://cms.example.test"],
};

describe("preview document", () => {
  it("places restrictions before misleading document-like source", () => {
    const result = createPreviewDocument(
      '<!-- <html><head> --><script src="https://evil.test/x.js"></script>',
      policy,
    );
    expect(result.indexOf("Content-Security-Policy")).toBeLessThan(
      result.indexOf("<!-- <html>"),
    );
    expect(result).toContain("img-src https://cms.example.test data: blob:");
    expect(result).not.toMatch(/img-src https:(?:[ ;])/);
    expect(result).toContain("navigate-to 'none'");
  });

  it("wraps complete documents only in the render copy", () => {
    const source =
      "<!doctype html><html><head><title>X</title></head><body>Body</body></html>";
    const result = createPreviewDocument(source, policy);
    expect(result).toContain(source);
    expect(result.startsWith("<!doctype html><html><head>")).toBe(true);
  });

  it("injects locally mirrored RBCCM assets around the article source", () => {
    const source = '<article class="story">Article</article>';
    const result = createPreviewDocument(source, policy, {
      siteProfile: "rbccm",
      assetOrigin: "http://localhost:3000/builder",
    });

    expect(result).toContain(
      'href="http://localhost:3000/preview-sites/rbccm/origin/assets/rbccm/css/rbccm.2.css"',
    );
    expect(result).toContain(
      'src="http://localhost:3000/preview-sites/rbccm/origin/assets/rbccm/js/jquery-3.5.1.min.js"',
    );
    expect(result).toContain(
      "script-src 'unsafe-inline' http://localhost:3000",
    );
    expect(result).toContain("'unsafe-eval'");
    expect(result).toContain('e.message==="Script error."');
    expect(result).toContain("<style>img{max-width:100%}</style>");
    expect(result).toContain(
      `<body><div style="padding-inline:15px">${source}</div>`,
    );
    expect(result.indexOf("rbccm.2.css")).toBeLessThan(result.indexOf(source));
    expect(result.indexOf(source)).toBeLessThan(
      result.indexOf("inline/script-01.js"),
    );
  });

  it("keeps CMWeb and the explicit fallback without site assets", () => {
    for (const siteProfile of ["cmweb", "unstyled"] as const) {
      const result = createPreviewDocument("<p>Plain</p>", policy, {
        siteProfile,
        assetOrigin: "http://localhost:3000",
      });
      expect(result).not.toMatch(/(?:src|href)="[^"]*\/preview-sites\//);
      expect(result).not.toContain("<style");
      expect(result).not.toContain('rel="stylesheet"');
    }
  });

  it("pads CMWeb preview content while leaving the fallback unwrapped", () => {
    const source = "<p>Plain</p>";
    const cmweb = createPreviewDocument(source, policy, {
      siteProfile: "cmweb",
    });
    const unstyled = createPreviewDocument(source, policy, {
      siteProfile: "unstyled",
    });

    expect(cmweb).toContain(
      `<body><div style="padding-inline:15px">${source}</div>`,
    );
    expect(unstyled).toContain(`<body>${source}`);
    expect(unstyled).not.toContain('<div style="padding-inline:15px">');
  });

  it("routes production image paths through their CMS-first preview proxies", () => {
    const result = createPreviewDocument(
      '<img src="/media/articles/story-01.webp">',
      policy,
      {
        assetOrigin: "http://localhost:3000",
        imageProxies: [
          {
            productionPath: "/media/articles/story-01.webp",
            previewUrl:
              "http://localhost:3000/api/articles/article-1/images/image-1?production=https%3A%2F%2Fcms.example.test%2Fmedia%2Farticles%2Fstory-01.webp",
          },
        ],
      },
    );

    expect(result).toContain(
      '"/media/articles/story-01.webp":"http://localhost:3000/api/articles/article-1/images/image-1?production=https%3A%2F%2Fcms.example.test%2Fmedia%2Farticles%2Fstory-01.webp"',
    );
    expect(result).toContain('document.querySelectorAll("img").forEach(apply)');
    expect(result).toContain('image.dataset.previewProxyApplied="true"');
    expect(result).toContain(
      "img-src https://cms.example.test http://localhost:3000",
    );
  });
});
