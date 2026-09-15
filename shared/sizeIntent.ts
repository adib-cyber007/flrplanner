import { roomTypes, type RoomSizeRule } from "./model";

/** Ground explicit numeric English size statements; unsupported prose stays for model/client review. */
export function groundRoomSizes(text: string, proposed: RoomSizeRule[] = []) {
  const found = new Map<string, Partial<RoomSizeRule>>();
  const roomNames = roomTypes.filter((r) => r !== "Hallway");
  for (const sentence of text.toLowerCase().split(/[\n;!?]|\.(?=\s|$)/)) {
    const line = sentence.trim();
    const type = roomNames.find((name) =>
      new RegExp(
        `^(?:(?:every|each|all|the|a|an)\\s+)?${name.toLowerCase()}s?\\b`,
      ).test(line),
    );
    if (
      !type ||
      /\b(?:not|don't|do not|instead|except|if|floor|upstairs|downstairs)\b/.test(
        line,
      ) ||
      roomNames.some(
        (name) =>
          name !== type &&
          new RegExp(`\\b${name.toLowerCase()}s?\\b`).test(line),
      )
    )
      continue;
    const rule = found.get(type) || {};
    const set = (key: keyof Omit<RoomSizeRule, "roomType">, value: number) => {
      if (rule[key] !== undefined && Math.abs(rule[key]! - value) > 1e-7)
        throw Error(
          `Conflicting ${type} ${key} values in the request. Clarify the intended size before building.`,
        );
      rule[key] = value;
    };
    const unit = "(?:meters?|metres?|m|feet|ft)";
    const exactPair = line.match(
      new RegExp(
        `\\bexactly\\s+(\\d+(?:\\.\\d+)?)\\s*(${unit})?\\s*(?:by|x|×)\\s*(\\d+(?:\\.\\d+)?)\\s*(${unit})\\b`,
      ),
    );
    if (exactPair) {
      const factor = (u: string) => (/ft|feet/.test(u) ? 0.3048 : 1);
      const w = +exactPair[1] * factor(exactPair[2] || exactPair[4]),
        d = +exactPair[3] * factor(exactPair[4]);
      set("minWidth", w);
      set("maxWidth", w);
      set("minDepth", d);
      set("maxDepth", d);
    }
    const pattern = new RegExp(
      `\\b(exactly|at least|at most|no larger than|no more than|no less than)\\s+(\\d+(?:\\.\\d+)?)\\s*(square\\s+)?(${unit})(²|2)?(?:\\s+(wide|deep|in width|in depth|in area))?(?=\\s|[,;!?]|$)`,
      "g",
    );
    for (const match of line.matchAll(pattern)) {
      const area = !!match[3] || !!match[5];
      const dimension = area
        ? "Area"
        : /wide|width/.test(match[6] || "")
          ? "Width"
          : /deep|depth/.test(match[6] || "")
            ? "Depth"
            : undefined;
      if (!dimension) continue;
      const factor = /ft|feet/.test(match[4]) ? 0.3048 : 1;
      const value = +match[2] * (area ? factor * factor : factor);
      if (/exactly|at least|no less/.test(match[1]))
        set(`min${dimension}`, value);
      if (/exactly|at most|no larger|no more/.test(match[1]))
        set(`max${dimension}`, value);
    }
    if (Object.keys(rule).length) found.set(type, rule);
  }
  const result = proposed.map((r) => ({ ...r, ...found.get(r.roomType) }));
  for (const [type, limits] of found)
    if (!result.some((r) => r.roomType === type))
      result.push({ roomType: type as RoomSizeRule["roomType"], ...limits });
  return result;
}
