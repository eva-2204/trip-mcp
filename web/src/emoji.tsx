/**
 * A small, self-hosted set of Twemoji SVGs (web/public/emoji/*.svg) so the
 * handful of emoji this app actually uses render identically everywhere,
 * regardless of whether the visitor's OS has a color-emoji font installed
 * (without one, pictograph codepoints like ✈️/🏨 show up as a blank box).
 * Deliberately a tiny curated set, not the full Unicode emoji range.
 */
export const EMOJI_ASSET: Record<string, { file: string; alt: string }> = {
  "✈️": { file: "2708", alt: "самолёт" },
  "✈": { file: "2708", alt: "самолёт" },
  "🏨": { file: "1f3e8", alt: "отель" },
};

/** Swaps allowed emoji characters in LLM-generated markdown for `![alt](/emoji/file.svg)` image syntax. */
export function insertEmojiImages(text: string): string {
  let result = text;
  for (const [char, { file, alt }] of Object.entries(EMOJI_ASSET)) {
    result = result.split(char).join(`![${alt}](/emoji/${file}.svg)`);
  }
  return result;
}

export function EmojiIcon({ file, alt, className }: { file: string; alt: string; className?: string }) {
  return <img src={`/emoji/${file}.svg`} alt={alt} className={`emoji-icon ${className ?? ""}`} draggable={false} />;
}
