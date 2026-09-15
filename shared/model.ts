import { z } from "zod";

export const roomTypes = [
  "Living room",
  "Bedroom",
  "Kitchen",
  "Bathroom",
  "Dining room",
  "Office",
  "Hallway",
  "Utility",
  "Balcony",
  "Garage",
  "Prayer room",
] as const;
export const RoomSchema = z.object({
  id: z.string(),
  name: z.string().max(80),
  type: z.enum(roomTypes),
  x: z.number().min(-100).max(100),
  y: z.number().min(-100).max(100),
  w: z.number().min(0.5).max(100),
  h: z.number().min(0.5).max(100),
  wallThickness: z.number().min(0.05).max(1).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  material: z.enum(["oak", "tile", "stone", "plain"]).default("oak"),
  geometryLocked: z.boolean().optional(),
});
export type Room = z.infer<typeof RoomSchema>;
export const ROOM_WALL_THICKNESS_PRESETS = [
  { label: "4½\u2033", description: "114 mm partition", meters: 4.5 * 0.0254 },
  { label: "9\u2033", description: "229 mm full wall", meters: 9 * 0.0254 },
] as const;
export const DEFAULT_ROOM_WALL_THICKNESS =
  ROOM_WALL_THICKNESS_PRESETS[0].meters;
export const furnitureTypes = [
  "sofa",
  "armchair",
  "coffee",
  "bed",
  "single-bed",
  "nightstand",
  "dining",
  "chair",
  "desk",
  "wardrobe",
  "bookshelf",
  "plant",
  "rug",
  "kitchen",
  "island",
  "sink",
  "toilet",
  "bath",
  "shower",
  "door",
  "window",
  "opening",
  "stairs",
  "lamp",
  "tv",
] as const;
export type FurnitureType = (typeof furnitureTypes)[number];
export const OpeningDimensionsSchema = z
  .object({
    height: z.number().min(0.1).max(6),
    sill: z.number().min(0).max(5.9),
  })
  .strict();
export const ItemSchema = z.object({
  id: z.string(),
  type: z.enum(furnitureTypes),
  name: z.string().max(80),
  x: z.number().min(-100).max(100),
  y: z.number().min(-100).max(100),
  w: z.number().min(0.1).max(20),
  h: z.number().min(0.1).max(20),
  rotation: z.number().min(-3600).max(3600),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  locked: z.boolean().default(false),
  opening: OpeningDimensionsSchema.optional(),
});
export type Item = z.infer<typeof ItemSchema>;
export function openingDimensions(item: Item) {
  if (!["door", "window", "opening"].includes(item.type)) return undefined;
  const value = item.opening || {
    height: item.type === "window" ? 1.3 : 2.15,
    sill: item.type === "window" ? 0.85 : 0,
  };
  return { ...value, head: value.sill + value.height };
}
export const WallSchema = z.object({
  id: z.string(),
  name: z.string().max(80).optional(),
  geometryLocked: z.boolean().optional(),
  x1: z.number().min(-100).max(100),
  y1: z.number().min(-100).max(100),
  x2: z.number().min(-100).max(100),
  y2: z.number().min(-100).max(100),
  thickness: z.number().min(0.05).max(1),
});
export type Wall = z.infer<typeof WallSchema>;
export const ReferenceSchema = z
  .object({
    name: z.string().min(1).max(200),
    dataUrl: z
      .string()
      .max(7_000_000)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
    x: z.number().min(-100).max(100),
    y: z.number().min(-100).max(100),
    w: z.number().min(0.1).max(120),
    h: z.number().min(0.1).max(120),
    rotation: z.number().min(-360).max(360),
    opacity: z.number().min(0).max(1),
    visible: z.boolean(),
  })
  .strict();
