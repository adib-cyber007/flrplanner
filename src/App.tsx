import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReferenceControls from "./ReferenceControls";
import DimensionInput from "./DimensionInput";
import FloorSettings from "./FloorSettings";
import OpeningControls from "./OpeningControls";
import WallGeometryControls from "./WallGeometryControls";
import { editWall } from "../shared/wallEditing";
import { updateFloorSettings } from "../shared/heights";
import { createReference } from "../shared/reference";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Armchair,
  BookOpen,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  DoorOpen,
  Download,
  Expand,
  FileJson,
  FolderOpen,
  Grid2X2,
  Hand,
  House,
  Image,
  Layers,
  LayoutGrid,
  Leaf,
  Lightbulb,
  Lock,
  Maximize,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MousePointer2,
  MoveUpRight,
  Paintbrush,
  PanelLeftClose,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Wifi,
  X,
  AlertTriangle,
  LoaderCircle,
  HelpCircle,
  Mic,
  StopCircle,
} from "lucide-react";
import {
  catalog,
  colors,
  defaultBrief,
  DEFAULT_ROOM_WALL_THICKNESS,
  ROOM_WALL_THICKNESS_PRESETS,
  makeItem,
  makeRoom,
  ProjectSchema,
  BriefSchema,
  sampleProject,
  uid,
  type AIConfig,
  type Brief,
  type Floor,
  type Item,
  type Project,
  type Room,
  EditProposalSchema,
  type EditProposal,
  IntakeProposalSchema,
  type IntakeProposal,
  type Requirements,
} from "../shared/model";
import {
  applyOperations,
  designHash,
  proposeEdits,
  simpleEdit,
} from "../shared/agent";
import { readyToGenerate, requirementTopics } from "../shared/requirements";
import {
  applyIntake,
  nextIntakeTopic,
  proposeIntake,
} from "../shared/interview";
import IntakeProposalCard from "./IntakeProposalCard";
import { generateProject, validateFloor } from "../shared/planner";
import PlanCanvas, { type Selection, type Tool } from "./PlanCanvas";
import { Thumbnail } from "./Furniture";
import BriefWizard from "./BriefWizard";
import type { SceneHandle } from "./SceneView";
import { exportDXF, exportSchedule } from "../shared/export";
import {
  displayArea,
  displayLength,
  formatArea,
  formatLength,
  lengthFactor,
  type DisplayUnits,
} from "../shared/units";
import { explicitConstraints } from "../shared/intent";
import { ACTIVE, STORE, listProjects, persistProject } from "./storage";
import { useStudio } from "./useStudio";
import StudioHistory from "./StudioHistory";
import {
  moveRoom,
  snapOpening,
  geometryLockIssue,
  regenerationLockIssue,
} from "../shared/editing";
import { siteEnvelope } from "../shared/site";
import { roomInteriorDimensions, roomWallSegments } from "../shared/geometry";
import { programSummary } from "../shared/program";
const Scene3D = lazy(() => import("./SceneView"));
const UNITS = "forma-display-units-v1";
type Message = {
  role: "user" | "assistant";
  content: string;
  brief?: Brief;
  edit?: EditProposal;
  intake?: IntakeProposal;
};
function readProjects(): Project[] {
  try {
    return listProjects(localStorage);
  } catch {
    return [];
  }
}
function initialProject() {
  const projects = readProjects();
  let active: string | null = null;
  try {
    active = localStorage.getItem(ACTIVE);
  } catch {
    /* Use an in-memory project if browser storage is disabled. */
  }
  return (
    projects.find((p) => p.id === active) || projects[0] || sampleProject()
  );
}
function initialUnits(): DisplayUnits {
  try {
    return localStorage.getItem(UNITS) === "m" ? "m" : "ft";
  } catch {
    return "ft";
  }
}
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current!;
    const first = el.querySelector<HTMLElement>("button,input,select,textarea");
    first?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const all = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ),
        );
        const start = all[0],
          end = all.at(-1);
        if (e.shiftKey && document.activeElement === start) {
          e.preventDefault();
          end?.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault();
          start?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <span>{title}</span>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const sceneRef = useRef<SceneHandle>(null);
  const [project, setProject] = useState<Project>(initialProject);
  const [floorId, setFloorId] = useState("");
  const floor =
    project.floors.find((f) => f.id === floorId) || project.floors[0];
  const [past, setPast] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [section, setSection] = useState("Furnish");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState<"2D" | "3D">("2D");
  const [zoom, setZoom] = useState(1);
  const [resetView, setResetView] = useState(0);
  const [grid, setGrid] = useState(true);
  const [dimensions, setDimensions] = useState(true);
  const [units, setUnits] = useState<DisplayUnits>(initialUnits);
  const unitFactor = lengthFactor(units);
  const [rightTab, setRightTab] = useState("assistant");
  const [mobileLeft, setMobileLeft] = useState(false);
  const [mobileRight, setMobileRight] = useState(false);
  const [modal, setModal] = useState<
    | "brief"
    | "constraints"
    | "floor-settings"
    | "settings"
    | "projects"
    | "export"
    | "checks"
    | "help"
    | null
  >(null);
  const [proposedBrief, setProposedBrief] = useState<Brief | null>(null);
  const closeModal = useCallback(() => {
    setModal(null);
    setProposedBrief(null);
  }, []);
  const saveBriefDraft = useCallback(
    (brief: Brief) =>
      setProject((p) => ({ ...p, brief, updatedAt: new Date().toISOString() })),
    [],
  );
  const [toast, setToast] = useState("");
  const reference = floor.reference;
  const referenceFloor = useRef(floor.id);
  referenceFloor.current = floor.id;
  const fileRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<AIConfig>({
    provider: "builtin",
    model: "",
    baseUrl: "",
    apiKey: "",
  });
  const [connectionStatus, setConnectionStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const [messages, setMessages] = useState<Message[]>(
    () => project.conversation || [],
  );
  const [prompt, setPrompt] = useState("");
  const [promptMode, setPromptMode] = useState<"edit" | "layout" | "intake">(
    "edit",
  );
  const [intakeTopic, setIntakeTopic] = useState<
    Requirements["responses"][number]["key"] | "auto"
  >("auto");
  const [intakePriority, setIntakePriority] = useState<"preference" | "must">(
    "preference",
  );
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [applyingEdit, setApplyingEdit] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [variant, setVariant] = useState(0);
  const [listening, setListening] = useState(false);
  const speechRef = useRef<{ stop: () => void } | null>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const configChosen = useRef(false);
  const aiRequest = useRef<AbortController | null>(null);
  const activateProject = useCallback((p: Project) => {
    aiRequest.current?.abort();
    aiRequest.current = null;
    setThinking(false);
    setProject(p);
    setFloorId(p.floors[0].id);
    setPast([]);
    setFuture([]);
    setSelection(null);
    setMessages(p.conversation || []);
    setZoom(1);
    setResetView((x) => x + 1);
  }, []);
  const studio = useStudio(project, activateProject);
  const saved = studio.saved,
    saveError = studio.error;
  useEffect(() => {
    try {
      localStorage.setItem(UNITS, units);
    } catch {
      /* The in-memory preference still works when browser storage is disabled. */
    }
  }, [units]);
  useEffect(() => {
    if (modal === "projects")
      studio.refresh().catch((e) => setToast((e as Error).message));
  }, [modal, studio.refresh]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/local-models", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!configChosen.current && data.models?.length) {
          const model =
            data.models.find((m: string) => m === "qwen3:4b") || data.models[0];
          setConfig({
            provider: "ollama",
            model,
            baseUrl: data.baseUrl,
            apiKey: "",
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const notify = (text: string) => setToast(text);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setProject((p) => ({ ...p, conversation: messages }));
  }, [messages]);
  useEffect(() => {
    if (messages.length || thinking)
      messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);
  function commit(next: Project) {
    const checked = ProjectSchema.safeParse(next);
    if (!checked.success) {
      notify(
        "This edit exceeds the supported dimensions or project limits. Your previous design is preserved.",
      );
      return false;
    }
    setPast((p) => [...p.slice(-49), projectRef.current]);
    setFuture([]);
    setProject({ ...next, updatedAt: new Date().toISOString() });
    return true;
  }
  function changeFloor(next: Floor) {
    const lockIssue = geometryLockIssue(floor, next);
    if (lockIssue) {
      notify(lockIssue);
      return false;
    }
    return commit({
      ...project,
      floors: project.floors.map((f) => (f.id === floor.id ? next : f)),
    });
  }
  function undo() {
    if (!past.length) return;
    setFuture((f) => [project, ...f]);
    setProject({ ...past[past.length - 1], conversation: messages });
    setPast((p) => p.slice(0, -1));
    setSelection(null);
  }
  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, project]);
    setProject({ ...future[0], conversation: messages });
    setFuture((f) => f.slice(1));
    setSelection(null);
  }
  function removeSelected() {
    if (!selection) return;
    if (
      !changeFloor({
        ...floor,
        rooms: floor.rooms.filter((r) => r.id !== selection.id),
        items: floor.items.filter((i) => i.id !== selection.id),
        walls: floor.walls.filter((w) => w.id !== selection.id),
      })
    )
      return;
    setSelection(null);
    notify("Removed from this floor. Undo is available.");
  }
  function select(s: Selection) {
    setSelection(s);
    if (s) setRightTab("properties");
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        ) ||
        modal
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        studio
          .saveNow(project)
          .then(() => notify("Project saved in your local studio."))
          .catch((e) => notify((e as Error).message));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setSelection(null);
        setTool("select");
      } else if (e.key.toLowerCase() === "v") setTool("select");
      else if (e.key.toLowerCase() === "h") setTool("hand");
      else if (e.key.toLowerCase() === "r") setTool("room");
      else if (e.key.toLowerCase() === "m") setTool("measure");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const selectedRoom =
    selection?.kind === "room"
      ? floor.rooms.find((r) => r.id === selection.id)
      : undefined;
  const selectedItem =
    selection?.kind === "item"
      ? floor.items.find((i) => i.id === selection.id)
      : undefined;
  const selectedWall =
    selection?.kind === "wall"
      ? floor.walls.find((w) => w.id === selection.id)
      : undefined;
  const checks = validateFloor(
    floor,
    project.brief,
    floor.programIndex ?? project.floors.indexOf(floor),
    units,
  );
  const errors = checks.filter((c) => c.level === "error").length;
  const roomWalls = roomWallSegments(floor);
  const footprintArea = floor.rooms.reduce((s, r) => s + r.w * r.h, 0);
  const selectedRoomInterior = selectedRoom
    ? roomInteriorDimensions(floor, selectedRoom, roomWalls)
    : undefined;
  const updateRoom = (patch: Partial<Room>) => {
    if (selectedRoom) {
      const next = { ...selectedRoom, ...patch };
      if (
        !Number.isFinite(next.w) ||
        !Number.isFinite(next.h) ||
        next.w < 0.5 ||
        next.h < 0.5
      )
        return;
      changeFloor({
        ...moveRoom(floor, selectedRoom.id, next.x, next.y),
        rooms: floor.rooms.map((r) => (r.id === selectedRoom.id ? next : r)),
      });
    }
  };
  const updateItem = (patch: Partial<Item>) => {
    if (selectedItem) {
      const next = { ...selectedItem, ...patch };
      if (
        ![next.x, next.y, next.w, next.h, next.rotation].every(
          Number.isFinite,
        ) ||
        next.w < 0.1 ||
        next.h < 0.1
      )
        return;
      changeFloor({
        ...floor,
        items: floor.items.map((i) => (i.id === selectedItem.id ? next : i)),
      });
    }
  };
  function addItem(type: Item["type"]) {
    const room =
      selectedRoom ||
      floor.rooms.find((r) => r.type === "Living room") ||
      floor.rooms[0];
    const item = snapOpening(
      floor,
      makeItem(type, room ? room.x + 0.5 : 1, room ? room.y + 0.5 : 1),
      1,
    );
    changeFloor({ ...floor, items: [...floor.items, item] });
    select({ kind: "item", id: item.id });
    setTool("select");
    notify(`${item.name} added. Drag it into place.`);
  }
  function addFloor() {
    if (project.floors.length >= 8) {
      notify("A project supports up to 8 floors.");
      return;
    }
    const f: Floor = {
      id: uid(),
      name: `Floor ${project.floors.length + 1}`,
      programIndex: project.floors.length,
      rooms: [],
      items: [],
      walls: [],
    };
    commit({ ...project, floors: [...project.floors, f] });
    setFloorId(f.id);
    setSelection(null);
    setSection("Build");
    notify("New floor added. Draw a room to start.");
  }
  function generate(brief: Brief) {
    const lockIssue = regenerationLockIssue(project.floors);
    if (lockIssue) throw Error(lockIssue);
    if (!readyToGenerate(brief)) {
      setProposedBrief(brief);
      setModal("brief");
      notify(
        "Complete Requirements & constraints and review the assumptions before generation.",
      );
      return;
    }
    const next = generateProject(brief, variant);
    next.floors = next.floors.map((f, i) => ({
      ...f,
      reference: project.floors.find(
        (old, index) => (old.programIndex ?? index) === (f.programIndex ?? i),
      )?.reference,
    }));
    setVariant((v) => v + 1);
    commit({ ...next, id: project.id, name: project.name });
    setFloorId(next.floors[0].id);
    setSelection(null);
    setView("2D");
    setZoom(1);
    setModal(null);
    setProposedBrief(null);
    setRightTab("assistant");
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content: `Your layout is ready. ${Array.from({ length: brief.floors }, (_, i) => `Floor ${i + 1}: ${programSummary(brief, i)}.`).join(" ")} The rooms fit inside the buildable area. Open Design checks to review remaining preferences and coordinate stairs between floors.`,
      },
    ]);
    notify("New layout created. Your previous design is available with Undo.");
  }
  function applyBrief(brief: Brief) {
    setProposedBrief({
      ...brief,
      requirements: project.brief.requirements
        ? {
            ...project.brief.requirements,
            reviewKey: undefined,
            reviewedAt: undefined,
            coreConfirmed: false,
            assumptionsAccepted: false,
          }
        : undefined,
    });
    setModal("brief");
  }
  async function applyEdit(edit: EditProposal, index: number) {
    if (applyingEdit || edit.status !== "pending") return;
    setApplyingEdit(true);
    try {
      const snapshot = projectRef.current;
      const target = snapshot.floors.find((f) => f.id === edit.floorId);
      if (
        !target ||
        (await designHash(target, snapshot.brief)) !== edit.baseHash ||
        projectRef.current !== snapshot
      )
        throw Error(
          "The plan or requirements changed after this proposal. Send your request again so the edit uses the latest design.",
        );
      const result = applyOperations(
        target,
        edit.operations,
        snapshot.brief,
        units,
      );
      commit({
        ...snapshot,
        floors: snapshot.floors.map((f) =>
          f.id === target.id ? result.floor : f,
        ),
      });
      setMessages((m) =>
        m.map((message, i) =>
          i === index
            ? { ...message, edit: { ...edit, status: "applied" } }
            : message,
        ),
      );
      setFloorId(target.id);
      setSelection(null);
      notify("Changes applied. Undo restores the previous design.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setApplyingEdit(false);
    }
  }
  function saveIntake(proposal: IntakeProposal, index: number) {
    try {
      const snapshot = projectRef.current;
      const brief = applyIntake(snapshot.brief, proposal);
      commit({ ...snapshot, brief, updatedAt: new Date().toISOString() });
      const next = nextIntakeTopic(brief);
      setIntakeTopic(next?.key || "auto");
      setIntakePriority("preference");
      setMessages((m) => [
        ...m.map((message, i) =>
          i === index && message.intake
            ? {
                ...message,
                intake: { ...message.intake, status: "applied" as const },
              }
            : message,
        ),
        {
          role: "assistant",
          content: next
            ? `Saved. Next: ${next.question} ${next.help}`
            : "All 12 topics have a response. Open Requirements & constraints to check the core dimensions, resolve non-negotiables and review assumptions before building. Numeric values mentioned in these notes still need to be entered in the structured brief or proposed through New layout.",
        },
      ]);
      notify("Answers saved. Your floor geometry is unchanged.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function sendMessage(
    text = prompt,
    mode = promptMode,
    answerStatus: "provided" | "unknown" | "not-applicable" = "provided",
    fromRequirements = false,
  ) {
    if (!text.trim() || thinking) return;
    const request = new AbortController();
    aiRequest.current = request;
    setPrompt("");
    setRightTab("assistant");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setThinking(true);
    try {
      if (mode === "intake") {
        let intake: IntakeProposal;
        if (intakeTopic !== "auto") {
          intake = proposeIntake(project.brief, text, [
            {
              key: intakeTopic,
              status: answerStatus,
              details: text,
              priority: intakePriority,
            },
          ]);
        } else {
          if (config.provider === "builtin")
            throw Error(
              "Select a topic to answer directly, or connect a local/API model to organize a message across multiple topics.",
            );
          const response = await fetch("/api/intake", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config,
              prompt: text,
              brief: project.brief,
            }),
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(95000),
            ]),
          });
          const data = await response.json();
          if (!response.ok)
            throw Error(data.error || "Could not organize the answer.");
          intake = IntakeProposalSchema.parse(data.intake);
        }
        if (request.signal.aborted) return;
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "Review how your words will be recorded. Saving these answers updates the requirement notes; dimensions and other structured inputs still need review before any layout is built.",
            intake,
          },
        ]);
      } else if (mode === "edit") {
        const quick = simpleEdit(text, floor, selection);
        let reply: string, edit: EditProposal | undefined;
        if (quick.operations) {
          edit = await proposeEdits(
            floor,
            project.brief,
            quick.operations,
            units,
          );
          reply =
            "Review these changes to your current floor. Apply them when ready; Undo will keep your previous design.";
        } else if (quick.reply) reply = quick.reply;
        else if (config.provider === "builtin")
          reply =
            "For a more flexible request, choose Local AI or an API in Settings. Quick edits work here too: ‘Remove the dining table’, ‘Make the primary bedroom 16 ft wide’, or select an object and say ‘Move it 3 ft left’. To redo the entire design, choose New layout and review your requirements.";
        else {
          const response = await fetch("/api/edit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config,
              prompt: text,
              brief: project.brief,
              floor: { ...floor, reference: undefined },
              selection,
              displayUnits: units,
            }),
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(95000),
            ]),
          });
          const data = await response.json();
          if (!response.ok)
            throw Error(data.error || "Could not propose the edit.");
          reply = data.reply;
          if (data.edit) edit = EditProposalSchema.parse(data.edit);
        }
        if (request.signal.aborted) return;
        setMessages((m) => [
          ...m,
          { role: "assistant", content: reply, ...(edit ? { edit } : {}) },
        ]);
      } else if (config.provider === "builtin") {
        const b = {
          ...structuredClone(project.brief),
          ...explicitConstraints(text, project.brief),
        };
        const lower = text.toLowerCase();
        let changed =
          Object.keys(explicitConstraints(text, project.brief)).length > 0;
        for (const style of [
          "Japandi",
          "Contemporary",
          "Minimal",
          "Traditional",
          "Industrial",
          "Coastal",
        ] as const)
          if (lower.includes(style.toLowerCase())) {
            b.style = style;
            changed = true;
          }
        b.notes = (b.notes + "\n" + text).slice(-12000);
        if (!BriefSchema.safeParse(b).success)
          throw Error(
            "Those room counts or dimensions are outside the supported range. Use Your brief to adjust them; your exact message is preserved in this conversation.",
          );
        commit({ ...project, brief: { ...project.brief, notes: b.notes } });
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: changed
              ? `I’ve prepared a brief with ${b.bedrooms} bedrooms, ${b.bathrooms} bathroom${b.bathrooms > 1 ? "s" : ""}, and a ${displayLength(b.width, units, 1)} × ${displayLength(b.depth, units, 1)} ${units} plot. Your request is also saved in the design notes. Create a layout to try it; Undo keeps your previous design accessible.`
              : `I’ve saved this in your design notes. The built-in planner understands room counts, plot dimensions (for example, “40 × 32 ft”), an office, and mobility requests. For a full conversation about your preferences, connect a local model or an API in AI settings. You can also fill out Your brief.`,
            ...(changed ? { brief: b } : {}),
          },
        ]);
      } else {
        const response = await fetch("/api/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config,
            prompt: text,
            brief: project.brief,
            history: messages
              .slice(-8)
              .map(({ role, content }) => ({ role, content })),
            fromRequirements,
          }),
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(95000)]),
        });
        const data = await response.json();
        if (request.signal.aborted) return;
        if (!response.ok) throw Error(data.error || "The AI request failed.");
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.reply,
            ...(data.changed ? { brief: data.brief } : {}),
          },
        ]);
      }
    } catch (e) {
      if (request.signal.aborted) return;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Could not complete the request. " + (e as Error).message,
        },
      ]);
    } finally {
      if (aiRequest.current === request) setThinking(false);
    }
  }
  async function testConnection() {
    setChecking(true);
    setConnectionStatus("");
    try {
      const r = await fetch("/api/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setConnectionStatus(
        data.models.length
          ? `Connected. Available models: ${data.models.slice(0, 8).join(", ")}`
          : "Connected. No models found. Install or enable a model with this provider.",
      );
      if (!config.model && data.models[0])
        setConfig((c) => ({ ...c, model: data.models[0] }));
    } catch (e) {
      setConnectionStatus((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  function startVoice() {
    if (listening) {
      speechRef.current?.stop();
      setListening(false);
      return;
    }
    const Speech =
      (
        window as unknown as {
          SpeechRecognition?: new () => any;
          webkitSpeechRecognition?: new () => any;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;
    if (!Speech) {
      notify(
        "Voice input is not available in this browser. Type your ideas instead.",
      );
      return;
    }
    const speech = new Speech();
    speech.lang = navigator.language;
    speech.interimResults = false;
    speech.onresult = (e: any) => {
      setPrompt((p) => p + (p ? " " : "") + e.results[0][0].transcript);
      setListening(false);
    };
    speech.onerror = () => {
      setListening(false);
      notify(
        "Microphone unavailable. Check browser permissions or type your brief.",
      );
    };
    speech.onend = () => setListening(false);
    speechRef.current = speech;
    speech.start();
    setListening(true);
  }
  async function exportPlan(
    format: "json" | "svg" | "png" | "print" | "dxf" | "csv" | "glb",
  ) {
    const name = project.name.replace(/[^a-z0-9-]/gi, "_");
    if (format === "json") {
      download(
        name + ".forma.json",
        JSON.stringify(project, null, 2),
        "application/json",
      );
      notify("Editable project exported.");
      return;
    }
    if (format === "dxf") {
      download(name + ".dxf", exportDXF(floor), "application/dxf");
      notify("CAD floor plan exported in meters.");
      return;
    }
    if (format === "csv") {
      download(
        name + "-schedule.csv",
        exportSchedule(project),
        "text/csv;charset=utf-8",
      );
      notify("Room and object schedule exported.");
      return;
    }
    if (format === "glb") {
      try {
        if (!sceneRef.current)
          throw Error("Switch to 3D view to export the model.");
        download(
          name + ".glb",
          await sceneRef.current.exportGLB(),
          "model/gltf-binary",
        );
        notify("3D model exported.");
      } catch (e) {
        notify((e as Error).message);
      }
      return;
    }
    if (format === "png" && view === "3D") {
      try {
        if (!sceneRef.current) throw Error("Wait for the 3D view to load.");
        download(
          name + "-3d.png",
          await sceneRef.current.exportPNG(),
          "image/png",
        );
        notify("3D image exported.");
      } catch (e) {
        notify((e as Error).message);
      }
      return;
    }
    const svg = document.getElementById(
      "floor-plan",
    ) as unknown as SVGSVGElement | null;
    if (!svg) {
      notify("Switch to 2D to export a measured plan.");
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone
      .querySelectorAll("[data-editor-overlay]")
      .forEach((node) => node.remove());
    const { width: w, depth: h } = siteEnvelope(project.brief);
    if (w <= 0 || h <= 0) {
      notify(
        "The setbacks leave no buildable footprint. Correct the site constraints before exporting.",
      );
      return;
    }
    clone.setAttribute("viewBox", `-1.5 -1.5 ${w + 3} ${h + 3}`);
    clone.setAttribute("width", "1800");
    clone.setAttribute(
      "height",
      String(Math.round((1800 * (h + 3)) / (w + 3))),
    );
    clone.setAttribute("style", "background:#f5f5f0");
    const source = new XMLSerializer().serializeToString(clone);
    if (format === "svg") {
      download(name + ".svg", source, "image/svg+xml");
      notify("Vector floor plan exported.");
      return;
    }
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#f5f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      if (format === "png")
        canvas.toBlob((b) => {
          if (b) download(name + ".png", b, "image/png");
        });
      else {
        const win = window.open("", "_blank");
        if (!win) {
          notify("Allow pop-ups to open the print preview.");
          return;
        }
        win.document.title = project.name;
        const heading = win.document.createElement("h2");
        heading.textContent = project.name;
        const picture = win.document.createElement("img");
        picture.src = canvas.toDataURL();
        picture.style.width = "100%";
        const note = win.document.createElement("p");
        note.textContent =
          "Conceptual floor plan · " +
          floor.name +
          " · Not a construction drawing";
        win.document.body.append(heading, picture, note);
        picture.onload = () => win.print();
      }
      notify(
        format === "png"
          ? "Floor plan image exported."
          : "Print preview opened. Choose Save as PDF to save.",
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      notify("Image export failed. Try exporting SVG instead.");
    };
    img.src = url;
  }
  async function loadProject(p: Project, fromDisk = false) {
    try {
      if (studio.online)
        await studio.saveNow({ ...project, conversation: messages });
      else persistProject(localStorage, { ...project, conversation: messages });
      const next =
        fromDisk && studio.online ? await studio.client.open(p.id) : p;
      activateProject(next);
      setModal(null);
      notify("Project opened.");
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    }
  }
  async function saveCopy() {
    const copy = {
      ...project,
      id: uid(),
      name: project.name.slice(0, 90) + " · Copy",
      conversation: messages,
    };
    try {
      if (studio.online) {
        await studio.client.save(copy);
        // Replace the stale cache of the original only after the separate copy is safe.
        try {
          persistProject(localStorage, await studio.client.open(project.id));
        } catch {
          /* Keep the original cache if disk is unavailable. */
        }
      }
      activateProject(copy);
      notify("Your changes are saved as a separate project.");
      await studio.refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="app-shell">
      {!studio.ready && (
        <div className="studio-loading" role="status">
          <LoaderCircle size={24} />
          <strong>Opening your local studio…</strong>
          <span>Loading projects and checking browser drafts.</span>
        </div>
      )}
      <header className="topbar" inert={!!modal || !studio.ready}>
        <button
          className="brand"
          onClick={() => setModal("projects")}
          aria-label="Forma projects"
        >
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          <span>
            forma<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="project-heading">
          <span className="header-separator" />
          <div>
            <div className="project-title-row">
              <input
                aria-label="Project name"
                value={project.name}
                maxLength={100}
                onChange={(e) => commit({ ...project, name: e.target.value })}
              />
              <ChevronDown size={14} />
            </div>
            <button
              className={`save-status ${saveError ? "error-text" : ""}`}
              title={saveError || studio.directory || "Opening local studio"}
              onClick={() => setModal("projects")}
            >
              {saveError ? (
                <AlertTriangle size={11} />
              ) : saved ? (
                <CheckCheck size={12} />
              ) : (
                <LoaderCircle size={11} />
              )}{" "}
              {saveError
                ? studio.conflict
                  ? "Newer version found · save a copy"
                  : studio.backupAvailable
                    ? "Browser backup · check studio"
                    : "Save failed · export a backup"
                : saved
                  ? "All changes saved to this computer"
                  : "Saving your changes…"}
            </button>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="text-button brief-top"
            onClick={() => setModal("brief")}
          >
            <ClipboardList size={16} />
            Requirements & constraints
          </button>
          <button
            className="outline export-button"
            onClick={() => setModal("export")}
          >
            <ArrowDownToLine size={16} />
            Export
            <ChevronDown size={13} />
          </button>
          <button
            className="primary"
            onClick={() => {
              setRightTab("assistant");
              setMobileRight(true);
              setTimeout(() => promptRef.current?.focus(), 50);
            }}
          >
            <Sparkles size={16} />
            <span>AI prompts</span>
          </button>
          <button
            className="avatar"
            title="My local projects"
            onClick={() => setModal("projects")}
          >
            Y
          </button>
        </div>
      </header>
      <main className="editor-layout" inert={!!modal || !studio.ready}>
        <nav className="nav-rail" aria-label="Workspace navigation">
          <div className="rail-main">
            {[
              { label: "Projects", icon: FolderOpen },
              { label: "Build", icon: House },
              { label: "Furnish", icon: Armchair },
              { label: "Materials", icon: Paintbrush },
              { label: "Layers", icon: Layers },
            ].map(({ label, icon: Icon }) => (
              <button
                key={label}
                title={label}
                className={section === label ? "active" : ""}
                onClick={() => {
                  if (label === "Projects") {
                    setModal("projects");
                    return;
                  }
                  setSection(label);
                  setMobileLeft(true);
                  setQuery("");
                }}
              >
                <Icon size={21} strokeWidth={1.65} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="rail-bottom">
            <button title="AI settings" onClick={() => setModal("settings")}>
              <Settings2 size={21} />
              <span>Settings</span>
            </button>
            <button title="Help and shortcuts" onClick={() => setModal("help")}>
              <HelpCircle size={21} />
              <span>Help</span>
            </button>
          </div>
        </nav>
        <aside className={`library ${mobileLeft ? "mobile-open" : ""}`}>
          <div className="panel-title">
            <div>
              <h2>
                {section === "Furnish"
                  ? "Make it feel like home"
                  : section === "Build"
                    ? "Shape your space"
                    : section === "Materials"
                      ? "The finishing touches"
                      : "Your floor, organized"}
              </h2>
              <p>
                {section === "Furnish"
                  ? "Good spaces start with the little things."
                  : section === "Build"
                    ? "Every great space starts with a plan."
                    : section === "Materials"
                      ? "Natural textures. A personal touch."
                      : "Select an element to make it yours."}
              </p>
            </div>
            <IconButton
              label="Close library"
              className="mobile-only"
              onClick={() => setMobileLeft(false)}
            >
              <X size={18} />
            </IconButton>
          </div>
          {section === "Furnish" && (
            <>
              <div className="search-field">
                <Search size={16} />
                <input
                  aria-label="Search furniture"
                  placeholder="Search furniture, decor…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>⌕</span>
              </div>
              <div className="catalog-tabs">
                <button className="active" onClick={() => setCategory("All")}>
                  Object library
                </button>
                <button
                  onClick={() => {
                    setSection("Build");
                    setCategory("Structure");
                  }}
                >
                  Structure
                </button>
              </div>
              <div className="category-chips">
                {[
                  "All",
                  "Living",
                  "Bedroom",
                  "Kitchen",
                  "Dining",
                  "Bathroom",
                  "Office",
                  "Decor",
                ].map((c) => (
                  <button
                    key={c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="catalog-caption">
                <strong>
                  {category === "All"
                    ? "A few favorites"
                    : category + " essentials"}
                </strong>
                <span>
                  {
                    catalog.filter(
                      (c) =>
                        (category === "All" || c.category === category) &&
                        c.name.toLowerCase().includes(query.toLowerCase()),
                    ).length
                  }{" "}
                  objects
                </span>
              </div>
              <div className="catalog-grid">
                {catalog
                  .filter(
                    (c) =>
                      (category === "All" || c.category === category) &&
                      c.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((c) => (
                    <button
                      className="catalog-card"
                      key={c.type}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("forma-item", c.type)
                      }
                      onClick={() => addItem(c.type)}
                      title={`Add ${c.name}`}
                    >
                      <div className="catalog-image">
                        <Thumbnail type={c.type} color={c.color} />
                        <span className="add-object">
                          <Plus size={13} />
                        </span>
                      </div>
                      <span className="object-name">{c.name}</span>
                      <span className="object-size">
                        {displayLength(c.w, units, 1)} ×{" "}
                        {displayLength(c.h, units, 1)} {units}
                      </span>
                    </button>
                  ))}
              </div>
              {catalog.filter(
                (c) =>
                  (category === "All" || c.category === category) &&
                  c.name.toLowerCase().includes(query.toLowerCase()),
              ).length === 0 && (
                <div className="empty-state">
                  <Search size={24} />
                  <p>No matching objects.</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery("");
                      setCategory("All");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
              <div className="library-tip">
                <MousePointer2 size={15} />
                <span>
                  Drag an object onto your plan.
                  <br />
                  Or click to add it, then move it.
                </span>
              </div>
            </>
          )}
          {section === "Build" && (
            <div className="panel-content">
              <label className="block-label">Start with the structure</label>
              <div className="build-tools">
                {[
                  {
                    t: "room" as Tool,
                    icon: Square,
                    name: "Draw a room",
                    desc: "Drag to set width and depth",
                  },
                  {
                    t: "wall" as Tool,
                    icon: Ruler,
                    name: "Draw a wall",
                    desc: "Connect two points on the plan",
                  },
                  {
                    t: "measure" as Tool,
                    icon: Expand,
                    name: "Measure",
                    desc: "Check a distance on the canvas",
                  },
                ].map(({ t, icon: Icon, name, desc }) => (
                  <button
                    className={tool === t ? "selected" : ""}
                    key={t}
                    onClick={() => {
                      setTool(t);
                      setView("2D");
                      setMobileLeft(false);
                    }}
                  >
                    <Icon size={22} />
                    <span>
                      <strong>{name}</strong>
                      <small>{desc}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
              <label className="block-label">Add a room</label>
              <div className="room-list">
                {[
                  "Living room",
                  "Bedroom",
                  "Kitchen",
                  "Bathroom",
                  "Dining room",
                  "Office",
                  "Balcony",
                  "Utility",
                ].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      const r = makeRoom(t as Room["type"], 1, 1, 4, 3);
                      changeFloor({ ...floor, rooms: [...floor.rooms, r] });
                      select({ kind: "room", id: r.id });
                      setTool("select");
                      notify(
                        "Room added. Move it into position and check for overlaps.",
                      );
                    }}
                  >
                    <span
                      className="room-color"
                      style={{ background: colors[t] }}
                    />
                    {t}
                    <Plus size={14} />
                  </button>
                ))}
              </div>
              <label className="block-label">Doors, windows & stairs</label>
              <div className="catalog-grid">
                {catalog
                  .filter((c) => c.category === "Structure")
                  .map((c) => (
                    <button
                      className="catalog-card"
                      key={c.type}
                      onClick={() => addItem(c.type)}
                    >
                      <div className="catalog-image">
                        <Thumbnail type={c.type} />
                      </div>
                      <span className="object-name">{c.name}</span>
                    </button>
                  ))}
              </div>
              <button
                className="outline full-width"
                onClick={() => imageRef.current?.click()}
              >
                <Upload size={16} />
                Import a reference image
              </button>
              {reference && (
                <ReferenceControls
                  key={floor.id}
                  reference={reference}
                  units={units}
                  onChange={(value) =>
                    changeFloor({ ...floor, reference: value })
                  }
                />
              )}
              <p className="fine-print">
                PNG, JPEG or WebP, up to 5 MB. Images and placement are saved
                per floor and included in project backups. Trace with room and
                wall tools; automatic image recognition is not included. Images
                are not sent to the AI text model.
              </p>
            </div>
          )}
          {section === "Materials" && (
            <div className="panel-content">
              <div className="info-box">
                {selectedRoom
                  ? `Choose a finish for ${selectedRoom.name}.`
                  : "Select a room in your plan, then choose a floor finish."}
              </div>
              <label className="block-label">Floor finishes</label>
              <div className="materials-grid">
                {[
                  { name: "Natural oak", material: "oak", color: "#ece4d7" },
                  { name: "Smoked oak", material: "oak", color: "#b9aa93" },
                  {
                    name: "Soft limestone",
                    material: "stone",
                    color: "#dedcd0",
                  },
                  { name: "Sage tile", material: "tile", color: "#dce5d8" },
                  { name: "Porcelain", material: "tile", color: "#eeeee9" },
                  {
                    name: "Warm concrete",
                    material: "plain",
                    color: "#c8c7bf",
                  },
                ].map((m) => (
                  <button
                    key={m.name}
                    disabled={!selectedRoom}
                    onClick={() =>
                      updateRoom({
                        material: m.material as Room["material"],
                        color: m.color,
                      })
                    }
                  >
                    <span
                      className={`material-sample material-${m.material}`}
                      style={{ backgroundColor: m.color }}
                    />
                    <strong>{m.name}</strong>
                  </button>
                ))}
              </div>
              <p className="fine-print">
                Floor finishes appear as color and line patterns in 2D, and
                color in the 3D concept model.
              </p>
            </div>
          )}
          {section === "Layers" && (
            <div className="panel-content">
              <label className="block-label">
                Rooms <span>{floor.rooms.length}</span>
              </label>
              <div className="room-list">
                {floor.rooms.map((r) => (
                  <button
                    key={r.id}
                    className={selection?.id === r.id ? "selected" : ""}
                    onClick={() => select({ kind: "room", id: r.id })}
                  >
                    <span
                      className="room-color"
                      style={{ background: r.color }}
                    />
                    {r.name}
                    {r.geometryLocked && (
                      <Lock size={12} aria-label="Geometry locked" />
                    )}
                    <span title="Inside clear area">
                      {formatArea(
                        roomInteriorDimensions(floor, r, roomWalls).area,
                        units,
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <label className="block-label">
                Objects <span>{floor.items.length}</span>
              </label>
              <div className="room-list">
                {floor.items.map((i) => (
                  <button
                    key={i.id}
                    className={selection?.id === i.id ? "selected" : ""}
                    onClick={() => select({ kind: "item", id: i.id })}
                  >
                    <Box size={14} />
                    {i.name}
                    {i.locked && <Lock size={12} />}
                  </button>
                ))}
              </div>
              <label className="block-label">
                Custom walls <span>{floor.walls.length}</span>
              </label>
              <div className="room-list">
                {floor.walls.map((w, i) => (
                  <button
                    key={w.id}
                    onClick={() => select({ kind: "wall", id: w.id })}
                  >
                    <Ruler size={14} />
                    {w.name || `Wall ${i + 1}`}
                    {w.geometryLocked && (
                      <Lock size={12} aria-label="Geometry locked" />
                    )}
                    <span>
                      {formatLength(
                        Math.hypot(w.x2 - w.x1, w.y2 - w.y1),
                        units,
                        1,
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
        <section className="workspace">
          <div className="workspace-toolbar">
            <div className="toolbar-group">
              <IconButton
                label="Undo (Ctrl+Z)"
                onClick={undo}
                disabled={!past.length}
              >
                <Undo2 size={18} />
              </IconButton>
              <IconButton
                label="Redo (Ctrl+Shift+Z)"
                onClick={redo}
                disabled={!future.length}
              >
                <Redo2 size={18} />
              </IconButton>
              <span className="toolbar-divider" />
              <IconButton
                label="Select (V)"
                onClick={() => setTool("select")}
                active={tool === "select"}
              >
                <MousePointer2 size={17} />
              </IconButton>
              <IconButton
                label="Pan (H)"
                onClick={() => setTool("hand")}
                active={tool === "hand"}
              >
                <Hand size={18} />
              </IconButton>
              <IconButton
                label="Draw room (R)"
                onClick={() => {
                  setTool("room");
                  setView("2D");
                }}
                active={tool === "room"}
              >
                <Square size={18} />
              </IconButton>
              <IconButton
                label="Measure (M)"
                onClick={() => {
                  setTool("measure");
                  setView("2D");
                }}
                active={tool === "measure"}
              >
                <Ruler size={18} />
              </IconButton>
            </div>
            <div className="view-switch">
              <button
                className={view === "2D" ? "active" : ""}
                onClick={() => setView("2D")}
              >
                2D plan
              </button>
              <button
                className={view === "3D" ? "active" : ""}
                onClick={() => setView("3D")}
              >
                <Box size={14} />
                3D view
              </button>
            </div>
            <div className="toolbar-group display-tools">
              <IconButton
                label="Toggle grid"
                onClick={() => setGrid((x) => !x)}
                active={grid}
              >
                <Grid2X2 size={17} />
              </IconButton>
              <IconButton
                label="Toggle dimensions"
                onClick={() => setDimensions((x) => !x)}
                active={dimensions}
              >
                <Ruler size={17} />
              </IconButton>
            </div>
          </div>
          <div className="canvas-area">
            <div className="canvas-project-meta">
              <span className="live-dot" /> {floor.name}
              <span className="dot-separator">/</span>
              <span>{project.brief.style} concept</span>
            </div>
            <div className="compass">
              <span>N</span>
              <svg viewBox="0 0 30 35">
                <path
                  d="M15 2L24 29L15 23L6 29Z"
                  fill="none"
                  stroke="#7d8877"
                  strokeWidth="1.2"
                />
                <path d="M15 2V23L6 29Z" fill="#7d8877" />
              </svg>
            </div>
            {view === "2D" ? (
              <PlanCanvas
                project={project}
                floor={floor}
                tool={tool}
                selection={selection}
                onSelect={select}
                onChange={changeFloor}
                zoom={zoom}
                grid={grid}
                dimensions={dimensions}
                units={units}
                resetView={resetView}
                onNotice={notify}
              />
            ) : (
              <Suspense
                fallback={
                  <div className="canvas-loading">
                    <LoaderCircle className="spin" />
                    Building your 3D view…
                  </div>
                }
              >
                <Scene3D floor={floor} onSelect={select} ref={sceneRef} />
              </Suspense>
            )}
            {floor.rooms.length === 0 && view === "2D" && (
              <div className="canvas-empty">
                <House size={42} />
                <h2>A little space. Endless possibilities.</h2>
                <p>
                  Draw your first room or let the guided brief get you started.
                </p>
                <button className="primary" onClick={() => setModal("brief")}>
                  <Sparkles size={16} />
                  Start with a brief
                </button>
              </div>
            )}
            {tool !== "select" && view === "2D" && (
              <div className="tool-hint">
                {tool === "room"
                  ? "Click and drag to draw a room"
                  : tool === "wall"
                    ? "Drag between two points to draw a wall"
                    : tool === "measure"
                      ? "Drag to measure a distance"
                      : "Drag the canvas to move around"}
                <button onClick={() => setTool("select")}>
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="canvas-bottom">
              <div className="floor-selector">
                <Layers size={15} />
                <select
                  aria-label="Active floor"
                  value={floor.id}
                  onChange={(e) => {
                    setFloorId(e.target.value);
                    setSelection(null);
                  }}
                >
                  {project.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <span />
                <IconButton
                  label="Floor settings"
                  onClick={() => setModal("floor-settings")}
                >
                  <Settings2 size={15} />
                </IconButton>
                <IconButton label="Add floor" onClick={addFloor}>
                  <Plus size={15} />
                </IconButton>
              </div>
              {view === "2D" && (
                <div className="zoom-controls">
                  <IconButton
                    label="Zoom out"
                    onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                  >
                    <Minus size={15} />
                  </IconButton>
                  <span>{Math.round(zoom * 100)}%</span>
                  <IconButton
                    label="Zoom in"
                    onClick={() => setZoom((z) => Math.min(2.8, z + 0.15))}
                  >
                    <Plus size={15} />
                  </IconButton>
                  <span className="toolbar-divider" />
                  <IconButton
                    label="Fit plan to view"
                    onClick={() => {
                      setZoom(1);
                      setResetView((v) => v + 1);
                    }}
                  >
                    <Maximize size={15} />
                  </IconButton>
                </div>
              )}
            </div>
          </div>
          <footer className="workspace-status">
            <div>
              <span className="status-dot" />
              <span>{floor.rooms.length} rooms</span>
              <i />
              <span>
                {(footprintArea * (units === "ft" ? 10.7639 : 1)).toFixed(1)}{" "}
                {units}² footprint
              </span>
              <i />
              <button onClick={() => setUnits((u) => (u === "m" ? "ft" : "m"))}>
                {units === "m" ? "Metric" : "Imperial"}
                <ChevronDown size={10} />
              </button>
            </div>
            <button
              className={errors ? "has-errors" : ""}
              onClick={() => setModal("checks")}
            >
              {errors ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
              <span>
                {errors ? `${errors} design issues` : "Design checks"}
              </span>
              <ChevronRight size={12} />
            </button>
          </footer>
        </section>
        <aside
          className={`assistant-panel ${mobileRight ? "mobile-open" : ""}`}
        >
          <div className="assistant-tabs">
            <button
              className={rightTab === "assistant" ? "active" : ""}
              onClick={() => setRightTab("assistant")}
            >
              <Sparkles size={15} />
              AI prompts<span className="beta">AI</span>
            </button>
            <button
              className={rightTab === "properties" ? "active" : ""}
              onClick={() => setRightTab("properties")}
            >
              <SlidersHorizontal size={14} />
              Properties
            </button>
            <IconButton
              className="mobile-only"
              label="Close assistant"
              onClick={() => setMobileRight(false)}
            >
              <X size={17} />
            </IconButton>
          </div>
          {rightTab === "assistant" ? (
            <>
              <div className="assistant-scroll">
                {messages.length === 0 ? (
                  <>
                    <div className="assistant-welcome">
                      <div className="assistant-mark">
                        <Sparkles size={26} strokeWidth={1.3} />
                        <span className="spark-small">✦</span>
                      </div>
                      <span className="personal-designer">
                        Your ideas. A place to begin.
                      </span>
                      <h1>
                        Let’s make room
                        <br />
                        for your life.
                      </h1>
                      <p>
                        A sunny reading corner? Space for the whole family? Tell
                        me what home looks like to you.
                      </p>
                    </div>
                    <button
                      className="brief-card"
                      onClick={() => setModal("brief")}
                    >
                      <span className="brief-icon">
                        <ClipboardList size={21} />
                      </span>
                      <strong>Requirements & constraints</strong>
                      <p>
                        Site, rooms, priorities and fixed elements.
                        <br />
                        Reviewed before AI builds.
                      </p>
                      <span className="brief-card-footer">
                        Let’s get started
                        <ArrowRight size={17} />
                      </span>
                    </button>
                    <div className="suggestions">
                      <span>Or, start with an idea</span>
                      {[
                        {
                          icon: House,
                          text: "A 3-bedroom home for my family",
                          prompt: "I need a 3-bedroom home for my family.",
                        },
                        {
                          icon: Leaf,
                          text: "An airy, open living space",
                          prompt:
                            "I want an airy, open living space with natural light.",
                        },
                        {
                          icon: Armchair,
                          text: "Make room for a home office",
                          prompt:
                            "Please add an office so I can work from home.",
                        },
                      ].map(({ icon: Icon, text, prompt: p }) => (
                        <button
                          key={text}
                          onClick={() => {
                            setPromptMode("layout");
                            sendMessage(p, "layout");
                          }}
                        >
                          <Icon size={16} />
                          <span>{text}</span>
                          <MoveUpRight size={13} />
                        </button>
                      ))}
                    </div>
                    <div className="assistant-note">
                      <Lightbulb size={16} />
                      <p>
                        No design experience needed.
                        <br />
                        You bring the ideas. We’ll find a starting point.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="chat-messages">
                    {messages.map((m, i) => (
                      <div key={i} className={`chat-message ${m.role}`}>
                        {m.role === "assistant" && (
                          <span className="message-avatar">
                            <Sparkles size={14} />
                          </span>
                        )}
                        <div>
                          <p>{m.content}</p>
                          {m.intake && (
                            <IntakeProposalCard
                              proposal={m.intake}
                              onApply={() => saveIntake(m.intake!, i)}
                              onDismiss={() =>
                                setMessages((messages) =>
                                  messages.map((message, index) =>
                                    index === i && message.intake
                                      ? {
                                          ...message,
                                          intake: {
                                            ...message.intake,
                                            status: "dismissed",
                                          },
                                        }
                                      : message,
                                  ),
                                )
                              }
                            />
                          )}
                          {m.edit && (
                            <div className="proposal edit-proposal">
                              <strong>
                                Proposed edits · {m.edit.changes.length} changes
                              </strong>
                              <ul>
                                {m.edit.changes.map((change, j) => (
                                  <li key={j}>{change}</li>
                                ))}
                              </ul>
                              {!!m.edit.warnings.length && (
                                <details>
                                  <summary>
                                    {m.edit.warnings.length} design checks to
                                    review
                                  </summary>
                                  <ul>
                                    {m.edit.warnings.map((warning, j) => (
                                      <li key={j}>{warning}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                              {m.edit.status === "pending" ? (
                                <div className="proposal-actions">
                                  <button
                                    className="primary"
                                    disabled={applyingEdit}
                                    onClick={() => applyEdit(m.edit!, i)}
                                  >
                                    <Check size={14} />
                                    Apply changes
                                  </button>
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      setMessages((messages) =>
                                        messages.map((message, j) =>
                                          j === i
                                            ? {
                                                ...message,
                                                edit: {
                                                  ...m.edit!,
                                                  status: "dismissed",
                                                },
                                              }
                                            : message,
                                        ),
                                      )
                                    }
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              ) : (
                                <span>
                                  {m.edit.status === "applied"
                                    ? "Applied · Undo is available in the toolbar"
                                    : "Dismissed · Your design was not changed"}
                                </span>
                              )}
                            </div>
                          )}
                          {m.brief && (
                            <div className="proposal">
                              <strong>Your proposed brief</strong>
                              <span>
                                {displayLength(m.brief.width, units, 1)} ×{" "}
                                {displayLength(m.brief.depth, units, 1)} {units}{" "}
                                ·{" "}
                                {m.brief.floorPrograms
                                  ? `${m.brief.floors} floors with separate room requirements`
                                  : `${m.brief.bedrooms} beds · ${m.brief.bathrooms} baths per floor`}
                              </span>
                              <button
                                className="primary"
                                onClick={() => applyBrief(m.brief!)}
                              >
                                <LayoutGrid size={14} />
                                Review constraints & build
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {thinking && (
                  <div className="thinking">
                    <LoaderCircle size={15} className="spin" />
                    Working through your ideas…
                  </div>
                )}
                <div ref={messageEnd} />
              </div>
              <div className="assistant-composer">
                <button
                  className="constraints-shortcut"
                  onClick={() => setModal("constraints")}
                >
                  <ClipboardList size={15} />
                  <span>
                    Requirements & constraints
                    <small>Enter your needs before AI builds</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
                <label className="prompt-heading" htmlFor="design-prompt">
                  <Sparkles size={15} />
                  {promptMode === "intake"
                    ? "Tell us what matters"
                    : "Tell AI what to change"}
                </label>
                <div
                  className="prompt-modes"
                  role="group"
                  aria-label="Prompt mode"
                >
                  <button
                    className={promptMode === "intake" ? "active" : ""}
                    onClick={() => {
                      setPromptMode("intake");
                      setIntakeTopic(
                        nextIntakeTopic(project.brief)?.key || "auto",
                      );
                    }}
                  >
                    Collect needs
                  </button>
                  <button
                    className={promptMode === "edit" ? "active" : ""}
                    onClick={() => setPromptMode("edit")}
                  >
                    Edit this floor
                  </button>
                  <button
                    className={promptMode === "layout" ? "active" : ""}
                    onClick={() => setPromptMode("layout")}
                  >
                    New layout
                  </button>
                </div>
                {promptMode === "intake" && (
                  <div className="interview-controls">
                    <label>
                      Answer a topic or organize your whole message
                      <select
                        aria-label="Requirement interview topic"
                        value={intakeTopic}
                        onChange={(e) =>
                          setIntakeTopic(e.target.value as typeof intakeTopic)
                        }
                      >
                        <option value="auto">Let AI organize my notes</option>
                        {requirementTopics.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {intakeTopic !== "auto" && (
                      <>
                        <details>
                          <summary>
                            {
                              requirementTopics.find(
                                (t) => t.key === intakeTopic,
                              )?.question
                            }
                          </summary>
                          <p>
                            {
                              requirementTopics.find(
                                (t) => t.key === intakeTopic,
                              )?.help
                            }
                          </p>
                        </details>
                        <div className="interview-answer-options">
                          <select
                            aria-label="Interview answer priority"
                            value={intakePriority}
                            onChange={(e) =>
                              setIntakePriority(
                                e.target.value as typeof intakePriority,
                              )
                            }
                          >
                            <option value="preference">
                              Preference / review
                            </option>
                            <option value="must">Non-negotiable</option>
                          </select>
                          <button
                            disabled={thinking}
                            onClick={() =>
                              sendMessage("Not sure yet.", "intake", "unknown")
                            }
                          >
                            Not sure yet
                          </button>
                          <button
                            disabled={thinking}
                            onClick={() =>
                              sendMessage(
                                "Not applicable to this project.",
                                "intake",
                                "not-applicable",
                              )
                            }
                          >
                            Not applicable
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="prompt-context">
                  {promptMode === "intake"
                    ? "Review answers before saving. No layout changes."
                    : promptMode === "edit"
                      ? `${floor.name}${selectedRoom || selectedItem || selectedWall ? " · Selected: " + ((selectedRoom || selectedItem || selectedWall)?.name || "Custom wall") : " · Select an object to refer to it"}`
                      : "Requirements are reviewed before replacing the layout."}
                </div>
                {promptMode === "intake" &&
                  !!project.brief.requirements?.responses.length && (
                    <button
                      className="text-button interview-prepare"
                      disabled={thinking || config.provider === "builtin"}
                      title={
                        config.provider === "builtin"
                          ? "Choose Local AI or an API model to interpret your saved answers"
                          : "Propose structured dimensions and room counts from your saved answers"
                      }
                      onClick={() => {
                        setPromptMode("layout");
                        sendMessage(
                          "Prepare a proposed layout brief from the client answers saved under Requirements & constraints. Use only explicitly supplied dimensions, room counts and minimum room sizes from those answers; do not invent missing facts. Preserve all written requirements. Ask a specific question if the recorded answers conflict. The proposal will be reviewed before building.",
                          "layout",
                          "provided",
                          true,
                        );
                      }}
                    >
                      Propose layout brief from saved answers{" "}
                      <ArrowRight size={13} />
                    </button>
                  )}
                <div className="prompt-box">
                  <textarea
                    id="design-prompt"
                    ref={promptRef}
                    aria-label="Message the design assistant"
                    placeholder={
                      promptMode === "edit"
                        ? "e.g. Make the primary bedroom 16 ft wide…"
                        : "Describe the home, site and constraints you need…"
                    }
                    value={prompt}
                    maxLength={12000}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <div>
                    <span>Enter to send · Shift+Enter for a new line</span>
                    <IconButton
                      label={listening ? "Stop voice input" : "Use voice input"}
                      onClick={startVoice}
                      active={listening}
                    >
                      {listening ? <StopCircle size={15} /> : <Mic size={15} />}
                    </IconButton>
                    <button
                      className="send-button"
                      aria-label="Send message"
                      disabled={!prompt.trim() || thinking}
                      onClick={() => sendMessage()}
                    >
                      {thinking ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <ArrowUp size={17} />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  className="model-status"
                  onClick={() => setModal("settings")}
                >
                  <span className="status-dot" />
                  {config.provider === "builtin"
                    ? "Built-in planner"
                    : config.provider === "ollama"
                      ? "Local AI · " + (config.model || "Set up model")
                      : "API · " + (config.model || "Set up model")}
                  <ChevronDown size={11} />
                  <Settings2 size={12} />
                </button>
                <span className="composer-footnote">
                  Concept designs. Always review before building.
                </span>
              </div>
            </>
          ) : (
            <div className="properties-content">
              {selectedRoom || selectedItem ? (
                <>
                  <div className="property-heading">
                    <span className="property-icon">
                      {selectedRoom ? <House size={24} /> : <Box size={24} />}
                    </span>
                    <h3>{selectedRoom?.name || selectedItem?.name}</h3>
                    <p>
                      {selectedRoom ? "Room properties" : "Object properties"}
                    </p>
                  </div>
                  <label>
                    Name
                    <input
                      aria-label="Selected element name"
                      value={selectedRoom?.name || selectedItem?.name || ""}
                      maxLength={80}
                      onChange={(e) =>
                        selectedRoom
                          ? updateRoom({ name: e.target.value })
                          : updateItem({ name: e.target.value })
                      }
                    />
                  </label>
                  {selectedRoom && (
                    <div className="room-geometry-lock">
                      <button
                        className="outline full-width"
                        aria-pressed={!!selectedRoom.geometryLocked}
                        onClick={() =>
                          updateRoom({
                            geometryLocked: !selectedRoom.geometryLocked,
                          })
                        }
                      >
                        {selectedRoom.geometryLocked ? (
                          <Unlock size={15} />
                        ) : (
                          <Lock size={15} />
                        )}
                        {selectedRoom.geometryLocked
                          ? "Unlock room geometry"
                          : "Lock room geometry"}
                      </button>
                      <p className="muted">
                        {selectedRoom.geometryLocked
                          ? "Position and dimensions are fixed. Deletion and layout regeneration are blocked."
                          : "Keep this room's measured position and dimensions fixed while editing."}{" "}
                        Furniture, doors and custom walls remain independently
                        editable.
                      </p>
                    </div>
                  )}
                  {selectedRoom && (
                    <label>
                      Room type
                      <select
                        value={selectedRoom.type}
                        onChange={(e) =>
                          updateRoom({ type: e.target.value as Room["type"] })
                        }
                      >
                        {Object.keys(colors).map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block-label">
                    Dimensions & position ({units})
                  </label>
                  <div className="form-grid">
                    {(["w", "h", "x", "y"] as const).map((k) => (
                      <label
                        key={k}
                        htmlFor={
                          {
                            w: "element-width",
                            h: "element-depth",
                            x: "element-x-position",
                            y: "element-y-position",
                          }[k]
                        }
                      >
                        {
                          {
                            w: selectedRoom ? "Overall width" : "Width",
                            h: selectedRoom ? "Overall depth" : "Depth",
                            x: "X position",
                            y: "Y position",
                          }[k]
                        }
                        <DimensionInput
                          key={`${floor.id}-${selection?.id}-${units}-${k}`}
                          label={
                            {
                              w: "Element width",
                              h: "Element depth",
                              x: "Element X position",
                              y: "Element Y position",
                            }[k]
                          }
                          min={
                            (k === "w" || k === "h"
                              ? selectedRoom
                                ? 0.5
                                : 0.1
                              : -100) * unitFactor
                          }
                          max={
                            (selectedItem && (k === "w" || k === "h")
                              ? 20
                              : 100) * unitFactor
                          }
                          value={
                            (selectedRoom || selectedItem)![k] * unitFactor
                          }
                          disabled={!!selectedRoom?.geometryLocked}
                          onCommit={(value) =>
                            selectedRoom
                              ? updateRoom({
                                  [k]: value / unitFactor,
                                })
                              : updateItem({
                                  [k]: value / unitFactor,
                                })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {selectedRoom && (
                    <>
                      <label
                        className="room-wall-label"
                        htmlFor="room-wall-thickness"
                      >
                        Wall thickness ({units})
                        <DimensionInput
                          key={`${floor.id}-${selectedRoom.id}-${units}-wall`}
                          label="Room wall thickness"
                          value={
                            (selectedRoom.wallThickness ??
                              DEFAULT_ROOM_WALL_THICKNESS) * unitFactor
                          }
                          min={0.05 * unitFactor}
                          max={unitFactor}
                          step={0.01}
                          disabled={!!selectedRoom.geometryLocked}
                          onCommit={(value) =>
                            updateRoom({ wallThickness: value / unitFactor })
                          }
                        />
                      </label>
                      <div
                        className="room-wall-presets"
                        aria-label="Common room wall thicknesses"
                      >
                        <span>Common sizes</span>
                        <div>
                          {ROOM_WALL_THICKNESS_PRESETS.map((preset) => {
                            const active =
                              Math.abs(
                                (selectedRoom.wallThickness ??
                                  DEFAULT_ROOM_WALL_THICKNESS) - preset.meters,
                              ) < 1e-7;
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                aria-label={`Use ${preset.label} room walls`}
                                aria-pressed={active}
                                disabled={!!selectedRoom.geometryLocked}
                                onClick={() =>
                                  updateRoom({ wallThickness: preset.meters })
                                }
                              >
                                <strong>{preset.label}</strong>
                                <small>{preset.description}</small>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <p className="muted">
                        Overall width and depth include the walls. Unshared
                        walls sit inside this footprint; shared walls are
                        counted once and use the thicker setting. Press Enter or
                        leave a field to apply; Escape cancels.
                      </p>
                    </>
                  )}
                  {selectedRoom && (
                    <div className="property-area clear-room-size">
                      <span>
                        Inside clear size
                        <small>Space remaining after walls</small>
                      </span>
                      <strong>
                        {formatLength(selectedRoomInterior!.width, units, 2)} ×{" "}
                        {formatLength(selectedRoomInterior!.depth, units, 2)}
                        <small>
                          {formatArea(selectedRoomInterior!.area, units, 2)}
                        </small>
                      </strong>
                    </div>
                  )}
                  {selectedItem && (
                    <>
                      <label>
                        Rotation (degrees)
                        <div className="rotation-field">
                          <input
                            type="number"
                            step="15"
                            min="-3600"
                            max="3600"
                            value={selectedItem.rotation}
                            onChange={(e) =>
                              updateItem({ rotation: +e.target.value })
                            }
                          />
                          <IconButton
                            label="Rotate 90 degrees"
                            onClick={() =>
                              updateItem({
                                rotation: (selectedItem.rotation + 90) % 360,
                              })
                            }
                          >
                            <RotateCw size={17} />
                          </IconButton>
                        </div>
                      </label>
                      <button
                        className="outline full-width"
                        onClick={() =>
                          updateItem({ locked: !selectedItem.locked })
                        }
                      >
                        {selectedItem.locked ? (
                          <Unlock size={15} />
                        ) : (
                          <Lock size={15} />
                        )}{" "}
                        {selectedItem.locked
                          ? "Unlock movement"
                          : "Lock movement"}
                      </button>
                    </>
                  )}
                  {selectedItem &&
                    ["door", "window", "opening"].includes(
                      selectedItem.type,
                    ) && (
                      <OpeningControls
                        key={`${floor.id}:${selectedItem.id}:${units}:${selectedItem.opening?.height}:${selectedItem.opening?.sill}`}
                        item={selectedItem}
                        floor={floor}
                        units={units}
                        onApply={(opening) => updateItem({ opening })}
                      />
                    )}
                  <label>
                    Color
                    <div className="color-field">
                      <input
                        type="color"
                        value={(selectedRoom || selectedItem)!.color}
                        onChange={(e) =>
                          selectedRoom
                            ? updateRoom({ color: e.target.value })
                            : updateItem({ color: e.target.value })
                        }
                      />
                      <span>{(selectedRoom || selectedItem)!.color}</span>
                    </div>
                  </label>
                  {selectedRoom && (
                    <label>
                      Floor finish
                      <select
                        value={selectedRoom.material}
                        onChange={(e) =>
                          updateRoom({
                            material: e.target.value as Room["material"],
                          })
                        }
                      >
                        <option value="oak">Oak boards</option>
                        <option value="tile">Square tile</option>
                        <option value="stone">Stone blocks</option>
                        <option value="plain">Solid finish</option>
                      </select>
                    </label>
                  )}
                  <div className="property-actions">
                    <button
                      className="outline"
                      onClick={() => {
                        if (selectedItem) {
                          const item = {
                            ...selectedItem,
                            id: uid(),
                            x: selectedItem.x + 0.3,
                            y: selectedItem.y + 0.3,
                          };
                          changeFloor({
                            ...floor,
                            items: [...floor.items, item],
                          });
                          select({ kind: "item", id: item.id });
                        } else if (selectedRoom) {
                          const room = {
                            ...selectedRoom,
                            geometryLocked: false,
                            id: uid(),
                            name: selectedRoom.name + " copy",
                            x: selectedRoom.x + 0.5,
                            y: selectedRoom.y + 0.5,
                          };
                          changeFloor({
                            ...floor,
                            rooms: [...floor.rooms, room],
                          });
                          select({ kind: "room", id: room.id });
                        }
                      }}
                    >
                      <Copy size={15} />
                      Duplicate
                    </button>
                    <button
                      className="danger-button"
                      disabled={!!selectedRoom?.geometryLocked}
                      onClick={removeSelected}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </>
              ) : selectedWall ? (
                <>
                  <h3>Wall properties</h3>
                  <label>
                    Name
                    <input
                      aria-label="Wall name"
                      maxLength={80}
                      value={selectedWall.name || ""}
                      placeholder="e.g. Existing kitchen partition"
                      onChange={(e) =>
                        changeFloor({
                          ...floor,
                          walls: floor.walls.map((w) =>
                            w.id === selectedWall.id
                              ? { ...w, name: e.target.value }
                              : w,
                          ),
                        })
                      }
                    />
                  </label>
                  <div className="wall-geometry-lock">
                    <button
                      className="outline full-width"
                      aria-pressed={!!selectedWall.geometryLocked}
                      onClick={() =>
                        changeFloor({
                          ...floor,
                          walls: floor.walls.map((w) =>
                            w.id === selectedWall.id
                              ? { ...w, geometryLocked: !w.geometryLocked }
                              : w,
                          ),
                        })
                      }
                    >
                      {selectedWall.geometryLocked ? (
                        <Unlock size={15} />
                      ) : (
                        <Lock size={15} />
                      )}
                      {selectedWall.geometryLocked
                        ? "Unlock wall geometry"
                        : "Lock wall geometry"}
                    </button>
                    <p className="muted">
                      {selectedWall.geometryLocked
                        ? "Endpoints and thickness are fixed. Moving a room leaves this wall in place; deletion and regeneration are blocked."
                        : "Keep this surveyed wall's endpoints and thickness fixed."}{" "}
                      Doors and windows remain independently editable.
                      Structural capacity is not assessed.
                    </p>
                  </div>
                  <p>
                    {formatLength(
                      Math.hypot(
                        selectedWall.x2 - selectedWall.x1,
                        selectedWall.y2 - selectedWall.y1,
                      ),
                      units,
                    )}{" "}
                    long
                  </p>
                  <WallGeometryControls
                    key={`${selectedWall.id}:${selectedWall.x1}:${selectedWall.y1}:${selectedWall.x2}:${selectedWall.y2}:${units}`}
                    wall={selectedWall}
                    units={units}
                    onApply={(patch, anchor) => {
                      changeFloor(
                        editWall(floor, selectedWall.id, patch, anchor),
                      );
                    }}
                  />
                  <div className="form-grid">
                    {(["x1", "y1", "x2", "y2", "thickness"] as const).map(
                      (k) => (
                        <label key={k}>
                          {
                            {
                              x1: `Start X (${units})`,
                              y1: `Start Y (${units})`,
                              x2: `End X (${units})`,
                              y2: `End Y (${units})`,
                              thickness: `Thickness (${units})`,
                            }[k]
                          }
                          <input
                            aria-label={`Wall ${k}`}
                            disabled={!!selectedWall.geometryLocked}
                            type="number"
                            step=".05"
                            value={displayLength(selectedWall[k], units, 3)}
                            onChange={(e) => {
                              const n = +e.target.value / unitFactor;
                              if (k === "thickness" && (n < 0.05 || n > 1))
                                return;
                              try {
                                changeFloor(
                                  editWall(floor, selectedWall.id, { [k]: n }),
                                );
                              } catch (error) {
                                notify((error as Error).message);
                              }
                            }}
                          />
                        </label>
                      ),
                    )}
                  </div>
                  <button
                    className="danger-button"
                    disabled={!!selectedWall.geometryLocked}
                    onClick={removeSelected}
                  >
                    <Trash2 size={15} />
                    Delete wall
                  </button>
                </>
              ) : (
                <div className="no-selection">
                  <MousePointer2 size={30} />
                  <h3>A little more detail.</h3>
                  <p>
                    Select a room, wall or object to edit its dimensions,
                    position and finishes.
                  </p>
                  <button
                    className="outline"
                    onClick={() => setSection("Layers")}
                  >
                    <Layers size={15} />
                    Browse layers
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </main>
      <div className="mobile-tools" inert={!!modal}>
        <button onClick={() => setMobileLeft((x) => !x)}>
          <Armchair size={18} />
          Library
        </button>
        <button
          onClick={() => {
            setRightTab("assistant");
            setMobileRight((x) => !x);
          }}
        >
          <Sparkles size={18} />
          Assistant
        </button>
        <button
          onClick={() => {
            setRightTab("properties");
            setMobileRight((x) => !x);
          }}
        >
          <SlidersHorizontal size={18} />
          Properties
        </button>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(modal === "brief" || modal === "constraints") && (
        <Modal title="Requirements & constraints" onClose={closeModal} wide>
          <BriefWizard
            initial={proposedBrief || project.brief}
            initialStep={modal === "constraints" ? 4 : 0}
            generationBlocker={regenerationLockIssue(project.floors)}
            onGenerate={generate}
            units={units}
            onUnitsChange={setUnits}
            onSaveDraft={saveBriefDraft}
          />
        </Modal>
      )}
      {modal === "floor-settings" && (
        <Modal title="Floor settings" onClose={closeModal}>
          <FloorSettings
            floor={floor}
            units={units}
            onSave={(value) => {
              const next = updateFloorSettings(
                projectRef.current,
                floor.id,
                value,
              );
              if (commit(next)) {
                closeModal();
                notify("Floor settings saved. Undo is available.");
              }
            }}
          />
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="AI & workspace settings" onClose={closeModal}>
          <div className="settings-body">
            <h2>A little extra intelligence.</h2>
            <p className="muted">
              Work entirely offline with the built-in planner, or connect a
              model for more flexible conversations.
            </p>
            <div className="provider-options">
              {[
                {
                  id: "builtin",
                  icon: LayoutGrid,
                  name: "Built-in planner",
                  desc: "No setup or API key. Geometric templates and basic text parsing.",
                },
                {
                  id: "ollama",
                  icon: House,
                  name: "Local AI with Ollama",
                  desc: "Your brief stays on your machine when using a local model.",
                },
                {
                  id: "compatible",
                  icon: Wifi,
                  name: "Connect an API",
                  desc: "OpenAI-compatible providers, including LM Studio.",
                },
              ].map(({ id, icon: Icon, name, desc }) => (
                <button
                  key={id}
                  className={config.provider === id ? "selected" : ""}
                  onClick={() => {
                    configChosen.current = true;
                    setConfig((c) => ({
                      ...c,
                      provider: id as AIConfig["provider"],
                      baseUrl:
                        id === "ollama"
                          ? "http://127.0.0.1:11434"
                          : id === "compatible"
                            ? "https://api.openai.com/v1"
                            : "",
                      model: "",
                    }));
                    setConnectionStatus("");
                  }}
                >
                  <Icon size={22} />
                  <span>
                    <strong>{name}</strong>
                    <small>{desc}</small>
                  </span>
                  <span className="radio">
                    {config.provider === id && <i />}
                  </span>
                </button>
              ))}
            </div>
            {config.provider !== "builtin" && (
              <>
                <label>
                  API base URL
                  <input
                    value={config.baseUrl}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, baseUrl: e.target.value }))
                    }
                    placeholder="http://127.0.0.1:11434"
                  />
                </label>
                <label>
                  Model name
                  <input
                    value={config.model}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, model: e.target.value }))
                    }
                    placeholder={
                      config.provider === "ollama"
                        ? "e.g. qwen3:8b"
                        : "Enter an available model ID"
                    }
                  />
                </label>
                {config.provider === "compatible" && (
                  <label>
                    API key <span className="optional">Or use server .env</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={config.apiKey}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, apiKey: e.target.value }))
                      }
                      placeholder="Kept in memory for this session only"
                    />
                  </label>
                )}
                <button
                  className="outline full-width"
                  onClick={testConnection}
                  disabled={checking}
                >
                  {checking ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Wifi size={16} />
                  )}
                  Test connection
                </button>
                {connectionStatus && (
                  <div className="info-box" role="status">
                    {connectionStatus}
                  </div>
                )}
                <p className="fine-print">
                  {config.provider === "ollama"
                    ? "Install Ollama, download a model, and start it before connecting. No model is bundled."
                    : "Your messages, recent conversation and design brief are sent to the provider when you use the assistant. API keys are not stored in projects or browser storage."}{" "}
                  Connection settings last for this session.
                </p>
              </>
            )}
            <button
              className="primary full-width"
              onClick={() => {
                closeModal();
                notify("AI settings applied to this session.");
              }}
            >
              Done
              <Check size={15} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "projects" && (
        <Modal title="Your projects" onClose={closeModal} wide>
          <div className="projects-body">
            <div className="projects-intro">
              <div>
                <h2>Good things start with a little space.</h2>
                <p className="muted">
                  Your local studio · editable project files and recovery
                  versions.
                </p>
              </div>
              <button
                className="primary"
                onClick={async () => {
                  const opened = await loadProject({
                    ...sampleProject(),
                    name: "Untitled home",
                    floors: [
                      {
                        id: uid(),
                        name: "Ground floor",
                        rooms: [],
                        items: [],
                        walls: [],
                      },
                    ],
                    brief: structuredClone(defaultBrief),
                  });
                  if (opened) setModal("brief");
                }}
              >
                <Plus size={16} />
                New project
              </button>
            </div>
            <div className="studio-location">
              <FolderOpen size={16} />
              <span>
                {studio.directory ||
                  "Studio files unavailable; browser drafts are available."}
              </span>
            </div>
            {studio.notice && <p className="info-box">{studio.notice}</p>}
            {saveError && (
              <div className="studio-warning" role="alert">
                <p>{saveError}</p>
                <button className="outline" onClick={saveCopy}>
                  <Copy size={15} />
                  Save changes as a copy
                </button>
                {!studio.online && (
                  <button
                    className="text-button"
                    onClick={() => location.reload()}
                  >
                    Retry studio connection
                  </button>
                )}
              </div>
            )}
            <div className="project-grid">
              {[
                project,
                ...studio.library.filter((p) => p.id !== project.id),
              ].map((p) => (
                <button
                  className="project-card"
                  key={p.id}
                  onClick={() =>
                    p.id === project.id ? closeModal() : loadProject(p, true)
                  }
                >
                  <svg
                    viewBox={`-1 -1 ${p.brief.width + 2} ${p.brief.depth + 2}`}
                    aria-hidden="true"
                  >
                    {p.floors[0].rooms.map((r) => (
                      <rect
                        key={r.id}
                        x={r.x}
                        y={r.y}
                        width={r.w}
                        height={r.h}
                        fill={r.color}
                        stroke="#70786a"
                        strokeWidth=".1"
                      />
                    ))}
                  </svg>
                  <strong>{p.name || "Untitled home"}</strong>
                  <span>
                    {p.floors.length} floor{p.floors.length > 1 ? "s" : ""} ·{" "}
                    {p.brief.style}
                  </span>
                </button>
              ))}
            </div>
            {studio.online && (
              <StudioHistory
                project={project}
                client={studio.client}
                save={() => studio.saveNow(project)}
                restore={studio.restore}
                notify={notify}
              />
            )}
            <div className="project-footer">
              <button
                className="outline"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} />
                Import a Forma project
              </button>
              <button className="text-button" onClick={saveCopy}>
                <Copy size={15} />
                Duplicate project
              </button>
              <button
                className="text-button"
                onClick={() => loadProject(sampleProject())}
              >
                Open a fresh sample
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal === "export" && (
        <Modal title="Take your design with you" onClose={closeModal}>
          <div className="export-body">
            <h2>Your next step starts here.</h2>
            <p className="muted">
              Export the current floor, or save your entire editable project.
            </p>
            {[
              {
                format: "png",
                icon: Image,
                title: view === "3D" ? "3D view image" : "Floor plan image",
                desc:
                  view === "3D"
                    ? "PNG of your current 3D camera view"
                    : "High-resolution PNG of the current 2D floor",
              },
              {
                format: "svg",
                icon: Ruler,
                title: "Vector floor plan",
                desc: "Scalable SVG with room labels and measurements",
              },
              {
                format: "print",
                icon: BookOpen,
                title: "Print / Save as PDF",
                desc: "Open the plan in your browser’s print dialog",
              },
              {
                format: "json",
                icon: FileJson,
                title: "Editable Forma project",
                desc: "All floors, objects and your design brief",
              },
              {
                format: "dxf",
                icon: Ruler,
                title: "CAD drawing (DXF)",
                desc: "Walls, openings, furniture footprints and room labels in meters",
              },
              {
                format: "glb",
                icon: Box,
                title: "3D model (GLB)",
                desc: "Export the visible 3D scene for other design tools",
              },
              {
                format: "csv",
                icon: ClipboardList,
                title: "Room & object schedule",
                desc: "CSV inventory of all floors, rooms, finishes and objects",
              },
            ].map(({ format, icon: Icon, title, desc }) => (
              <button
                className="export-option"
                data-format={format}
                key={format}
                onClick={() =>
                  exportPlan(
                    format as
                      "png" | "svg" | "print" | "json" | "dxf" | "glb" | "csv",
                  )
                }
              >
                <Icon size={23} />
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
                <Download size={17} />
              </button>
            ))}
            <p className="fine-print">
              SVG / PNG exports reflect visible layers. Choose 2D view for
              floor-plan exports. Dimensions show room footprints, not
              construction clearances.
            </p>
          </div>
        </Modal>
      )}
      {modal === "checks" && (
        <Modal title="Design checks" onClose={closeModal}>
          <div className="checks-body">
            <h2>A thoughtful second look.</h2>
            <p className="muted">
              Checks for {floor.name}. Resolve geometric issues and review the
              rest with your designer.
            </p>
            {checks.map((c, i) => (
              <div className={`check-item ${c.level}`} key={i}>
                {c.level === "pass" ? (
                  <Check size={18} />
                ) : (
                  <AlertTriangle size={18} />
                )}
                <div>
                  <strong>{c.title}</strong>
                  <p>{c.detail}</p>
                </div>
              </div>
            ))}
            <label className="block-label">Your saved preferences</label>
            <div className="info-box">
              {project.brief.notes || "No additional notes yet."}
            </div>
            {project.notes.map((n, i) => (
              <p className="fine-print" key={i}>
                {n}
              </p>
            ))}
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="A little guidance" onClose={closeModal}>
          <div className="help-body">
            <h2>Make yourself at home.</h2>
            <p>
              Start with <strong>Your brief</strong> for a generated layout, or
              use <strong>Build</strong> to draw rooms and walls. Click
              furniture to add it, then drag it into position. Select an element
              to edit exact dimensions.
            </p>
            <div className="shortcut-list">
              {[
                ["Select tool", "V"],
                ["Pan around", "H"],
                ["Draw a room", "R"],
                ["Measure distance", "M"],
                ["Undo", "Ctrl / ⌘ + Z"],
                ["Redo", "Ctrl / ⌘ + Shift + Z"],
                ["Delete selection", "Delete"],
                ["Deselect", "Esc"],
              ].map(([a, b]) => (
                <div key={a}>
                  <span>{a}</span>
                  <kbd>{b}</kbd>
                </div>
              ))}
            </div>
            <p className="fine-print">
              A locally saved concept-design workspace. Measurements display in
              feet by default and can be switched to metric from the status bar.
              The origin is at the top left and north is up. Rooms use
              rectangular footprints; this version does not calculate structure,
              approvals or costs.
            </p>
          </div>
        </Modal>
      )}
      <input
        ref={fileRef}
        hidden
        type="file"
        accept=".json,.forma.json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 25 * 1024 * 1024)
              throw Error("Project must be smaller than 25 MB.");
            const imported = ProjectSchema.parse(JSON.parse(await file.text()));
            // An import is a new local project, so a backup cannot silently replace its source.
            const opened = await loadProject({ ...imported, id: uid() });
            if (opened) notify("Project imported successfully.");
          } catch {
            notify(
              "Could not import this file. Choose a valid Forma project JSON under 25 MB.",
            );
          }
          e.target.value = "";
        }}
      />
      <input
        ref={imageRef}
        hidden
        type="file"
        aria-label="Import floor reference image"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            notify("Choose an image smaller than 5 MB.");
            e.target.value = "";
            return;
          }
          if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
            notify("Choose a PNG, JPEG or WebP image.");
            e.target.value = "";
            return;
          }
          const targetProject = project.id,
            targetFloor = floor.id;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result);
            const picture = new window.Image();
            picture.onload = () => {
              if (
                projectRef.current.id !== targetProject ||
                referenceFloor.current !== targetFloor
              ) {
                notify(
                  "The active floor changed. Import the image again on the intended floor.",
                );
                return;
              }
              const current = projectRef.current;
              let imported;
              try {
                imported = createReference(
                  file.name,
                  dataUrl,
                  picture.naturalWidth,
                  picture.naturalHeight,
                  current.brief,
                );
              } catch (e) {
                notify((e as Error).message);
                return;
              }
              const next = {
                ...current,
                floors: current.floors.map((f) =>
                  f.id === targetFloor ? { ...f, reference: imported } : f,
                ),
              };
              if (new Blob([JSON.stringify(next)]).size > 24 * 1024 * 1024) {
                notify(
                  "This reference would exceed the 24 MB project backup limit. Choose a smaller image.",
                );
                return;
              }
              if (!commit(next)) return;
              setView("2D");
              notify(
                "Reference saved with this floor. Set its scale and position, then trace over it.",
              );
            };
            picture.onerror = () =>
              notify("This file could not be decoded as a reference image.");
            picture.src = dataUrl;
          };
          reader.onerror = () => notify("Could not read this reference image.");
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
