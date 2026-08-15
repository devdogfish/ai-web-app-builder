import { describe, expect, it, vi } from "vitest";

import { ArticleModelError } from "../ai";
import { builderErrorDetails, publicBuilderError } from "./errors";

describe("publicBuilderError", () => {
  it("maps known model failures without logging them as unexpected", () => {
    const logger = vi.fn();

    expect(
      publicBuilderError(
        new ArticleModelError("malformed_response", "invalid protocol"),
        {
          fallback: "fallback",
          context: "Builder refinement failed.",
          logger,
        },
      ),
    ).toBe("The AI provider returned an incomplete or invalid response.");
    expect(logger).not.toHaveBeenCalled();
  });

  it.each([
    [
      "ArticleRepositoryError",
      "Article HTML changed while the refinement was running.",
    ],
    [
      "ArticleSourceValidationError",
      "Article HTML has an unclosed structural tag.",
    ],
    ["UploadValidationError", "The selected upload is invalid."],
  ])("passes through safe %s messages", (name, message) => {
    const error = Object.assign(new Error(message), { name });
    const logger = vi.fn();

    expect(
      publicBuilderError(error, {
        fallback: "fallback",
        context: "Builder refinement failed.",
        logger,
      }),
    ).toBe(message);
    expect(logger).not.toHaveBeenCalled();
  });

  it("surfaces the article-environment mismatch", () => {
    const message =
      "The News Article does not belong to this website and article type.";
    const logger = vi.fn();

    expect(
      publicBuilderError(new Error(message), {
        fallback: "fallback",
        context: "Builder refinement failed.",
        logger,
      }),
    ).toBe(message);
    expect(logger).not.toHaveBeenCalled();
  });

  it("logs unexpected exceptions before returning the safe fallback", () => {
    const error = new TypeError("database driver exploded");
    const logger = vi.fn();

    expect(
      publicBuilderError(error, {
        fallback: "The Builder could not complete this request.",
        context: "Builder refinement failed.",
        logger,
      }),
    ).toBe("The Builder could not complete this request.");
    expect(logger).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith("Builder refinement failed.", error);
  });

  it("returns the safe error code stored with a failed message", () => {
    const error = new ArticleModelError("rate_limit", "private quota detail");

    expect(
      builderErrorDetails(error, {
        fallback: "fallback",
        context: "Builder refinement failed.",
        logger: vi.fn(),
      }),
    ).toEqual({
      code: "rate_limit",
      message: "The AI provider is temporarily rate-limited. Retry shortly.",
    });
  });

  it("preserves an unexpected exception in logs and returns an internal code", () => {
    const error = new TypeError("Unexpected parser state");
    const logger = vi.fn();

    expect(
      builderErrorDetails(error, {
        fallback: "The Builder hit an unexpected error. Retry this request.",
        context: "Builder refinement failed.",
        logger,
      }),
    ).toEqual({
      code: "internal_error",
      message: "The Builder hit an unexpected error. Retry this request.",
    });
    expect(logger).toHaveBeenCalledWith("Builder refinement failed.", error);
  });
});
