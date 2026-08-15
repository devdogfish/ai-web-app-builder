import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export interface StoredUpload {
  key: string;
  bytes: Uint8Array;
}

export interface UploadStore {
  put(file: { name: string; bytes: Uint8Array }): Promise<string>;
  get(key: string): Promise<StoredUpload>;
  remove(key: string): Promise<void>;
}

export class LocalUploadStore implements UploadStore {
  constructor(private readonly directory = process.env.BUILDER_UPLOAD_DIRECTORY ?? ".data/uploads") {}

  async put(file: { name: string; bytes: Uint8Array }): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const safeName = basename(file.name).replaceAll(/[^a-zA-Z0-9._-]/g, "-");
    const key = `${randomUUID()}-${safeName}`;
    await writeFile(join(this.directory, key), file.bytes);
    return key;
  }

  async get(key: string): Promise<StoredUpload> {
    const safeKey = basename(key);
    return { key: safeKey, bytes: await readFile(join(this.directory, safeKey)) };
  }

  async remove(key: string): Promise<void> {
    await unlink(join(this.directory, basename(key))).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

const uploadStoreGlobal = globalThis as typeof globalThis & { articleUploadStore?: UploadStore };

export function getUploadStore(): UploadStore {
  uploadStoreGlobal.articleUploadStore ??= new LocalUploadStore();
  return uploadStoreGlobal.articleUploadStore;
}
