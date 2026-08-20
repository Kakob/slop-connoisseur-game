/** Word-count rules shared by UI, engine, and scoring. */

/** Derives the word count: whitespace-separated tokens of a trimmed text. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Derives the text capped to the first `maxWords` words. */
export function capWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "";
  return trimmed.split(/\s+/).slice(0, maxWords).join(" ");
}
