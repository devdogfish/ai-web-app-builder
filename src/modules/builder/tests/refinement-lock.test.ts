import { describe, expect, it } from "vitest";

import { ArticleRefinementCoordinator } from "../server/refinement-lock";

describe("ArticleRefinementCoordinator", () => {
  it("rejects an overlapping refinement for the same Article", async () => {
    const coordinator = new ArticleRefinementCoordinator();
    let release!: () => void;
    const first = coordinator.run(
      "article-1",
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    await expect(
      coordinator.run("article-1", async () => undefined),
    ).rejects.toMatchObject({
      code: "refinement_in_progress",
      message: "Refinement already in progress.",
    });

    release();
    await first;
    await expect(
      coordinator.run("article-1", async () => "available"),
    ).resolves.toBe("available");
  });

  it("allows different Articles to refine concurrently", async () => {
    const coordinator = new ArticleRefinementCoordinator();
    let release!: () => void;
    const first = coordinator.run(
      "article-1",
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    await expect(
      coordinator.run("article-2", async () => "available"),
    ).resolves.toBe("available");
    release();
    await first;
  });
});
