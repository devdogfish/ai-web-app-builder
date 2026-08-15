"use client";

import { createContext, useContext, useState } from "react";

import type { BuilderEnvironment, Website } from "./types";
import {
  getDevelopmentArticleId,
  switchDevelopmentWebsite,
} from "./websites";

export const INITIAL_BUILDER_ENVIRONMENT: BuilderEnvironment = {
  articleId: getDevelopmentArticleId("rbccm"),
  articleTitle: "Untitled article",
  articleSlug: "untitled-article",
  website: "rbccm",
};

interface BuilderEnvironmentContextValue {
  environment: BuilderEnvironment;
  setWebsite: (website: Website) => void;
}

const BuilderEnvironmentContext =
  createContext<BuilderEnvironmentContextValue | null>(null);

export function BuilderEnvironmentProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [currentEnvironment, setEnvironment] = useState(
    INITIAL_BUILDER_ENVIRONMENT,
  );

  return (
    <BuilderEnvironmentContext.Provider
      value={{
        environment: currentEnvironment,
        setWebsite: (website) =>
          setEnvironment(switchDevelopmentWebsite(website)),
      }}
    >
      {children}
    </BuilderEnvironmentContext.Provider>
  );
}

function useBuilderEnvironmentContext(): BuilderEnvironmentContextValue {
  const value = useContext(BuilderEnvironmentContext);
  if (!value) {
    throw new Error(
      "Builder environment hooks must be used inside BuilderEnvironmentProvider.",
    );
  }
  return value;
}

export function useBuilderEnvironment(): BuilderEnvironment {
  return useBuilderEnvironmentContext().environment;
}

export function useBuilderEnvironmentEditor(): BuilderEnvironmentContextValue {
  return useBuilderEnvironmentContext();
}
