// SPDX-License-Identifier: MIT
/** Deep-equality check via JSON (lists/scalars, no cycles). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
