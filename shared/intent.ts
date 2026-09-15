import type { Brief } from "./model";
/** Ground explicit numeric requests independently of a model's prose. */
export function explicitConstraints(
  text: string,
  current: Brief,
): Partial<Brief> {
  const numberWords: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };
  const normalized = text
    .toLowerCase()
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight)\b/g, (w) =>
      String(numberWords[w]),
    );
  const out: Partial<Brief> = {};
  const floorSpecific =
    /\b(?:ground|first|second|third|upper|lower)\s+floor\b|\b(?:upstairs|downstairs)\b|\bfloor\s*[1-4]\b/.test(
      normalized,
    );
  for (const [field, pattern] of [
    ["bedrooms", /(\d+)\s*[- ]?bed(?:room)?s?\b/],
    ["bathrooms", /(\d+)\s*[- ]?bath(?:room)?s?\b/],
  ] as const) {
    const found = normalized.match(pattern);
    if (
      found &&
      !floorSpecific &&
      !/\b(?:not|no|avoid)\s*$/.test(
        normalized.slice(Math.max(0, found.index! - 10), found.index),
      )
    )
      out[field] = +found[1];
  }
  const dims = [
    ...normalized.matchAll(
      /(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet)?\s*(?:[x×]|by)\s*(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet)\b/g,
    ),
  ].find((match) => {
    const before = normalized.slice(0, match.index).trim();
    const after = normalized.slice(match.index! + match[0].length).trim();
    return (
      /\b(?:plot|site|land|footprint)\s*(?:(?:is|of|measures)\s*|:\s*)?$/.test(
        before,
      ) ||
      /^(?:plot|site|land|footprint)\b/.test(after) ||
      (!before && /^[.!]?$/.test(after))
    );
  });
  if (dims) {
    const factor = (s: string | undefined) =>
      /ft|feet/.test(s || "") ? 0.3048 : 1;
    out.width = +(+dims[1] * factor(dims[2] || dims[4])).toFixed(3);
    out.depth = +(+dims[3] * factor(dims[4])).toFixed(3);
  }
  if (
    !floorSpecific &&
    /\b(?:add|need|want|with|include)\b[^.!?]{0,45}\b(?:an?\s+)?(?:home |quiet )?office\b|\bwork from home\b/.test(
      normalized,
    )
  )
    out.extras = [...new Set([...current.extras, "Office"])];
  if (
    /\bwheelchair|\baccessible|\bmobility/.test(normalized) &&
    !/\b(?:not|no)\b.{0,15}\b(?:wheelchair|accessible|mobility)/.test(
      normalized,
    )
  )
    out.accessibility = true;
  return out;
}
