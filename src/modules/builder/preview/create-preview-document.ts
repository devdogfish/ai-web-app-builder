import type {
  PreviewSiteProfileId,
  WebsiteAssetPolicy,
} from "@/modules/builder/environment/types";
import {
  getPreviewAssetManifest,
  previewProfileHasAssets,
  type PreviewScriptAsset,
} from "./site-profiles";

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

export interface PreviewDocumentOptions {
  siteProfile?: PreviewSiteProfileId;
  assetOrigin?: string;
  imageFallbacks?: readonly PreviewImageFallback[];
}

export interface PreviewImageFallback {
  productionPath: string;
  databaseUrl: string;
}

function assetOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Preview asset origin must use HTTP or HTTPS.");
  }
  return url.origin;
}

function localAssetUrl(path: string, origin: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Preview manifest assets must use root-relative paths.");
  }
  return new URL(path, `${origin}/`).toString();
}

function scriptTag(asset: PreviewScriptAsset, origin: string): string {
  const attributes = [
    `src="${escapeAttribute(localAssetUrl(asset.src, origin))}"`,
    asset.async ? "async" : "",
    asset.defer ? "defer" : "",
    asset.type ? `type="${escapeAttribute(asset.type)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<script ${attributes}></script>`;
}

function previewParts(
  profile: PreviewSiteProfileId,
  origin: string | null,
): { head: string; body: string } {
  const manifest = getPreviewAssetManifest(profile);
  if (!origin) return { head: "", body: "" };

  const stylesheets = manifest.stylesheets
    .map((asset) => {
      const media = asset.media
        ? ` media="${escapeAttribute(asset.media)}"`
        : "";
      return `<link rel="stylesheet" href="${escapeAttribute(localAssetUrl(asset.href, origin))}"${media}>`;
    })
    .join("");
  return {
    head:
      stylesheets +
      (profile === "rbccm" ? "<style>img{max-width:100%}</style>" : "") +
      manifest.headScripts.map((asset) => scriptTag(asset, origin)).join(""),
    body: manifest.bodyScripts
      .map((asset) => scriptTag(asset, origin))
      .join(""),
  };
}

function previewHead(
  policy: WebsiteAssetPolicy,
  localOrigin: string | null,
  siteAssets: string,
  imageFallbacks: readonly PreviewImageFallback[],
  allowLocalSiteScripts: boolean,
): string {
  const baseHref = `${policy.cmsOrigin}/`;
  const allowedOrigins = [
    ...policy.allowedPreviewOrigins,
    ...(localOrigin ? [localOrigin] : []),
  ].join(" ");
  const previewCsp = [
    "default-src 'none'",
    `img-src ${allowedOrigins} data: blob:`,
    `style-src 'unsafe-inline' ${allowedOrigins}`,
    `font-src ${allowedOrigins} data:`,
    `script-src 'unsafe-inline'${allowLocalSiteScripts && localOrigin ? ` ${localOrigin} 'unsafe-eval'` : ""}`,
    "connect-src 'none'",
    `media-src ${allowedOrigins} data: blob:`,
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "navigate-to 'none'",
    "worker-src 'none'",
  ].join("; ");
  return [
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(previewCsp)}">`,
    '<meta name="referrer" content="no-referrer">',
    `<base href="${escapeAttribute(baseHref)}">`,
    imageFallbackScript(imageFallbacks),
    `<script>(function(){const send=(kind,value)=>parent.postMessage({source:"article-builder-preview",kind,value},"*");window.addEventListener("error",e=>{const siteAssetError=e.message==="Script error."||String(e.filename||"").includes("/preview-sites/");if(!siteAssetError)send("runtime-error",e.message||"Unknown runtime error")});window.addEventListener("unhandledrejection",e=>send("runtime-error",String(e.reason||"Unhandled promise rejection")));document.addEventListener("submit",e=>{e.preventDefault();send("runtime-error","Form submission is blocked in Preview.")},true);})();</script>`,
    siteAssets,
  ].join("");
}

function imageFallbackScript(
  imageFallbacks: readonly PreviewImageFallback[],
): string {
  if (imageFallbacks.length === 0) return "";
  const fallbackMap = Object.fromEntries(
    imageFallbacks.map((fallback) => [
      fallback.productionPath,
      fallback.databaseUrl,
    ]),
  );
  const serialized = JSON.stringify(fallbackMap).replaceAll("<", "\\u003c");
  return `<script>(function(){const fallbacks=${serialized};document.addEventListener("error",function(event){const image=event.target;if(!(image instanceof HTMLImageElement)||image.dataset.databaseFallbackAttempted)return;let path;try{path=new URL(image.currentSrc||image.src,document.baseURI).pathname}catch{return}const fallback=fallbacks[path];if(!fallback)return;image.dataset.databaseFallbackAttempted="true";image.src=fallback},true)})();</script>`;
}

export function createPreviewDocument(
  source: string,
  policy: WebsiteAssetPolicy,
  options: PreviewDocumentOptions = {},
): string {
  const profile = options.siteProfile ?? "unstyled";
  const localOrigin = assetOrigin(options.assetOrigin);
  const hasSiteAssets = previewProfileHasAssets(profile);
  const siteAssets = previewParts(profile, hasSiteAssets ? localOrigin : null);
  const injectedHead = previewHead(
    policy,
    localOrigin,
    siteAssets.head,
    options.imageFallbacks ?? [],
    hasSiteAssets,
  );
  // A fixed outer envelope makes the CSP the first parsed policy even when
  // Source contains misleading comments, malformed head tags, or a full doc.
  return `<!doctype html><html><head>${injectedHead}</head><body>${source}${siteAssets.body}</body></html>`;
}
