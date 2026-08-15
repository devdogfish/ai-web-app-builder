import { describe, expect, it } from "vitest";

import { BUILDER_UPLOAD_LIMITS } from "../config/builder";
import {
  fileExtension,
  validateBootstrapDocument,
  validateReferenceUploads,
} from "../uploads";

describe("upload validation", () => {
  it("accepts all configured reference extensions case-insensitively", () => {
    const files = BUILDER_UPLOAD_LIMITS.referenceExtensions.map(
      (extension, index) => ({
        name: `file-${index}${extension.toUpperCase()}`,
        size: 1,
      }),
    );

    // Validate in two messages because the configured per-message maximum is ten.
    expect(validateReferenceUploads(files.slice(0, 10)).valid).toBe(true);
    expect(validateReferenceUploads(files.slice(10)).valid).toBe(true);
    expect(fileExtension("C:\\fakepath\\ARTICLE.HTML")).toBe(".html");
  });

  it("enforces file count, per-file bytes, aggregate bytes, and extension", () => {
    const files = Array.from({ length: 11 }, (_, index) => ({
      name: index === 0 ? "bad.exe" : `file-${index}.txt`,
      size: index < 3 ? BUILDER_UPLOAD_LIMITS.maxBytesPerFile + 1 : 1,
    }));
    const result = validateReferenceUploads(files);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "too_many_files",
        "file_too_large",
        "total_too_large",
        "unsupported_extension",
      ]),
    );
  });

  it("limits bootstrap documents to HTML/HTM/DOCX", () => {
    expect(
      validateBootstrapDocument({ name: "article.docx", size: 10 }).valid,
    ).toBe(true);
    expect(
      validateBootstrapDocument({ name: "article.pdf", size: 10 }).issues,
    ).toContainEqual(
      expect.objectContaining({ code: "unsupported_extension" }),
    );
  });

  it("rejects missing and oversized filenames", () => {
    expect(
      validateReferenceUploads([{ name: "", size: 1 }]).issues,
    ).toContainEqual(expect.objectContaining({ code: "invalid_name" }));
    expect(
      validateReferenceUploads([{ name: `${"a".repeat(252)}.txt`, size: 1 }])
        .issues,
    ).toContainEqual(expect.objectContaining({ code: "invalid_name" }));
  });
});
