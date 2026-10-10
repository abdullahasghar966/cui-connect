/** Escapes user input for use inside a RegExp (search boxes must never be regex injection). */
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "contains" matcher for a search box value. */
export const containsText = (q: string) => new RegExp(escapeRegex(q), 'i');
