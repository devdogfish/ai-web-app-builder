import { createElement, type ReactNode } from "react";
import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { ArticleBuilderPage } from "./components/article-builder-page";
import { BuilderEnvironmentProvider } from "./environment/provider";
import { Toaster } from "./ui/sonner";
import { TooltipProvider } from "./ui/tooltip";

export type BuilderRootLayoutProps = Readonly<{
  children: ReactNode;
}>;

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const builderMetadata: Metadata = {
  title: "News Article Content Builder",
  description: "Conversational Article HTML workbench",
};

export function BuilderPage() {
  return createElement(
    BuilderEnvironmentProvider,
    null,
    createElement(ArticleBuilderPage),
  );
}

export function BuilderRootLayout({ children }: BuilderRootLayoutProps) {
  return createElement(
    "html",
    { lang: "en", className: `font-sans ${geist.variable}` },
    createElement(
      "body",
      null,
      createElement(TooltipProvider, null, children),
      createElement(Toaster),
    ),
  );
}
