import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_PAGES = 6;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

/**
 * Best-effort visual companion to Mammoth's structural DOCX extraction.
 * Production images are deliberately bounded because they become model input.
 */
export async function renderDocxPagesForModel(
  bytes: Uint8Array,
  fileName: string,
): Promise<readonly string[]> {
  const directory = await mkdtemp(join(tmpdir(), "builder-docx-"));
  try {
    const safeName = `${basename(fileName, ".docx").replace(/[^a-z0-9_-]+/gi, "-") || "document"}.docx`;
    const inputPath = join(directory, safeName);
    await writeFile(inputPath, bytes);
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      directory,
      inputPath,
    ], { timeout: 20_000, maxBuffer: 1024 * 1024 });

    const pdfName = (await readdir(directory)).find((name) =>
      name.toLowerCase().endsWith(".pdf"),
    );
    if (!pdfName) return [];
    const pagePrefix = join(directory, "page");
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      "110",
      "-f",
      "1",
      "-l",
      String(MAX_PAGES),
      join(directory, pdfName),
      pagePrefix,
    ], { timeout: 20_000, maxBuffer: 1024 * 1024 });

    const pageNames = (await readdir(directory))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((left, right) => pageNumber(left) - pageNumber(right));
    const urls: string[] = [];
    let totalBytes = 0;
    for (const name of pageNames) {
      const page = await readFile(join(directory, name));
      if (totalBytes + page.byteLength > MAX_TOTAL_BYTES) break;
      totalBytes += page.byteLength;
      urls.push(`data:image/png;base64,${page.toString("base64")}`);
    }
    return urls;
  } catch {
    // Structural extraction remains usable when office/PDF tools are absent.
    return [];
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function pageNumber(name: string): number {
  return Number(name.match(/(\d+)\.png$/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
}
