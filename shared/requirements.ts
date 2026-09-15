import { BriefSchema, type Brief, type Requirements } from "./model";
import { siteEnvelope } from "./site";
import { floorProgram, programIssues } from "./program";
import { relationshipIssues } from "./relationships";
import { unresolvedWrittenRequirements } from "./requirementLinks";
import { heightIssues } from "./heights";
import { openingSizeIssues } from "./openings";
import type { DisplayUnits } from "./units";
export const requirementTopics = [
  {
    key: "project",
    title: "Project & use",
    question: "What are we designing?",
    help: "New home, renovation, apartment, mixed use? Who approves the design? Which parts of the existing plan must stay? Include the address or project reference if useful.",
  },
  {
    key: "site",
    title: "Site & boundaries",
    question: "What do you know about the plot?",
    help: "Measured dimensions and source, rectangular or irregular boundary, north direction, road/access sides and width, frontage, slope, trees, easements, neighboring buildings and different setbacks on each side. Do not assume an entrance direction is the same as site orientation.",
  },
  {
    key: "household",
    title: "People & daily life",
    question: "Who will use these spaces?",
    help: "Adults, children, older family members, guests, pets, work routines, cooking habits, entertaining, privacy and future family changes. Describe functional needs; names are not required.",
  },
  {
    key: "rooms",
    title: "Room program",
    question: "What must each floor contain?",
    help: "Room names and quantities on each floor; preferred/minimum width, depth or area; attached bathrooms, storage, wardrobes, utility, study, prayer, guest and staff spaces. List furniture you already own with its dimensions. Use Your rooms to set different room lists per floor. Stairs and vertical circulation still require coordination.",
  },
  {
    key: "relationships",
    title: "Adjacency & privacy",
    question: "Which spaces should connect or stay apart?",
    help: "Kitchen beside dining, parents' room near a bathroom, study away from noise, private bedrooms, guest access, views from the entrance, separate service access and open versus closed kitchens. Rank the relationships that matter.",
  },
  {
    key: "access",
    title: "Access & circulation",
    question: "What access needs should the design support?",
    help: "Step-free access, wheelchair turning, door and corridor widths, stairs, lift, ceiling heights, floor-to-floor levels, stroller access, bathroom assistance and emergency routes. Give dimensions or describe needs in your own words. The details collects ceiling heights per floor; these are separate from slab thickness and floor-to-floor levels.",
  },
  {
    key: "structure",
    title: "Existing & fixed elements",
    question: "What cannot be moved or demolished?",
    help: "Load-bearing walls, columns, beams, shafts, stairs, openings, structural grid and protected areas. Give measured locations if known. For renovations, identify survey/drawing references and anything awaiting verification.",
  },
  {
    key: "services",
    title: "Water, power & services",
    question: "Which services constrain the plan?",
    help: "Plumbing and drainage positions, wet-area stacking, water/septic tanks, electrical panels/outlets, HVAC, ventilation ducts, solar equipment, cooking fuel, laundry and maintenance access.",
  },
  {
    key: "environment",
    title: "Light, climate & comfort",
    question: "What conditions should the design respond to?",
    help: "Sun/shade preferences, windows and views, prevailing winds, cross ventilation, heat/rain, noise sources, neighboring privacy, insulation, sustainability and preferred materials.",
  },
  {
    key: "outdoors",
    title: "Parking & outdoor spaces",
    question: "What belongs outside?",
    help: "Number/type of vehicles, driveway and turning space, EV charging, garden, terrace, balconies, courtyard, play areas, outdoor utility, boundary walls and gates.",
  },
  {
    key: "budget",
    title: "Budget & delivery",
    question: "What are the financial and timing limits?",
    help: "Currency, total budget, construction versus interiors, contingency, finish level, local unit rates if available, deadlines, phased construction and what can be deferred. Cost estimation is not yet automatic.",
  },
  {
    key: "rules",
    title: "Rules & special requirements",
    question: "Which external rules or personal requirements apply?",
    help: "Local authority/jurisdiction, zoning, coverage/FAR, height/floor limits, fire/accessibility requirements, society restrictions, heritage conditions, Vastu/Feng Shui or other cultural preferences, and any professional advice already received. Identify rules that still need verification.",
  },
] as const;
export const emptyRequirements = (): Requirements => ({
  responses: [],
  custom: [],
  coreConfirmed: false,
  assumptionsAccepted: false,
});
export function intakeIssues(brief: Brief, units: DisplayUnits = "m") {
  const r = brief.requirements || emptyRequirements(),
    issues: string[] = [];
  const unresolved = new Set(
    unresolvedWrittenRequirements(brief).map((r) => r.source),
  );
  for (const topic of requirementTopics) {
    const answer = r.responses.find((a) => a.key === topic.key);
    if (!answer)
      issues.push(
        `${topic.title}: answer this section or explicitly mark it unknown / not applicable.`,
      );
    else if (answer.status === "provided" && !answer.details.trim())
      issues.push(
        `${topic.title}: add the details you want the planner to use.`,
      );
    if (unresolved.has(`topic:${topic.key}`))
      issues.push(
        `${topic.title}: a non-negotiable constraint is unresolved. Link its full meaning to supported rules in Constraints, or use manual design for unsupported needs.`,
      );
  }
  for (const custom of r.custom)
    if (unresolved.has(`custom:${custom.id}`))
      issues.push(
        `Non-negotiable: ${custom.text}. Link its full meaning to supported rules in Constraints, or use manual design for unsupported needs.`,
      );
  if (!r.coreConfirmed)
    issues.push(
      "Confirm the plot dimensions, setbacks on each side, per-floor counts, ceiling heights and entrance direction.",
    );
  issues.push(...programIssues(brief));
  issues.push(...heightIssues(brief));
  issues.push(...openingSizeIssues(brief, units));
  issues.push(...relationshipIssues(brief));
  const requestedTypes = new Set(
    Array.from({ length: brief.floors }, (_, i) =>
      floorProgram(brief, i).rooms.map((r) => r.type),
    ).flat(),
  );
  for (const rule of brief.roomSizeRules || [])
    if (!requestedTypes.has(rule.roomType))
      issues.push(
        `${rule.roomType}: a size requirement exists, but this room type is not in your program. Add the room or clear its size minimums in Your rooms.`,
      );
  if (!r.assumptionsAccepted)
    issues.push(
      "Review and accept the listed unknowns and manual checks for a concept design.",
    );
  const envelope = siteEnvelope(brief);
  if (envelope.width <= 0 || envelope.depth <= 0)
    issues.push("The setbacks leave no buildable area.");
  return issues;
}
/** Content fingerprint invalidates a review whenever constraints change; not a security token. */
export function requirementReviewKey(brief: Brief) {
  const parsed = BriefSchema.parse(brief);
  const r = parsed.requirements || emptyRequirements();
  const text = JSON.stringify({
    ...parsed,
    requirements: { ...r, reviewedAt: undefined, reviewKey: undefined },
  });
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return (a >>> 0).toString(16) + (b >>> 0).toString(16);
}
export function approveRequirements(brief: Brief): Brief {
  const issues = intakeIssues(brief);
  if (issues.length) throw Error(issues[0]);
  return {
    ...brief,
    requirements: {
      ...brief.requirements!,
      reviewedAt: new Date().toISOString(),
      reviewKey: requirementReviewKey(brief),
    },
  };
}
export function readyToGenerate(brief: Brief) {
  return (
    intakeIssues(brief).length === 0 &&
    brief.requirements?.reviewKey === requirementReviewKey(brief)
  );
}