export type ReferenceImage = z.infer<typeof ReferenceSchema>;
export const DEFAULT_CEILING_HEIGHT = 2.7;
export const CeilingHeightSchema = z.number().min(2.2).max(6);
export const FloorSchema = z
  .object({
    id: z.string(),
    name: z.string().max(80),
    programIndex: z.number().int().min(0).max(7).optional(),
    ceilingHeight: CeilingHeightSchema.optional(),
    rooms: z.array(RoomSchema).max(100),
    items: z.array(ItemSchema).max(1000),
    walls: z.array(WallSchema).max(500),
    reference: ReferenceSchema.optional(),
  })
  .superRefine((floor, ctx) => {
    floor.items.forEach((item, index) => {
      const dimensions = openingDimensions(item);
      const path = ["items", index, "opening"];
      if (item.opening && !dimensions)
        ctx.addIssue({
          code: "custom",
          path,
          message:
            "Opening dimensions apply only to doors, windows and open passages.",
        });
      if (!dimensions) return;
      if (item.type !== "window" && dimensions.sill !== 0)
        ctx.addIssue({
          code: "custom",
          path,
          message: `${item.name}: doors and open passages must start at floor level.`,
        });
      if (
        dimensions.head >
        (floor.ceilingHeight ?? DEFAULT_CEILING_HEIGHT) + 1e-6
      )
        ctx.addIssue({
          code: "custom",
          path,
          message: `${item.name}: opening top exceeds the floor's ceiling height.`,
        });
    });
  });
export type Floor = z.infer<typeof FloorSchema>;
export const requirementKeys = [
  "project",
  "site",
  "household",
  "rooms",
  "relationships",
  "access",
  "structure",
  "services",
  "environment",
  "outdoors",
  "budget",
  "rules",
] as const;
export const RequirementsSchema = z.object({
  responses: z
    .array(
      z.object({
        key: z.enum(requirementKeys),
        status: z.enum(["provided", "unknown", "not-applicable"]),
        details: z.string().max(4000),
        priority: z.enum(["preference", "must"]),
      }),
    )
    .max(12)
    .refine(
      (a) => new Set(a.map((x) => x.key)).size === a.length,
      "Duplicate requirement sections",
    ),
  custom: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1).max(2000),
        priority: z.enum(["preference", "must"]),
      }),
    )
    .max(40),
  reviewedAt: z.string().optional(),
  ruleLinks: z
    .array(
      z
        .object({
          source: z.string().min(1).max(200),
          text: z.string().min(1).max(4000),
          rules: z.array(z.string().min(1).max(1000)).min(1).max(24),
        })
        .strict(),
    )
    .max(52)
    .refine(
      (links) =>
        new Set(links.map((link) => link.source)).size === links.length,
      "Duplicate requirement rule links",
    )
    .optional(),
  reviewKey: z.string().optional(),
  coreConfirmed: z.boolean().default(false),
  assumptionsAccepted: z.boolean().default(false),
});
export type Requirements = z.infer<typeof RequirementsSchema>;
export const RoomSizeRuleSchema = z
  .object({
    roomType: z.enum(roomTypes).exclude(["Hallway"]),
    minWidth: z.number().min(0.5).max(60).optional(),
    minDepth: z.number().min(0.5).max(60).optional(),
    minArea: z.number().min(0.25).max(3600).optional(),
    maxWidth: z.number().min(0.5).max(60).optional(),
    maxDepth: z.number().min(0.5).max(60).optional(),
    maxArea: z.number().min(0.25).max(3600).optional(),
  })
  .strict()
  .refine(
    (r) =>
      r.minWidth !== undefined ||
      r.minDepth !== undefined ||
      r.minArea !== undefined ||
      r.maxWidth !== undefined ||
      r.maxDepth !== undefined ||
      r.maxArea !== undefined,
    "Enter at least one room size limit",
  )
  .refine(
    (r) =>
      (r.minWidth ?? 0) <= (r.maxWidth ?? Infinity) &&
      (r.minDepth ?? 0) <= (r.maxDepth ?? Infinity) &&
      (r.minArea ?? 0) <= (r.maxArea ?? Infinity) &&
      (r.minWidth ?? 0.5) * (r.minDepth ?? 0.5) <=
        (r.maxArea ?? Infinity) + 1e-7 &&
      (r.maxWidth ?? Infinity) * (r.maxDepth ?? Infinity) + 1e-7 >=
        (r.minArea ?? 0),
    "Room size minimums and maximums conflict",
  );
export type RoomSizeRule = z.infer<typeof RoomSizeRuleSchema>;
export const SideSetbacksSchema = z
  .object({
    north: z.number().min(0).max(10),
    east: z.number().min(0).max(10),
    south: z.number().min(0).max(10),
    west: z.number().min(0).max(10),
  })
  .strict();
