/**
 * Canonical hashing for tamper evidence. Records are serialized with RFC 8785 (JSON
 * Canonicalization Scheme) and hashed with SHA-256. Isomorphic: runs in Node, browsers, and RN.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import canonicalize from 'canonicalize';

export function canonicalJson(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error('Value cannot be canonicalized');
  return out;
}

export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(sha256(typeof input === 'string' ? utf8ToBytes(input) : input));
}

export function contentHash(record: unknown): string {
  return sha256Hex(canonicalJson(record));
}

export const GENESIS_HASH = '0'.repeat(64);

export interface LedgerLink {
  orgId: string;
  seq: number;
  entityType: string;
  entityId: string;
  entityVersion: number;
  contentHash: string;
  prevHash: string;
  at: string;
}

/** entry_hash = SHA-256 over the canonical form of every link field. */
export function ledgerEntryHash(link: LedgerLink): string {
  return contentHash({
    orgId: link.orgId,
    seq: link.seq,
    entityType: link.entityType,
    entityId: link.entityId,
    entityVersion: link.entityVersion,
    contentHash: link.contentHash,
    prevHash: link.prevHash,
    at: link.at,
  });
}
