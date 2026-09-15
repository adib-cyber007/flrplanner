import {
  openingDimensions,
  DEFAULT_CEILING_HEIGHT,
  type Brief,
  type Floor,
  type Item,
} from "./model";
import { formatLength, type DisplayUnits } from "./units";

export const WALKTHROUGH_CLEAR_HEIGHT = 1.8;
export type VerticalOpening = { bottom: number; top: number; type: string };
/** Subtract the union of openings in one horizontal wall slice, glazing only window-only bands. */
export function openingBands(openings: VerticalOpening[], wallHeight: number) {
  const breaks = [
    ...new Set([
      0,
      wallHeight,
      ...openings
        .flatMap((o) => [o.bottom, o.top])
        .map((y) => Math.max(0, Math.min(wallHeight, y))),
    ]),
  ].sort((a, b) => a - b);
  const bands: { base: number; height: number; kind: "solid" | "glass" }[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const base = breaks[i],
      top = breaks[i + 1],
      mid = (base + top) / 2;
    if (top - base < 1e-6) continue;
    const active = openings.filter((o) => o.bottom < mid && o.top > mid);
    if (active.some((o) => o.type !== "window")) continue;
    const kind = active.length ? "glass" : "solid";
    const previous = bands.at(-1);
    if (
      previous &&
      previous.kind === kind &&
      Math.abs(previous.base + previous.height - base) < 1e-6
    )
      previous.height += top - base;
    else bands.push({ base, height: top - base, kind });
  }
  return bands;
}

export function openingForBrief(item: Item, brief: Brief) {
  const original = openingDimensions(item);
  if (!original) return item;
  const sizes = brief.openingSizes;
  if (!sizes) return item;
  return {
    ...item,
    opening: {
      height:
        (item.type === "door"
          ? sizes.doorHeight
          : item.type === "opening"
            ? sizes.passageHeight
            : sizes.windowHeight) ?? original.height,
      sill: item.type === "window" ? (sizes.windowSill ?? original.sill) : 0,
    },
  };
}
export function openingSizeIssues(brief: Brief, units: DisplayUnits = "m") {
  const s = brief.openingSizes;
  if (!s) return [];
  const top = Math.max(
    s.doorHeight ?? 2.15,
    s.passageHeight ?? 2.15,
    (s.windowSill ?? 0.85) + (s.windowHeight ?? 1.3),
  );
  return Array.from({ length: brief.floors }, (_, index) => {
    const height =
      brief.floorHeights?.find((r) => r.floor === index)?.ceilingHeight ??
      DEFAULT_CEILING_HEIGHT;
    return top > height + 1e-6
      ? `Floor ${index + 1}: required opening dimensions reach ${formatLength(top, units, 3)}, above its ${formatLength(height, units, 3)} ceiling. Review opening sizes or ceiling height.`
      : "";
  }).filter(Boolean);
}
export function openingChecks(
  floor: Floor,
  brief?: Brief,
  units: DisplayUnits = "m",
) {
  const checks: {
    level: "error" | "warning";
    title: string;
    detail: string;
  }[] = [];
  if (brief?.openingSizes) {
    const failed = floor.items.filter((item) => {
      const actual = openingDimensions(item),
        expected = openingDimensions(openingForBrief(item, brief));
      return (
        actual &&
        expected &&
        (Math.abs(actual.height - expected.height) > 1e-6 ||
          Math.abs(actual.sill - expected.sill) > 1e-6)
      );
    });
    if (failed.length)
      checks.push({
        level: "error",
        title: "Required opening dimensions",
        detail: `${failed.map((i) => i.name).join(", ")}: height or sill does not match the project-wide opening requirements. Review individual Opening elevation values or the brief.`,
      });
  }
  const low = floor.items.filter(
    (i) =>
      ["door", "opening"].includes(i.type) &&
      openingDimensions(i)!.height < WALKTHROUGH_CLEAR_HEIGHT,
  );
  if (low.length)
    checks.push({
      level: "warning",
      title: "Opening headroom",
      detail: `${low.map((i) => i.name).join(", ")}: below the walkthrough's ${formatLength(WALKTHROUGH_CLEAR_HEIGHT, units, 2)} standing clearance, so these routes are blocked in walkthrough mode. This is a navigation limit, not a building-code assessment.`,
    });
  return checks;
}
