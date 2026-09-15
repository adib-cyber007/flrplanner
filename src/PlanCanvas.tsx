import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Furniture } from "./Furniture";
import {
  makeItem,
  makeRoom,
  uid,
  type Floor,
  type FurnitureType,
  type Project,
  furnitureTypes,
} from "../shared/model";
import { moveRoom, resizeElement, snapOpening } from "../shared/editing";
import { editWall } from "../shared/wallEditing";
import { siteEnvelope } from "../shared/site";
import {
  roomInteriorDimensions,
  roomWallSegments,
  wallOpenings,
} from "../shared/geometry";
export type Tool = "select" | "hand" | "room" | "wall" | "measure";
export type Selection = { kind: "room" | "item" | "wall"; id: string } | null;
type Props = {
  project: Project;
  floor: Floor;
  tool: Tool;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (f: Floor) => void;
  zoom: number;
  grid: boolean;
  dimensions: boolean;
  units: "m" | "ft";
  resetView: number;
  onNotice?: (text: string) => void;
};
export default function PlanCanvas({
  project,
  floor,
  tool,
  selection,
  onSelect,
  onChange,
  zoom,
  grid,
  dimensions,
  units,
  resetView,
  onNotice,
}: Props) {
  const reference = floor.reference?.visible ? floor.reference : undefined;
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    x2: number;
    y2: number;
  } | null>(null);
  const drawing = useRef(false);
  const wallDrag = useRef<{
    id: string;
    x: number;
    y: number;
    endpoint?: 1 | 2;
    original: Floor;
  } | null>(null);
  const wallError = useRef("");
  const resize = useRef<{
    kind: "room" | "item";
    id: string;
    corner: [number, number];
    original: Floor;
  } | null>(null);
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setDraft(null);
    drawing.current = false;
    resize.current = null;
    wallDrag.current = null;
    wallError.current = "";
    setPreview(null);
  }, [resetView, floor.id]);
  useEffect(() => {
    setDraft(null);
    drawing.current = false;
    wallDrag.current = null;
    wallError.current = "";
    setPreview(null);
  }, [tool]);
  useEffect(() => {
    if (wallDrag.current && wallDrag.current.original !== floor) {
      wallDrag.current = null;
      wallError.current = "";
      setPreview(null);
    }
  }, [floor]);
  const drag = useRef<{
    id: string;
    kind: "room" | "item";
    x: number;
    y: number;
    ox: number;
    oy: number;
    original: Floor;
  } | null>(null);
  const panning = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const [preview, setPreview] = useState<Floor | null>(null);
  const envelope = siteEnvelope(project.brief);
  const w = Math.max(1, envelope.width),
    h = Math.max(1, envelope.depth);
  const vw = (w + 4) / zoom,
    vh = (h + 4) / zoom;
  const point = (e: { clientX: number; clientY: number }) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svgRef.current!.getScreenCTM()!.inverse(),
    );
    return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  };
  function start(e: PointerEvent, kind?: "room" | "item", id?: string) {
    if (e.button !== 0) return;
    const p = point(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (tool === "hand") {
      panning.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
      return;
    }
    if (tool === "room" || tool === "wall" || tool === "measure") {
      e.stopPropagation();
      drawing.current = true;
      setDraft({ x: p.x, y: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (kind && id) {
      e.stopPropagation();
      onSelect({ kind, id });
      const original = (kind === "room" ? floor.rooms : floor.items).find(
        (x) => x.id === id,
      )!;
      if (
        ("locked" in original && original.locked) ||
        ("geometryLocked" in original && original.geometryLocked)
      )
        return;
      drag.current = {
        kind,
        id,
        x: p.x,
        y: p.y,
        ox: original.x,
        oy: original.y,
        original: floor,
      };
    } else onSelect(null);
  }
  function startResize(
    e: PointerEvent,
    kind: "room" | "item",
    id: string,
    corner: [number, number],
  ) {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    resize.current = { kind, id, corner, original: floor };
  }
  function startWall(e: PointerEvent, id: string, endpoint?: 1 | 2) {
    if (tool !== "select") {
      start(e);
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect({ kind: "wall", id });
    if (floor.walls.find((w) => w.id === id)?.geometryLocked) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    wallError.current = "";
    wallDrag.current = { id, ...point(e), endpoint, original: floor };
  }
  function move(e: PointerEvent) {
    if (panning.current) {
      const a = panning.current;
      const scale = svgRef.current!.getScreenCTM()!.a;
      setPan({
        x: a.ox - (e.clientX - a.x) / scale,
        y: a.oy - (e.clientY - a.y) / scale,
      });
      return;
    }
    const p = point(e);
    if (wallDrag.current) {
      const drag = wallDrag.current,
        wall = drag.original.walls.find((w) => w.id === drag.id)!;
      const patch =
        drag.endpoint === 1
          ? { x1: p.x, y1: p.y }
          : drag.endpoint === 2
            ? { x2: p.x, y2: p.y }
            : {
                x1: wall.x1 + (p.x - drag.x),
                y1: wall.y1 + (p.y - drag.y),
                x2: wall.x2 + (p.x - drag.x),
                y2: wall.y2 + (p.y - drag.y),
              };
      try {
        setPreview(
          editWall(
            drag.original,
            drag.id,
            patch,
            drag.endpoint === 1 ? "end" : "start",
          ),
        );
        wallError.current = "";
      } catch (error) {
        setPreview(null);
        wallError.current = (error as Error).message;
      }
      return;
    }
    if (resize.current) {
      const r = resize.current;
      setPreview(resizeElement(r.original, r.kind, r.id, r.corner, p));
      return;
    }
    if (draft && drawing.current) {
      setDraft({ ...draft, x2: p.x, y2: p.y });
      return;
    }
    if (!drag.current) return;
    const d = drag.current;
    const x = Math.round((d.ox + p.x - d.x) * 10) / 10,
      y = Math.round((d.oy + p.y - d.y) * 10) / 10;
    if (d.kind === "room") {
      setPreview(moveRoom(d.original, d.id, x, y));
      return;
    }
    const key = "items";
    setPreview({
      ...floor,
      [key]: floor[key].map((o) =>
        o.id === d.id
          ? snapOpening(d.original, {
              ...o,
              x,
              y,
            } as import("../shared/model").Item)
          : o,
      ),
    });
  }
  function end() {
    panning.current = null;
    if ((drag.current || resize.current || wallDrag.current) && preview)
      onChange(preview);
    if (wallDrag.current && wallError.current) onNotice?.(wallError.current);
    wallDrag.current = null;
    wallError.current = "";
    resize.current = null;
    drag.current = null;
    setPreview(null);
    if (draft && drawing.current) {
      drawing.current = false;
      if (tool === "room") {
        const rw = Math.abs(draft.x2 - draft.x),
          rh = Math.abs(draft.y2 - draft.y);
        if (rw >= 0.5 && rh >= 0.5) {
          const r = makeRoom(
            "Living room",
            Math.min(draft.x, draft.x2),
            Math.min(draft.y, draft.y2),
            rw,
            rh,
          );
          onChange({ ...floor, rooms: [...floor.rooms, r] });
          onSelect({ kind: "room", id: r.id });
        }
      }
      if (
        tool === "wall" &&
        Math.hypot(draft.x2 - draft.x, draft.y2 - draft.y) > 0.2
      ) {
        const wall = {
          id: uid(),
          x1: draft.x,
          y1: draft.y,
          x2: draft.x2,
          y2: draft.y2,
          thickness: 0.15,
        };
        onChange({ ...floor, walls: [...floor.walls, wall] });
        onSelect({ kind: "wall", id: wall.id });
      }
      if (tool !== "measure") setDraft(null);
    }
  }
  const shown = preview || floor;
  const shownRoomWalls = roomWallSegments(shown);
  const fmt = (v: number) =>
    `${(v * (units === "ft" ? 3.28084 : 1)).toFixed(2)} ${units}`;
  const resizingRoom =
    draft && tool === "room"
      ? {
          x: Math.min(draft.x, draft.x2),
          y: Math.min(draft.y, draft.y2),
          w: Math.abs(draft.x2 - draft.x),
          h: Math.abs(draft.y2 - draft.y),
        }
      : resize.current?.kind === "room" && preview
        ? shown.rooms.find((room) => room.id === resize.current?.id)
        : undefined;
  return (
    <svg
      id="floor-plan"
      ref={svgRef}
      className={`plan-canvas tool-${tool}`}
      viewBox={`${-2 + pan.x + (w + 4 - vw) / 2} ${-2 + pan.y + (h + 4 - vh) / 2} ${vw} ${vh}`}
      xmlns="http://www.w3.org/2000/svg"
      onPointerDown={(e) => start(e)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        panning.current = null;
        drag.current = null;
        resize.current = null;
        wallDrag.current = null;
        wallError.current = "";
        drawing.current = false;
        setPreview(null);
        setDraft(null);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData("forma-item") as FurnitureType;
        if (!furnitureTypes.includes(type)) return;
        const p = point(e);
        const item = snapOpening(floor, makeItem(type, p.x, p.y));
        onChange({ ...floor, items: [...floor.items, item] });
        onSelect({ kind: "item", id: item.id });
      }}
      aria-label="Interactive floor plan. Select and drag rooms or furniture. Use the properties panel for precise dimensions."
    >
      <defs>
        <pattern id="dots" width=".5" height=".5" patternUnits="userSpaceOnUse">
          <circle cx=".25" cy=".25" r=".011" fill="#bcbfb4" />
        </pattern>
        <pattern
          id="oak"
          width="1.4"
          height=".18"
          patternUnits="userSpaceOnUse"
        >
          <rect width="1.4" height=".18" fill="none" />
          <path
            d="M0 0H1.4M0 0V.18M.7 .09H1.4"
            fill="none"
            stroke="#c7b59b"
            strokeWidth=".009"
            opacity=".5"
          />
        </pattern>
        <pattern id="tile" width=".5" height=".5" patternUnits="userSpaceOnUse">
          <path
            d="M0 0H.5V.5"
            fill="none"
            stroke="#bbc8c3"
            strokeWidth=".012"
            opacity=".65"
          />
        </pattern>
        <pattern
          id="stone"
          width=".8"
          height=".5"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 0H.8V.5M.4 0V.5"
            fill="none"
            stroke="#acb3ad"
            strokeWidth=".012"
          />
        </pattern>
      </defs>
      {grid && (
        <rect x="-200" y="-200" width="400" height="400" fill="url(#dots)" />
      )}
      {reference && (
        <image
          data-reference-image
          href={reference.dataUrl}
          x={reference.x}
          y={reference.y}
          width={reference.w}
          height={reference.h}
          opacity={reference.opacity}
          transform={`rotate(${reference.rotation} ${reference.x + reference.w / 2} ${reference.y + reference.h / 2})`}
          preserveAspectRatio="xMidYMid meet"
          pointerEvents="none"
        />
      )}
      <g>
        {[...shown.rooms]
          .sort((a, b) => b.w * b.h - a.w * a.h)
          .map((r) => (
            <g
              key={r.id}
              onPointerDown={(e) => start(e, "room", r.id)}
              data-room={r.name}
              data-geometry-locked={r.geometryLocked || undefined}
              style={{ cursor: r.geometryLocked ? "default" : "move" }}
              role="button"
              aria-label={`Select ${r.name}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelect({ kind: "room", id: r.id });
              }}
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={r.color}
                fillOpacity={reference ? 0.65 : 1}
              />
              {r.material !== "plain" && (
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  fill={`url(#${r.material})`}
                />
              )}
              {selection?.id === r.id && (
                <rect
                  data-editor-overlay="true"
                  x={r.x + 0.08}
                  y={r.y + 0.08}
                  width={Math.max(0.1, r.w - 0.16)}
                  height={Math.max(0.1, r.h - 0.16)}
                  fill="#8cbca4"
                  fillOpacity=".13"
                  stroke="#468b6d"
                  strokeWidth=".025"
                  strokeDasharray=".1 .06"
                />
              )}
              <rect
                className="plan-focus-ring"
                data-editor-overlay="true"
                x={r.x + 0.08}
                y={r.y + 0.08}
                width={Math.max(0.1, r.w - 0.16)}
                height={Math.max(0.1, r.h - 0.16)}
                fill="none"
                stroke="#34795b"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            </g>
          ))}
      </g>
      <g data-room-walls pointerEvents="none" stroke="#696d61">
        {shownRoomWalls.map((wall) => {
          const dx = wall.x2 - wall.x1,
            dy = wall.y2 - wall.y1;
          const length = Math.hypot(dx, dy);
          const holes = wallOpenings(wall, shown.items);
          const breaks = [
            ...new Set([0, length, ...holes.flatMap((o) => [o.start, o.end])]),
          ].sort((a, b) => a - b);
          return breaks.slice(0, -1).map((start, i) => {
            const end = breaks[i + 1],
              mid = (start + end) / 2;
            if (holes.some((o) => mid >= o.start && mid <= o.end)) return null;
            return (
              <line
                key={`${wall.id}-${i}`}
                data-room-wall={wall.id}
                data-wall-boundary-axis={wall.boundaryAxis}
                data-wall-boundary-at={wall.boundaryAt}
                x1={wall.x1 + (dx * start) / length}
                y1={wall.y1 + (dy * start) / length}
                x2={wall.x1 + (dx * end) / length}
                y2={wall.y1 + (dy * end) / length}
                strokeWidth={wall.thickness}
              />
            );
          });
        })}
      </g>
      {shown.walls.map((wall, index) => (
        <g
          key={wall.id}
          data-wall={wall.id}
          data-geometry-locked={wall.geometryLocked || undefined}
          role="button"
          tabIndex={0}
          aria-label={`Select ${wall.name || `Wall ${index + 1}`}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect({ kind: "wall", id: wall.id });
            }
          }}
          onPointerDown={(e) => startWall(e, wall.id)}
          style={{ cursor: wall.geometryLocked ? "default" : "move" }}
        >
          <line
            x1={wall.x1}
            y1={wall.y1}
            x2={wall.x2}
            y2={wall.y2}
            stroke={selection?.id === wall.id ? "#468b6d" : "#696d61"}
            strokeWidth={wall.thickness}
          />
          <line
            className="plan-focus-ring"
            data-editor-overlay="true"
            x1={wall.x1}
            y1={wall.y1}
            x2={wall.x2}
            y2={wall.y2}
            stroke="#34795b"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </g>
      ))}
      {[...shown.items]
        .sort((a, b) => Number(a.type !== "rug") - Number(b.type !== "rug"))
        .map((item) => (
          <g
            key={item.id}
            transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.type === "door" ? 0 : item.w / 2} ${item.type === "door" ? 0 : item.h / 2})`}
            onPointerDown={(e) => start(e, "item", item.id)}
            data-item={item.type}
            role="button"
            aria-label={`Select ${item.name}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect({ kind: "item", id: item.id });
            }}
            style={{ cursor: item.locked ? "not-allowed" : "move" }}
          >
            <svg
              width={item.w}
              height={item.h}
              viewBox="0 0 100 100"
              overflow="visible"
              preserveAspectRatio="none"
            >
              <Furniture type={item.type} color={item.color} />
            </svg>
            <rect
              className="plan-focus-ring"
              data-editor-overlay="true"
              width={item.w}
              height={item.h}
              fill="none"
              stroke="#34795b"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {selection?.id === item.id && (
              <g data-editor-overlay="true">
                <rect
                  width={item.w}
                  height={item.h}
                  fill="transparent"
                  stroke="#34795b"
                  strokeWidth=".025"
                  strokeDasharray=".06 .04"
                />
                {!item.locked &&
                  [
                    [0, 0],
                    [item.w, 0],
                    [0, item.h],
                    [item.w, item.h],
                  ].map(([x, y], i) => (
                    <rect
                      key={i}
                      x={x - 0.045}
                      y={y - 0.045}
                      width=".09"
                      height=".09"
                      fill="white"
                      stroke="#34795b"
                      strokeWidth=".02"
                      style={{
                        cursor:
                          i === 0 || i === 3 ? "nwse-resize" : "nesw-resize",
                      }}
                      data-resize-item={i}
                      onPointerDown={(e) =>
                        startResize(e, "item", item.id, [
                          x === 0 ? 0 : 1,
                          y === 0 ? 0 : 1,
                        ])
                      }
                    />
                  ))}
              </g>
            )}
          </g>
        ))}
      {selection?.kind === "room" &&
        shown.rooms
          .filter((r) => r.id === selection.id && !r.geometryLocked)
          .map((r) => (
            <g key={r.id} data-editor-overlay="true">
              {(
                [
                  [0, 0],
                  [1, 0],
                  [0, 1],
                  [1, 1],
                ] as [number, number][]
              ).map(([cx, cy], i) => {
                const x = r.x + cx * r.w;
                const y = r.y + cy * r.h;
                const inwardX = cx ? -0.2 : 0.2;
                const inwardY = cy ? -0.2 : 0.2;
                return (
                  <g key={i}>
                    <rect
                      x={x - 0.16}
                      y={y - 0.16}
                      width=".32"
                      height=".32"
                      fill="transparent"
                      style={{
                        cursor:
                          i === 0 || i === 3 ? "nwse-resize" : "nesw-resize",
                      }}
                      data-resize-room={i}
                      onPointerDown={(e) =>
                        startResize(e, "room", r.id, [cx, cy])
                      }
                    />
                    <path
                      d={`M${x + inwardX} ${y}H${x}V${y + inwardY}`}
                      fill="none"
                      stroke="#34795b"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
            </g>
          ))}
      {resizingRoom && (
        <g
          data-live-room-measurements
          data-editor-overlay="true"
          pointerEvents="none"
          fontFamily="Manrope, sans-serif"
          fontSize=".24"
          fontWeight="750"
          fill="#294c3f"
          stroke="#7d9c88"
          strokeWidth=".018"
          textAnchor="middle"
        >
          <path
            d={`M${resizingRoom.x} ${resizingRoom.y - 0.18}V${resizingRoom.y - 0.52}M${resizingRoom.x + resizingRoom.w} ${resizingRoom.y - 0.18}V${resizingRoom.y - 0.52}M${resizingRoom.x} ${resizingRoom.y - 0.4}H${resizingRoom.x + resizingRoom.w}`}
            fill="none"
          />
          <g
            transform={`translate(${resizingRoom.x + resizingRoom.w / 2} ${resizingRoom.y - 0.4})`}
          >
            <rect
              x="-.96"
              y="-.25"
              width="1.92"
              height=".5"
              rx=".1"
              fill="#ffffff"
            />
            <text y=".085" stroke="none">
              W {fmt(resizingRoom.w)}
            </text>
          </g>
          <path
            d={`M${resizingRoom.x + resizingRoom.w + 0.18} ${resizingRoom.y}H${resizingRoom.x + resizingRoom.w + 0.52}M${resizingRoom.x + resizingRoom.w + 0.18} ${resizingRoom.y + resizingRoom.h}H${resizingRoom.x + resizingRoom.w + 0.52}M${resizingRoom.x + resizingRoom.w + 0.4} ${resizingRoom.y}V${resizingRoom.y + resizingRoom.h}`}
            fill="none"
          />
          <g
            transform={`translate(${resizingRoom.x + resizingRoom.w + 0.4} ${resizingRoom.y + resizingRoom.h / 2}) rotate(-90)`}
          >
            <rect
              x="-.96"
              y="-.25"
              width="1.92"
              height=".5"
              rx=".1"
              fill="#ffffff"
            />
            <text y=".085" stroke="none">
              D {fmt(resizingRoom.h)}
            </text>
          </g>
        </g>
      )}
      {selection?.kind === "wall" &&
        shown.walls
          .filter((w) => w.id === selection.id && !w.geometryLocked)
          .map((wall) => (
            <g key={wall.id} data-editor-overlay="true">
              {([1, 2] as const).map((endpoint) => (
                <circle
                  key={endpoint}
                  data-wall-endpoint={endpoint}
                  cx={endpoint === 1 ? wall.x1 : wall.x2}
                  cy={endpoint === 1 ? wall.y1 : wall.y2}
                  r=".09"
                  fill="white"
                  stroke="#34795b"
                  strokeWidth=".025"
                  style={{ cursor: "crosshair" }}
                  onPointerDown={(e) => startWall(e, wall.id, endpoint)}
                />
              ))}
            </g>
          ))}
      <g
        pointerEvents="none"
        fontFamily="Manrope, sans-serif"
        textAnchor="middle"
      >
        {shown.rooms.map((r) => {
          const y = r.type === "Hallway" ? r.y + r.h / 2 : r.y + r.h * 0.78;
          const clear = roomInteriorDimensions(shown, r, shownRoomWalls);
          return (
            <g key={r.id} transform={`translate(${r.x + r.w / 2} ${y})`}>
              <rect
                x={-Math.min(r.w - 0.15, 2.7) / 2}
                y="-.22"
                width={Math.min(r.w - 0.15, 2.7)}
                height={r.type === "Hallway" ? 0.35 : 0.64}
                fill={r.color}
                opacity=".9"
                rx=".08"
              />
              <text fontSize=".18" fontWeight="650" fill="#575b50">
                {r.name}
              </text>
              {r.type !== "Hallway" && (
                <text y=".28" fontSize=".16" fontWeight="650" fill="#6b7167">
                  {(clear.area * (units === "ft" ? 10.7639 : 1)).toFixed(1)}{" "}
                  {units}²
                </text>
              )}
            </g>
          );
        })}
      </g>
      {dimensions && (
        <g
          data-plan-dimensions
          fill="#797f71"
          stroke="#a1a697"
          strokeWidth=".013"
          fontFamily="Manrope, sans-serif"
          fontSize=".2"
          fontWeight="700"
          textAnchor="middle"
        >
          <path
            d={`M0 -.3V-.85M${w} -.3V-.85M0 -.65H${w}M-.1 -.55L.1 -.75M${w - 0.1} -.55L${w + 0.1} -.75`}
          />
          <rect
            x={w / 2 - 0.82}
            y="-.86"
            width="1.64"
            height=".42"
            fill="#f5f5f0"
            stroke="none"
          />
          <text x={w / 2} y="-.57" stroke="none">
            {fmt(w)}
          </text>
          <path
            d={`M-.3 0H-.85M-.3 ${h}H-.85M-.65 0V${h}M-.75 -.1L-.55 .1M-.75 ${h - 0.1}L-.55 ${h + 0.1}`}
          />
          <g transform={`translate(-.66 ${h / 2}) rotate(-90)`}>
            <rect
              x="-.82"
              y="-.24"
              width="1.64"
              height=".42"
              fill="#f5f5f0"
              stroke="none"
            />
            <text y=".07" stroke="none">
              {fmt(h)}
            </text>
          </g>
          {shown.rooms
            .filter((r) => r.y + r.h >= h - 0.05)
            .map((r) => (
              <g key={r.id}>
                <path
                  d={`M${r.x} ${h + 0.25}V${h + 0.7}M${r.x + r.w} ${h + 0.25}V${h + 0.7}M${r.x} ${h + 0.5}H${r.x + r.w}`}
                />
                <rect
                  x={r.x + r.w / 2 - 0.82}
                  y={h + 0.27}
                  width="1.64"
                  height=".44"
                  stroke="none"
                  fill="#f5f5f0"
                />
                <text x={r.x + r.w / 2} y={h + 0.58} stroke="none">
                  {fmt(r.w)}
                </text>
              </g>
            ))}
        </g>
      )}
      {draft && (
        <g pointerEvents="none" data-editor-overlay="true">
          <rect
            x={Math.min(draft.x, draft.x2)}
            y={Math.min(draft.y, draft.y2)}
            width={Math.abs(draft.x2 - draft.x)}
            height={Math.abs(draft.y2 - draft.y)}
            fill={tool === "room" ? "#adc9b755" : "none"}
            stroke={tool === "room" ? "#34795b" : "none"}
            strokeWidth=".04"
          />
          {tool !== "room" && (
            <>
              <line
                x1={draft.x}
                y1={draft.y}
                x2={draft.x2}
                y2={draft.y2}
                stroke="#34795b"
                strokeWidth={tool === "wall" ? 0.15 : 0.03}
              />
              <text
                x={draft.x2}
                y={draft.y2 - 0.15}
                fontSize=".18"
                fill="#285e45"
              >
                {fmt(Math.hypot(draft.x2 - draft.x, draft.y2 - draft.y))}
              </text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}
