export type DisplayUnits = "m" | "ft";

export const METERS_PER_FOOT = 0.3048;

export function lengthFactor(units: DisplayUnits) {
  return units === "ft" ? 1 / METERS_PER_FOOT : 1;
}

export function displayLength(meters: number, units: DisplayUnits, digits = 2) {
  return Number((meters * lengthFactor(units)).toFixed(digits));
}

export function displayArea(
  squareMeters: number,
  units: DisplayUnits,
  digits = 1,
) {
  const factor = lengthFactor(units);
  return Number((squareMeters * factor * factor).toFixed(digits));
}

export function formatLength(meters: number, units: DisplayUnits, digits = 2) {
  return `${displayLength(meters, units, digits)} ${units}`;
}

export function formatArea(
  squareMeters: number,
  units: DisplayUnits,
  digits = 1,
) {
  return `${displayArea(squareMeters, units, digits)} ${units}²`;
}
