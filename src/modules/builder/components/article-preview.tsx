"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createPreviewDocument } from "@/modules/builder/preview/create-preview-document";
import type {
  PreviewSiteProfileId,
  WebsiteAssetPolicy,
} from "@/modules/builder/environment/types";
import { previewProfileHasAssets } from "@/modules/builder/preview/site-profiles";
import { BUILDER_LIMITS } from "@/modules/builder/config/builder";
import type { BuilderArticleImage } from "@/modules/builder/core/contracts";
import { compileBuilderPreview } from "@/modules/builder/core/client";
import { useBuilderEnvironment } from "@/modules/builder/environment/provider";

export function ArticlePreview({
  source,
  assetPolicy,
  siteProfile,
  title,
  images,
  onRuntimeError,
}: {
  source: string;
  assetPolicy: WebsiteAssetPolicy;
  siteProfile: PreviewSiteProfileId;
  title: string;
  images: readonly BuilderArticleImage[];
  onRuntimeError: (error: string) => void;
}) {
  const environment = useBuilderEnvironment();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [compiledResult, setCompiledResult] = useState<{
    source: string;
    html: string;
  } | null>(null);
  const compiledSource = source.includes("<Component")
    ? compiledResult?.source === source
      ? compiledResult.html
      : null
    : source;
  const assetOrigin = useSyncExternalStore(
    subscribeToOrigin,
    readBrowserOrigin,
    readServerOrigin,
  );
  const needsAssetOrigin =
    previewProfileHasAssets(siteProfile) || images.length > 0;

  useEffect(() => {
    let active = true;
    if (!source.includes("<Component")) {
      return () => {
        active = false;
      };
    }
    compileBuilderPreview(environment, source)
      .then((compiled) => {
        if (active) setCompiledResult({ source, html: compiled });
      })
      .catch((error: unknown) => {
        if (!active) return;
        onRuntimeError(
          error instanceof Error ? error.message : "Preview compilation failed.",
        );
      });
    return () => {
      active = false;
    };
  }, [environment, onRuntimeError, source]);

  const srcDoc = useMemo(
    () =>
      compiledSource !== null && (!needsAssetOrigin || assetOrigin)
        ? createPreviewDocument(compiledSource, assetPolicy, {
            siteProfile,
            assetOrigin: assetOrigin ?? undefined,
            imageFallbacks: images.map((image) => ({
              productionPath: image.productionPath,
              databaseUrl: new URL(
                image.databasePreviewUrl,
                assetOrigin ?? "http://localhost",
              ).toString(),
            })),
          })
        : null,
    [
      compiledSource,
      assetPolicy,
      siteProfile,
      assetOrigin,
      needsAssetOrigin,
      images,
    ],
  );

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.source === frameRef.current?.contentWindow &&
        event.data?.source === "article-builder-preview" &&
        event.data?.kind === "runtime-error" &&
        typeof event.data.value === "string"
      ) {
        onRuntimeError(event.data.value);
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onRuntimeError]);

  return srcDoc === null ? (
    <div
      className="h-full w-full bg-white"
      aria-label="Loading preview assets"
    />
  ) : (
    <iframe
      ref={frameRef}
      title={`${title} preview`}
      srcDoc={srcDoc}
      sandbox={BUILDER_LIMITS.preview.sandboxTokens.join(" ")}
      referrerPolicy={BUILDER_LIMITS.preview.referrerPolicy}
      className="h-full w-full bg-background"
    />
  );
}

function subscribeToOrigin() {
  return () => undefined;
}

function readBrowserOrigin() {
  return window.location.origin;
}

function readServerOrigin() {
  return null;
}
