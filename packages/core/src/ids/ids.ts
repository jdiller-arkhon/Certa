import { v7 } from 'uuid';

/** UUIDv7: time-ordered and safe to generate offline on any device. */
export function newId(): string {
  return v7();
}
