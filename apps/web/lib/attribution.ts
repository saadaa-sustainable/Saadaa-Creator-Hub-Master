/** Return the first usable stage owner, treating blank strings as missing. */
export function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}