export const BriefSchema = z.object({
  openingSizes: z
    .object({
      doorHeight: z.number().min(0.1).max(6).optional(),
      passageHeight: z.number().min(0.1).max(6).optional(),
      windowHeight: z.number().min(0.1).max(6).optional(),
      windowSill: z.number().min(0).max(5.9).optional(),
    })
    .strict()
    .refine(
      (r) => Object.values(r).some((v) => v !== undefined),
      "Enter at least one opening dimension",
    )
    .optional(),
  width: z.number().min(5).max(60),
  depth: z.number().min(5).max(60),
  setback: z.number().min(0).max(10),
  sideSetbacks: SideSetbacksSchema.nullable().optional(),
  bedrooms: z.number().int().min(0).max(8),
  bathrooms: z.number().int().min(1).max(5),
  occupants: z.number().int().min(1).max(20),
  floors: z.number().int().min(1).max(4),
  floorHeights: z
    .array(
      z
        .object({
          floor: z.number().int().min(0).max(3),
          ceilingHeight: CeilingHeightSchema,
        })
        .strict(),
    )
    .max(4)
    .refine(
      (rows) => new Set(rows.map((r) => r.floor)).size === rows.length,
      "Duplicate floor heights",
    )
    .optional(),
  floorPrograms: z
    .array(
      z
        .object({
          floor: z.number().int().min(0).max(3),
          rooms: z
            .array(
              z
                .object({
                  type: z.enum(roomTypes).exclude(["Hallway"]),
                  count: z.number().int().min(1).max(8),
                })
                .strict(),
            )
            .max(10)
            .refine(
              (rooms) =>
                new Set(rooms.map((r) => r.type)).size === rooms.length,
              "Duplicate room types on a floor",
            ),
        })
        .strict(),
    )
    .max(4)
    .refine(
      (programs) =>
        new Set(programs.map((p) => p.floor)).size === programs.length,
      "Duplicate floor programs",
    )
    .nullable()
    .optional(),
  budget: z.string().max(100),
  location: z.string().max(200),
  orientation: z.enum(["North", "East", "South", "West"]),
  style: z.enum([
    "Japandi",
    "Contemporary",
    "Minimal",
    "Traditional",
    "Industrial",
    "Coastal",
  ]),
  extras: z.array(z.string().max(100)).max(30),
  priorities: z.array(z.string().max(100)).max(30),
  notes: z.string().max(12000),
  accessibility: z.boolean(),
  circulation: z
    .object({
      minHallwayWidth: z.number().min(0.6).max(5).optional(),
      minDoorWidth: z.number().min(0.5).max(3).optional(),
    })
    .strict()
    .refine(
      (r) => r.minHallwayWidth !== undefined || r.minDoorWidth !== undefined,
      "Enter at least one circulation width",
    )
    .optional(),
  openPlan: z.boolean(),
  roomRelationships: z
    .array(
      z
        .object({
          a: z.enum(roomTypes).exclude(["Hallway"]),
          b: z.enum(roomTypes).exclude(["Hallway"]),
          relation: z.enum(["adjacent", "separate"]),
        })
        .strict()
        .refine((r) => r.a !== r.b, "Choose different room types"),
    )
    .max(12)
    .refine(
      (r) =>
        new Set(r.map((x) => [x.a, x.b].sort().join("|"))).size === r.length,
      "Use one relationship per room pair",
    )
    .optional(),
  requirements: RequirementsSchema.optional(),
  roomSizeRules: z
    .array(RoomSizeRuleSchema)
    .max(10)
    .refine(
      (r) => new Set(r.map((x) => x.roomType)).size === r.length,
      "Use one size rule per room type",
    )
    .optional(),
});
export type Brief = z.infer<typeof BriefSchema>;
export const EditOperationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("update_room"),
      id: z.string(),
      patch: RoomSchema.omit({ id: true, geometryLocked: true })
        .extend({ material: RoomSchema.shape.material.removeDefault() })
        .partial()
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("update_item"),
      id: z.string(),
      patch: ItemSchema.omit({ id: true, type: true })
        .extend({ locked: ItemSchema.shape.locked.removeDefault() })
        .partial()
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("update_wall"),
      id: z.string(),
      patch: WallSchema.omit({ id: true, geometryLocked: true })
        .partial()
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("remove"),
      target: z.enum(["room", "item", "wall"]),
      id: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("add_item"),
      type: z.enum(furnitureTypes),
      x: z.number().min(-100).max(100),
      y: z.number().min(-100).max(100),
      w: z.number().min(0.1).max(20).optional(),
      h: z.number().min(0.1).max(20).optional(),
      rotation: z.number().min(-3600).max(3600).optional(),
      name: z.string().max(80).optional(),
      opening: OpeningDimensionsSchema.optional(),
      color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("add_room"),
      room: RoomSchema.omit({ id: true, geometryLocked: true }).strict(),
    })
    .strict(),
]);
export type EditOperation = z.infer<typeof EditOperationSchema>;
export const EditProposalSchema = z.object({
  floorId: z.string(),
  baseHash: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(EditOperationSchema).min(1).max(30),
  changes: z.array(z.string().max(1000)).max(30),
  warnings: z.array(z.string().max(1000)).max(20),
  status: z.enum(["pending", "applied", "dismissed"]).default("pending"),
});
export type EditProposal = z.infer<typeof EditProposalSchema>;
export const IntakeProposalSchema = z.object({
  baseKey: z.string(),
  responses: RequirementsSchema.shape.responses,
  source: z.string().min(1).max(12000),
  status: z.enum(["pending", "applied", "dismissed"]).default("pending"),
});
export type IntakeProposal = z.infer<typeof IntakeProposalSchema>;
export const ProjectSchema = z
  .object({
    version: z.literal(1),
    id: z.string(),
    name: z.string().max(100),
    floors: z.array(FloorSchema).min(1).max(8),
    brief: BriefSchema,
    updatedAt: z.string(),
    notes: z.array(z.string().max(2000)).max(100).default([]),
    conversation: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(16000),
          brief: BriefSchema.optional(),
          edit: EditProposalSchema.optional(),
          intake: IntakeProposalSchema.optional(),
        }),
      )
      .optional(),
  })
  .superRefine((p, ctx) => {
    const ids = [
      p.id,
      ...p.floors.flatMap((f) => [
        f.id,
        ...f.rooms.map((r) => r.id),
        ...f.items.map((i) => i.id),
        ...f.walls.map((w) => w.id),
      ]),
    ];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Project identifiers must be unique.",
      });
  });
