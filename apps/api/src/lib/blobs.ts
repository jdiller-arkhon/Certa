/**
 * Object storage for uploaded files. S3-compatible in production (SeaweedFS in Docker Compose,
 * or AWS S3); a local directory in development; memory in tests. Keys are opaque and
 * org-prefixed; files are only ever served through authorized API routes, never directly.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { AwsClient } from 'aws4fetch';
import type { Config } from '../config.js';

export interface BlobStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]{0,300}$/;
const check = (key: string) => {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error(`Unsafe storage key: ${key}`);
  return key;
};

export class MemoryBlobStore implements BlobStore {
  files = new Map<string, Uint8Array>();
  async put(key: string, body: Uint8Array) {
    this.files.set(check(key), body);
  }
  async get(key: string) {
    return this.files.get(check(key)) ?? null;
  }
  async delete(key: string) {
    this.files.delete(check(key));
  }
}

export class DirBlobStore implements BlobStore {
  private root: string;
  constructor(dir: string) {
    this.root = resolve(dir);
  }
  private path(key: string) {
    return join(this.root, check(key));
  }
  async put(key: string, body: Uint8Array) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

export class S3BlobStore implements BlobStore {
  private client: AwsClient;
  constructor(
    private endpoint: string,
    private bucket: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region, service: 's3' });
  }
  private url(key: string) {
    return `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${check(key)}`;
  }
  async put(key: string, body: Uint8Array, contentType: string) {
    const send = () => this.client.fetch(this.url(key), { method: 'PUT', body, headers: { 'content-type': contentType } });
    let res = await send();
    if (res.status === 404 && (await res.text()).includes('NoSuchBucket')) {
      // First upload on a fresh store: create the bucket, then retry once.
      const made = await this.client.fetch(`${this.endpoint.replace(/\/+$/, '')}/${this.bucket}`, { method: 'PUT' });
      if (!made.ok && made.status !== 409) throw new Error(`Object store bucket create failed: ${made.status}`);
      res = await send();
    }
    if (!res.ok) throw new Error(`Object store PUT failed: ${res.status}`);
  }
  async get(key: string) {
    const res = await this.client.fetch(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Object store GET failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  async delete(key: string) {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`Object store DELETE failed: ${res.status}`);
  }
}

export function createBlobStore(config: Config): BlobStore {
  if (config.S3_ENDPOINT && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY)
    return new S3BlobStore(config.S3_ENDPOINT, config.S3_BUCKET, config.S3_REGION, config.S3_ACCESS_KEY_ID, config.S3_SECRET_ACCESS_KEY);
  if (config.NODE_ENV === 'production') throw new Error('S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required in production');
  return new DirBlobStore(config.BLOB_DIR);
}
