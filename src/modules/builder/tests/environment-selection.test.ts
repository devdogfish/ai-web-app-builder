import { describe, expect, it } from "vitest";

import { createArticleRepository } from "../db";
import { assertWorkspaceEnvironment } from "../environment/ownership";
import { INITIAL_BUILDER_ENVIRONMENT } from "../environment/provider";
import {
  getWebsiteConfig,
  switchDevelopmentWebsite,
} from "../environment/websites";

describe("development website selection", () => {
  it("does not reuse one website's stored Article for another website", () => {
    const repository = createArticleRepository({ filename: ":memory:" });
    const rbccm = INITIAL_BUILDER_ENVIRONMENT;
    const cmweb = switchDevelopmentWebsite(rbccm, "cmweb");
    const rbccmConfig = getWebsiteConfig(rbccm.website);

    repository.bootstrapArticle({
      article: {
        id: rbccm.articleId,
        website: rbccmConfig.storageWebsite,
        articleType: rbccmConfig.storageArticleType,
        title: rbccm.articleTitle,
      },
    });

    const reusedWorkspace = repository.getWorkspace(cmweb.articleId);
    expect(() => {
      if (reusedWorkspace) assertWorkspaceEnvironment(reusedWorkspace, cmweb);
    }).not.toThrow(
      "The News Article does not belong to this website and article type.",
    );

    repository.close();
  });

  it("changes the default Article identity when the website selector changes", () => {
    const rbccm = INITIAL_BUILDER_ENVIRONMENT;
    const cmweb = switchDevelopmentWebsite(
      rbccm,
      "cmweb",
      () => "switch-one",
    );

    expect(cmweb).toMatchObject({
      articleId: "local-cmweb-switch-one",
      website: "cmweb",
    });
    expect(
      switchDevelopmentWebsite(cmweb, "rbccm", () => "switch-two")
        .articleId,
    ).toBe("local-rbccm-switch-two");
  });

  it("creates a new Article when the selected website is unchanged", () => {
    const rbccm = INITIAL_BUILDER_ENVIRONMENT;

    expect(switchDevelopmentWebsite(rbccm, "rbccm", () => "switch-three"))
      .toMatchObject({
        articleId: "local-rbccm-switch-three",
        website: "rbccm",
      });
  });
});
