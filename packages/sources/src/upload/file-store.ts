import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

/** Where uploaded files live. Disk today; object storage later, behind the same interface. */
export interface FileStore {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  size(key: string): Promise<number | null>;
  /** Byte range is inclusive on both ends (HTTP Range semantics). */
  stream(key: string, range?: { start: number; end: number }): Readable;
}

export class DiskFileStore implements FileStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    const full = resolve(join(this.root, key));
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error("invalid file key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  read(key: string) {
    return readFile(this.path(key));
  }
  async size(key: string) {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }
  stream(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.path(key), range);
  }
}

export class MemoryFileStore implements FileStore {
  private files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(key, Buffer.from(data));
  }
  async read(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error(`file ${key} not found`);
    return Buffer.from(f);
  }
  async size(key: string) {
    return this.files.get(key)?.length ?? null;
  }
  stream(key: string, range?: { start: number; end: number }) {
    const f = this.files.get(key);
    if (!f) throw new Error(`file ${key} not found`);
    return Readable.from(range ? f.subarray(range.start, range.end + 1) : f);
  }
}
