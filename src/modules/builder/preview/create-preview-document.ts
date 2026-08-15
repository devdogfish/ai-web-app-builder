import type {
  PreviewSiteProfileId,
  WebsiteAssetPolicy,
} from "@/modules/builder/environment/types";
import {
  getPreviewAssetManifest,
  getPreviewContentContainer,
  previewProfileHasAssets,
  type PreviewScriptAsset,
} from "./site-profiles";

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

export interface PreviewDocumentOptions {
  siteProfile?: PreviewSiteProfileId;
  assetOrigin?: string;
  imageProxies?: readonly PreviewImageProxy[];
}

export interface PreviewImageProxy {
  productionPath: string;
  previewUrl: string;
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
    `<script>(function(){const send=(kind,value)=>parent.postMessage({source:"article-builder-preview",kind,value},"*");window.addEventListener("error",e=>{const siteAssetError=e.message==="Script error."||String(e.filename||"").includes("/preview-sites/");if(!siteAssetError)send("runtime-error",e.message||"Unknown runtime error")});window.addEventListener("unhandledrejection",e=>send("runtime-error",String(e.reason||"Unhandled promise rejection")));document.addEventListener("submit",e=>{e.preventDefault();send("runtime-error","Form submission is blocked in Preview.")},true);})();</script>`,
    siteAssets,
  ].join("");
}

function imageProxyScript(
  imageProxies: readonly PreviewImageProxy[],
): string {
  if (imageProxies.length === 0) return "";
  const proxyMap = Object.fromEntries(
    imageProxies.map((proxy) => [
      proxy.productionPath,
      proxy.previewUrl,
    ]),
  );
  const serialized = JSON.stringify(proxyMap).replaceAll("<", "\\u003c");
  return `<script>(function(){const proxies=${serialized};const apply=image=>{if(!(image instanceof HTMLImageElement)||image.dataset.previewProxyApplied)return;let path;try{path=new URL(image.getAttribute("src")||"",document.baseURI).pathname}catch{return}const proxy=proxies[path];if(!proxy)return;image.dataset.previewProxyApplied="true";image.removeAttribute("srcset");image.closest("picture")?.querySelectorAll("source").forEach(source=>source.removeAttribute("srcset"));image.addEventListener("error",()=>parent.postMessage({source:"article-builder-preview",kind:"runtime-error",value:"Preview could not load "+path+" from CMS or database."},"*"),{once:true});image.src=proxy};document.querySelectorAll("img").forEach(apply);new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node instanceof HTMLImageElement)apply(node);else if(node instanceof Element)node.querySelectorAll("img").forEach(apply)}))).observe(document.body,{childList:true,subtree:true})})();</script>`;
}

function previewContent(
  source: string,
  profile: PreviewSiteProfileId,
): string {
  const container = getPreviewContentContainer(profile);
  if (!container) return source;
  return `<div style="${escapeAttribute(container.style)}">${source}</div>`;
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
    hasSiteAssets,
  );
  // A fixed outer envelope makes the CSP the first parsed policy even when
  // Source contains misleading comments, malformed head tags, or a full doc.
  return `<!doctype html><html><head>${injectedHead}</head><body>${previewContent(source, profile)}${imageProxyScript(options.imageProxies ?? [])}${siteAssets.body}</body></html>`;
}
