import type { Brief } from "./model";
import { formatLength, type DisplayUnits } from "./units";

export function siteEnvelope(brief: Brief) {
  const setbacks = brief.sideSetbacks || {
    north: brief.setback,
    east: brief.setback,
    south: brief.setback,
    west: brief.setback,
  };
  return {
    width: brief.width - setbacks.west - setbacks.east,
    depth: brief.depth - setbacks.north - setbacks.south,
    x: setbacks.west,
    y: setbacks.north,
    setbacks,
  };
}
export function setbackDescription(brief: Brief, units: DisplayUnits = "m") {
  const { setbacks: s } = siteEnvelope(brief);
  return `North ${formatLength(s.north, units, 3)} · East ${formatLength(s.east, units, 3)} · South ${formatLength(s.south, units, 3)} · West ${formatLength(s.west, units, 3)}`;
}
