import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initializeDatabase } from "../../builder/db/initialize";

import {
  ArticleImageRepository,
  ArticleImageRepositoryError,
} from "../repository";

describe("ArticleImageRepository", () => {
  let sqlite: Database.Database;
  let repository: ArticleImageRepository;
  let nextId: number;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    initializeDatabase(sqlite);
    sqlite
      .prepare(
        `
        INSERT INTO articles (
          id, website, article_type, title, html, created_at, updated_at
        ) VALUES ('article-1', 'site', 'story', 'Story', '', 1, 1)
      `,
      )
      .run();
    nextId = 1;
    repository = new ArticleImageRepository(sqlite, {
      createId: () => `image-${nextId++}`,
      now: () => new Date("2026-08-14T12:00:00.000Z"),
    });
  });

  afterEach(() => sqlite.close());

  it("stores original bytes, filename, and dense upload order", () => {
    const images = repository.add("article-1", [
      file("First Photo.JPG", [1, 2, 3]),
      file("second.webp", [4, 5]),
    ]);

    expect(
      images.map((image) => [image.id, image.position, image.originalName]),
    ).toEqual([
      ["image-1", 1, "First Photo.JPG"],
      ["image-2", 2, "second.webp"],
    ]);
    expect(images.every((image) => image.needsUpload)).toBe(true);
    expect(repository.getBinary("article-1", "image-1").bytes).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("replaces converted bytes and marks the image for upload", () => {
    repository.add("article-1", [file("source.png", [1, 2])]);
    repository.markUploaded("article-1");

    const replaced = repository.replaceBinary("article-1", "image-1", {
      name: "source.png",
      mediaType: "image/jpeg",
      bytes: new Uint8Array([3, 4, 5]),
    });

    expect(replaced).toMatchObject({
      mediaType: "image/jpeg",
      sizeBytes: 3,
      needsUpload: true,
    });
    expect(repository.getBinary("article-1", "image-1").bytes).toEqual(
      new Uint8Array([3, 4, 5]),
    );
  });

  it("flags exactly the images whose positions change", () => {
    repository.add(
      "article-1",
      Array.from({ length: 7 }, (_, index) =>
        file(`${index + 1}.png`, [index + 1]),
      ),
    );
    repository.markUploaded("article-1");

    const reordered = repository.reorder("article-1", [
      "image-1",
      "image-3",
      "image-4",
      "image-5",
      "image-6",
      "image-7",
      "image-2",
    ]);

    expect(reordered.map((image) => image.id)).toEqual([
      "image-1",
      "image-3",
      "image-4",
      "image-5",
      "image-6",
      "image-7",
      "image-2",
    ]);
    expect(reordered.map((image) => image.needsUpload)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("flags every successor shifted by a removal", () => {
    repository.add("article-1", [
      file("1.png", [1]),
      file("2.png", [2]),
      file("3.png", [3]),
      file("4.png", [4]),
    ]);
    repository.markUploaded("article-1");

    const remaining = repository.remove("article-1", "image-2");

    expect(
      remaining.map((image) => [image.id, image.position, image.needsUpload]),
    ).toEqual([
      ["image-1", 1, false],
      ["image-3", 2, true],
      ["image-4", 3, true],
    ]);
  });

  it("rejects partial, duplicate, and foreign reorder lists", () => {
    repository.add("article-1", [file("1.png", [1]), file("2.png", [2])]);

    for (const order of [
      ["image-1"],
      ["image-1", "image-1"],
      ["image-1", "foreign"],
    ]) {
      expect(() => repository.reorder("article-1", order)).toThrowError(
        ArticleImageRepositoryError,
      );
    }
  });

  it("acknowledges only the images confirmed by the CMS workflow", () => {
    repository.add("article-1", [file("1.png", [1]), file("2.png", [2])]);

    const images = repository.markUploaded("article-1", ["image-1"]);

    expect(images.map((image) => image.needsUpload)).toEqual([false, true]);
    expect(
      repository.listNeedingUpload("article-1").map((image) => image.id),
    ).toEqual(["image-2"]);
  });
});

function file(name: string, bytes: number[]) {
  return {
    name,
    mediaType: name.endsWith("webp") ? "image/webp" : "image/png",
    bytes: new Uint8Array(bytes),
  };
}