export type Project = z.infer<typeof ProjectSchema>;
export type AIConfig = {
  provider: "builtin" | "ollama" | "compatible";
  model: string;
  baseUrl: string;
  apiKey: string;
};
export const uid = () => globalThis.crypto.randomUUID();
export const defaultBrief: Brief = {
  width: 12,
  depth: 10,
  setback: 0,
  bedrooms: 2,
  bathrooms: 1,
  occupants: 3,
  floors: 1,
  budget: "",
  location: "",
  orientation: "North",
  style: "Japandi",
  extras: ["Dining room"],
  priorities: ["Natural light", "Open living"],
  notes: "A calm, light-filled home with natural materials and room to unwind.",
  accessibility: false,
  openPlan: true,
};
export const colors: Record<string, string> = {
  "Living room": "#ece4d7",
  Bedroom: "#e6e4d7",
  Kitchen: "#eeede8",
  Bathroom: "#dfe7e6",
  "Dining room": "#ece4d7",
  Office: "#e5e6dc",
  Hallway: "#eee8df",
  Utility: "#e6e7e4",
  Balcony: "#dce3d5",
  Garage: "#deded8",
  "Prayer room": "#e9e3d4",
};
export const catalog: {
  type: FurnitureType;
  name: string;
  category: string;
  w: number;
  h: number;
  color: string;
}[] = [
  {
    type: "sofa",
    name: "Linen sofa",
    category: "Living",
    w: 2.5,
    h: 1,
    color: "#c6c5b2",
  },
  {
    type: "armchair",
    name: "Lounge chair",
    category: "Living",
    w: 0.85,
    h: 0.9,
    color: "#b8906f",
  },
  {
    type: "coffee",
    name: "Oak coffee table",
    category: "Living",
    w: 1.2,
    h: 0.65,
    color: "#bf9e77",
  },
  {
    type: "tv",
    name: "Media console",
    category: "Living",
    w: 1.8,
    h: 0.35,
    color: "#9c866d",
  },
  {
    type: "bed",
    name: "Upholstered bed",
    category: "Bedroom",
    w: 1.8,
    h: 2.1,
    color: "#aab8a3",
  },
  {
    type: "single-bed",
    name: "Single bed",
    category: "Bedroom",
    w: 1,
    h: 2.1,
    color: "#c2b49f",
  },
  {
    type: "nightstand",
    name: "Bedside table",
    category: "Bedroom",
    w: 0.5,
    h: 0.5,
    color: "#bd9c76",
  },
  {
    type: "wardrobe",
    name: "Oak wardrobe",
    category: "Bedroom",
    w: 1.8,
    h: 0.6,
    color: "#c8b18e",
  },
  {
    type: "dining",
    name: "Dining table",
    category: "Dining",
    w: 1.8,
    h: 1.4,
    color: "#c4a580",
  },
  {
    type: "chair",
    name: "Dining chair",
    category: "Dining",
    w: 0.5,
    h: 0.5,
    color: "#bfac8e",
  },
  {
    type: "kitchen",
    name: "Kitchen cabinets",
    category: "Kitchen",
    w: 3,
    h: 0.65,
    color: "#b9c4b3",
  },
  {
    type: "island",
    name: "Kitchen island",
    category: "Kitchen",
    w: 1.8,
    h: 0.9,
    color: "#d9d6ca",
  },
  {
    type: "sink",
    name: "Double sink",
    category: "Kitchen",
    w: 0.9,
    h: 0.6,
    color: "#e1e5df",
  },
  {
    type: "bath",
    name: "Freestanding bath",
    category: "Bathroom",
    w: 0.8,
    h: 1.7,
    color: "#f6f6f1",
  },
  {
    type: "toilet",
    name: "Toilet",
    category: "Bathroom",
    w: 0.5,
    h: 0.7,
    color: "#f6f6f1",
  },
  {
    type: "shower",
    name: "Walk-in shower",
    category: "Bathroom",
    w: 1,
    h: 1,
    color: "#d1e0dc",
  },
  {
    type: "desk",
    name: "Writing desk",
    category: "Office",
    w: 1.4,
    h: 0.65,
    color: "#c3a580",
  },
  {
    type: "bookshelf",
    name: "Bookcase",
    category: "Office",
    w: 1.2,
    h: 0.35,
    color: "#b89a74",
  },
  {
    type: "plant",
    name: "Indoor plant",
    category: "Decor",
    w: 0.65,
    h: 0.65,
    color: "#66835d",
  },
  {
    type: "rug",
    name: "Woven rug",
    category: "Decor",
    w: 2.4,
    h: 1.8,
    color: "#d7c9b3",
  },
  {
    type: "lamp",
    name: "Floor lamp",
    category: "Decor",
    w: 0.4,
    h: 0.4,
    color: "#d8c9a9",
  },
  {
    type: "door",
    name: "Interior door",
    category: "Structure",
    w: 0.9,
    h: 0.9,
    color: "#b29570",
  },
  {
    type: "window",
    name: "Wide window",
    category: "Structure",
    w: 1.8,
    h: 0.15,
    color: "#a9c5cc",
  },
  {
    type: "opening",
    name: "Wide opening",
    category: "Structure",
    w: 2.4,
    h: 0.15,
    color: "#ece4d7",
  },
  {
    type: "stairs",
    name: "Straight staircase",
    category: "Structure",
    w: 1.1,
    h: 3,
    color: "#c9c4b7",
  },
];
export function makeItem(
  type: FurnitureType,
  x: number,
  y: number,
  overrides: Partial<Item> = {},
): Item {
  const c = catalog.find((c) => c.type === type)!;
  return {
    id: uid(),
    type,
    name: c.name,
    x,
    y,
    w: c.w,
    h: c.h,
    rotation: 0,
    color: c.color,
    locked: false,
    ...overrides,
  };
}
export function makeRoom(
  type: Room["type"],
  x: number,
  y: number,
  w: number,
  h: number,
  name: string = type,
): Room {
  return {
    id: uid(),
    name,
    type,
    x,
    y,
    w,
    h,
    color: colors[type],
    material: ["Bathroom", "Kitchen", "Utility"].includes(type)
      ? "tile"
      : "oak",
  };
}
export function sampleProject(): Project {
  return {
    version: 1,
    id: uid(),
    name: "The Willow House",
    brief: { ...defaultBrief },
    updatedAt: new Date().toISOString(),
    notes: [],
    floors: [
      {
        id: uid(),
        name: "Ground floor",
        walls: [],
        rooms: [
          makeRoom("Living room", 0, 0, 6.6, 5.8),
          makeRoom("Kitchen", 6.6, 0, 5.4, 3.5),
          makeRoom("Dining room", 6.6, 3.5, 5.4, 2.3),
          makeRoom(
            "Bedroom",
            0,
            5.8,
            4.5,
            4.2,
            "Primary bedroom" as Room["type"],
          ),
          makeRoom("Hallway", 4.5, 5.8, 7.5, 1.2),
          makeRoom("Bedroom", 4.5, 7, 3.7, 3, "Bedroom 2" as Room["type"]),
          makeRoom("Bathroom", 8.2, 7, 3.8, 3),
        ],
        items: [
          makeItem("rug", 1.1, 1.7, { w: 3.8, h: 2.5 }),
          makeItem("sofa", 1.3, 0.85, { w: 3.1, h: 1.05 }),
          makeItem("armchair", 4.6, 2.25, { rotation: 90 }),
          makeItem("coffee", 2.45, 2.5, { w: 1.4, h: 0.8 }),
          makeItem("tv", 0.18, 2.6, { w: 0.4, h: 1.8 }),
          makeItem("plant", 0.4, 0.4),
          makeItem("plant", 5.6, 4.7),
          makeItem("lamp", 4.7, 0.7),
          makeItem("kitchen", 6.8, 0.18, { w: 5, h: 0.65 }),
          makeItem("kitchen", 11.2, 0.85, { w: 0.6, h: 2.2 }),
          makeItem("sink", 8.5, 0.2),
          makeItem("island", 8, 2, { w: 2.2, h: 0.85 }),
          makeItem("dining", 8.1, 3.9, { w: 2.2, h: 1.5 }),
          makeItem("plant", 11.15, 4.75),
          makeItem("rug", 0.8, 6.55, { w: 2.9, h: 2.8 }),
          makeItem("bed", 1.3, 6.35, { w: 1.8, h: 2.3 }),
          makeItem("nightstand", 0.65, 6.45),
          makeItem("nightstand", 3.25, 6.45),
          makeItem("wardrobe", 0.15, 9.15, { w: 2.3, h: 0.6 }),
          makeItem("plant", 3.55, 9.1),
          makeItem("single-bed", 4.95, 7.4, { w: 1.2, h: 2.1 }),
          makeItem("desk", 6.45, 9.1),
          makeItem("nightstand", 6.3, 7.45),
          makeItem("plant", 7.35, 7.4),
          makeItem("bath", 10.9, 7.35, { w: 0.8, h: 1.8 }),
          makeItem("toilet", 8.6, 8.9),
          makeItem("sink", 9, 7.2),
          makeItem("window", 1.6, 0, { w: 2.8 }),
          makeItem("window", 8.4, 0, { w: 2.2 }),
          makeItem("window", 0, 2.6, { w: 0.15, h: 1.8 }),
          makeItem("window", 1.15, 10, { w: 2.2 }),
          makeItem("window", 5.2, 10, { w: 1.8 }),
          makeItem("window", 12, 7.85, { w: 0.15, h: 1.25 }),
          makeItem("door", 3.4, 5.8),
          makeItem("door", 5.2, 7),
          makeItem("door", 8.7, 7),
          makeItem("door", 11, 5.8),
          makeItem("door", 6.6, 4.4, { rotation: 90 }),
          makeItem("door", 8, 3.5, { w: 2, h: 0.2 }),
          makeItem("door", 6.6, 1.8, { rotation: 90 }),
          makeItem("door", 12, 5.95, {
            w: 0.9,
            h: 0.9,
            rotation: 90,
            name: "Main entrance",
          }),
        ],
      },
    ],
  };
}
