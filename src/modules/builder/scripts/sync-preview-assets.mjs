import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../..");
const PROFILE = "rbccm";
const SOURCE_URL =
  "https://www.rbccm.com/en/insights/2026/07/data-centers-become-the-new-battleground-in-iran-war";
const SOURCE_ORIGIN = new URL(SOURCE_URL).origin;
const PUBLIC_ROOT = join(ROOT, "public", "preview-sites", PROFILE);
const PUBLIC_URL_ROOT = `/preview-sites/${PROFILE}`;
const MANIFEST_PATH = join(
  ROOT,
  "src",
  "modules",
  "builder",
  "preview",
  "generated",
  `${PROFILE}-asset-manifest.json`,
);
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const FONT_EXTENSIONS = new Set([".eot", ".otf", ".ttf", ".woff", ".woff2"]);

function attribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function hasAttribute(tag, name) {
  return new RegExp(`\\s${name}(?:\\s|=|>|$)`, "i").test(tag);
}

function safeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function storagePath(url) {
  const parsed = new URL(url);
  const prefix = parsed.origin === SOURCE_ORIGIN ? "origin" : join("external", safeSegment(parsed.host));
  const pathname = decodeURIComponent(parsed.pathname);
  const segments = pathname.split("/").filter(Boolean).map(safeSegment);
  if (segments.length === 0 || pathname.endsWith("/")) segments.push("index");
  if (!extname(segments.at(-1))) segments[segments.length - 1] += ".js";
  return join(prefix, ...segments);
}

function publicUrl(filePath) {
  const suffix = relative(PUBLIC_ROOT, filePath).split(sep).join("/");
  return `${PUBLIC_URL_ROOT}/${suffix}`;
}

async function fetchAsset(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "*/*" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), finalUrl: response.url };
}

async function saveBytes(filePath, bytes) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

async function main() {
  await rm(PUBLIC_ROOT, { recursive: true, force: true });
  const page = await fetchAsset(SOURCE_URL);
  const html = new TextDecoder().decode(page.bytes);
  const headEnd = html.search(/<\/head\s*>/i);
  const downloaded = [];
  const unavailable = [];

  const stylesheets = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    const href = attribute(tag, "href");
    if (!href || !rel.includes("stylesheet")) continue;
    const sourceUrl = new URL(href, SOURCE_URL).toString();
    const filePath = join(PUBLIC_ROOT, storagePath(sourceUrl));
    const fetched = await fetchAsset(sourceUrl);
    let css = new TextDecoder().decode(fetched.bytes);
    const fontDownloads = [];

    css = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (full, _quote, value) => {
      const trimmed = value.trim();
      if (!trimmed || /^(?:data:|#)/i.test(trimmed)) return full;
      let resolved;
      try {
        resolved = new URL(trimmed, fetched.finalUrl);
      } catch {
        return full;
      }
      const extension = extname(resolved.pathname).toLowerCase();
      if (IMAGE_EXTENSIONS.has(extension)) {
        return `url("${resolved.toString()}")`;
      }
      if (!FONT_EXTENSIONS.has(extension)) return full;

      const dependencyPath = join(PUBLIC_ROOT, storagePath(resolved.toString()));
      fontDownloads.push(
        fetchAsset(resolved.toString())
          .then((asset) => saveBytes(dependencyPath, asset.bytes))
          .then(() => downloaded.push(publicUrl(dependencyPath)))
          .catch((error) =>
            unavailable.push({ sourceUrl: resolved.toString(), reason: error.message }),
          ),
      );
      return `url("${publicUrl(dependencyPath)}${resolved.search}${resolved.hash}")`;
    });

    await Promise.all(fontDownloads);
    await saveBytes(filePath, new TextEncoder().encode(css));
    downloaded.push(publicUrl(filePath));
    stylesheets.push({
      href: publicUrl(filePath),
      media: attribute(tag, "media"),
    });
  }

  const headScripts = [];
  const bodyScripts = [];
  let inlineIndex = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const tag = match[0].slice(0, match[0].indexOf(">") + 1);
    const type = attribute(tag, "type")?.toLowerCase() ?? "text/javascript";
    const destination = match.index < headEnd ? headScripts : bodyScripts;
    const src = attribute(tag, "src");
    let sourceUrl;
    let filePath;

    if (src) {
      sourceUrl = new URL(src, SOURCE_URL).toString();
      filePath = join(PUBLIC_ROOT, storagePath(sourceUrl));
      try {
        const fetched = await fetchAsset(sourceUrl);
        await saveBytes(filePath, fetched.bytes);
        downloaded.push(publicUrl(filePath));
      } catch (error) {
        unavailable.push({ sourceUrl, reason: error.message });
        continue;
      }
    } else {
      const code = match[2].trim();
      if (!code || !/^(?:application|text)\/(?:java|ecma)script$/.test(type)) continue;
      inlineIndex += 1;
      filePath = join(PUBLIC_ROOT, "inline", `script-${String(inlineIndex).padStart(2, "0")}.js`);
      await saveBytes(filePath, new TextEncoder().encode(`${code}\n`));
      downloaded.push(publicUrl(filePath));
      sourceUrl = `${SOURCE_URL}#inline-script-${inlineIndex}`;
    }

    destination.push({
      src: publicUrl(filePath),
      sourceUrl,
      async: hasAttribute(tag, "async"),
      defer: hasAttribute(tag, "defer"),
      type: type === "text/javascript" ? null : type,
    });
  }

  const manifest = {
    profile: PROFILE,
    sourceUrl: SOURCE_URL,
    generatedAt: new Date().toISOString(),
    stylesheets,
    headScripts,
    bodyScripts,
    downloaded: [...new Set(downloaded)].sort(),
    unavailable,
  };
  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const imageDownloads = manifest.downloaded.filter((path) =>
    IMAGE_EXTENSIONS.has(extname(new URL(path, "https://preview.invalid").pathname).toLowerCase()),
  );
  if (imageDownloads.length) {
    throw new Error(`Image assets were downloaded unexpectedly: ${imageDownloads.join(", ")}`);
  }

  console.log(
    `Mirrored ${stylesheets.length} stylesheets, ${headScripts.length + bodyScripts.length} scripts, ` +
      `${manifest.downloaded.length} total non-image assets.`,
  );
  for (const item of unavailable) console.warn(`Unavailable: ${item.sourceUrl} (${item.reason})`);
}

await main();
