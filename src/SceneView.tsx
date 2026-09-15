import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Footprints,
  Orbit,
  PanelTop,
} from "lucide-react";
import type { Floor } from "../shared/model";
import { ceilingHeight } from "../shared/heights";
import { openingBands } from "../shared/openings";
import { canWalkTo, wallOpenings, wallSegments } from "../shared/geometry";
import { furnitureModel } from "./Furniture3D";
import type { Selection } from "./PlanCanvas";
export type SceneHandle = {
  exportGLB: () => Promise<ArrayBuffer>;
  exportPNG: () => Promise<Blob>;
};
type Props = { floor: Floor; onSelect?: (s: Selection) => void };
const SceneView = forwardRef<SceneHandle, Props>(function SceneView(
  { floor, onSelect },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null),
    live = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer } | null>(
      null,
    );
  const savedCamera = useRef<{
      floorId: string;
      position: THREE.Vector3;
      target: THREE.Vector3;
    } | null>(null),
    selectionCallback = useRef(onSelect);
  selectionCallback.current = onSelect;
  const [error, setError] = useState(""),
    [walk, setWalk] = useState(false),
    [fullWalls, setFullWalls] = useState(false);
  const pressed = useRef(new Set<string>());
  useImperativeHandle(
    ref,
    () => ({
      exportGLB: async () => {
        if (!live.current) throw Error("The 3D scene is not ready yet.");
        return new GLTFExporter().parseAsync(live.current.scene, {
          binary: true,
        }) as Promise<ArrayBuffer>;
      },
      exportPNG: () =>
        new Promise((resolve, reject) => {
          if (!live.current) {
            reject(Error("The 3D scene is not ready yet."));
            return;
          }
          live.current.renderer.domElement.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(Error("Could not capture the 3D image.")),
            "image/png",
          );
        }),
    }),
    [],
  );
  useEffect(() => {
    const host = hostRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        "3D requires WebGL. Enable hardware acceleration in your browser to use this view.",
      );
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#edf0e9");
    const width = Math.max(6, ...floor.rooms.map((r) => r.x + r.w)),
      depth = Math.max(6, ...floor.rooms.map((r) => r.y + r.h));
    const wallHeight = walk || fullWalls ? ceilingHeight(floor) : 1.35;
    scene.userData = {
      floorName: floor.name,
      ceilingHeight: ceilingHeight(floor),
      wallDisplay: walk || fullWalls ? "full" : "cutaway",
    };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute(
      "aria-label",
      walk
        ? "3D walkthrough. Click to focus, then use W A S D to move and drag to look."
        : "3D floor plan. Drag to orbit, scroll to zoom, right-drag to pan.",
    );
    host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight("#fffefa", "#acb5a2", 2));
    const sun = new THREE.DirectionalLight("#fff2db", 2.2);
    sun.position.set(-5, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -width - 5,
      right: width + 5,
      top: depth + 5,
      bottom: -depth - 5,
    });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.03, 250);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(width / 2, 0, depth / 2);
    controls.enableDamping = true;
    controls.enabled = !walk;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2;
    controls.maxDistance = 150;
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const material = (color: string) => {
      if (!materials.has(color))
        materials.set(
          color,
          new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
        );
      return materials.get(color)!;
    };
    function box(
      cx: number,
      base: number,
      cz: number,
      w: number,
      h: number,
      d: number,
      color: string,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        material(color),
      );
      mesh.position.set(cx, base + h / 2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    box(width / 2, -0.22, depth / 2, width + 0.6, 0.14, depth + 0.6, "#d3d8cb");
    const picks: THREE.Object3D[] = [];
    for (const room of floor.rooms) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = room.color;
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = room.material === "oak" ? "#ac927935" : "#86948540";
      ctx.lineWidth = 1;
      if (room.material !== "plain") {
        const size = room.material === "oak" ? 24 : 64;
        for (let y = 0; y < 256; y += size) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(256, y);
          ctx.stroke();
          if (room.material === "oak") {
            ctx.beginPath();
            const x = (y / size) % 2 ? 128 : 64;
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + size);
            ctx.stroke();
          }
        }
        if (room.material !== "oak")
          for (let x = 0; x < 256; x += size) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 256);
            ctx.stroke();
          }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(room.w / 2, room.h / 2);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(room.w, room.h),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(room.x + room.w / 2, 0.002, room.y + room.h / 2);
      mesh.receiveShadow = true;
      mesh.userData = { kind: "room", id: room.id };
      scene.add(mesh);
      picks.push(mesh);
    }
    for (const wall of wallSegments(floor)) {
      const dx = wall.x2 - wall.x1,
        dy = wall.y2 - wall.y1,
        len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      const openings = wallOpenings(wall, floor.items);
      const breaks = [
        ...new Set([0, len, ...openings.flatMap((o) => [o.start, o.end])]),
      ].sort((a, b) => a - b);
      const add = (
        start: number,
        end: number,
        base: number,
        height: number,
        color = "#deded2",
        thickness = wall.thickness,
      ) => {
        if (end - start < 0.01 || height < 0.01) return;
        const t = (start + end) / 2;
        const mesh = box(
          wall.x1 + (dx * t) / len,
          base,
          wall.y1 + (dy * t) / len,
          end - start,
          height,
          thickness,
          color,
        );
        mesh.rotation.y = -Math.atan2(dy, dx);
        mesh.userData.kind = "wall";
        return mesh;
      };
      for (let i = 0; i < breaks.length - 1; i++) {
        const start = breaks[i],
          end = breaks[i + 1],
          mid = (start + end) / 2;
        const holes = openings.filter(
          (o) => mid > o.start - 0.001 && mid < o.end + 0.001,
        );
        for (const band of openingBands(holes, wallHeight)) {
          if (band.kind === "solid") {
            add(start, end, band.base, band.height);
            continue;
          }
          const glass = add(
            start,
            end,
            band.base,
            band.height,
            "#b5d6d2",
            0.025,
          );
          if (glass) {
            glass.userData.kind = "window-glass";
            glass.userData.openingIds = holes
              .filter(
                (o) =>
                  o.type === "window" &&
                  o.bottom < band.base + band.height &&
                  o.top > band.base,
              )
              .map((o) => o.id);
            glass.material = new THREE.MeshStandardMaterial({
              color: "#b5d6d2",
              transparent: true,
              opacity: 0.25,
              roughness: 0.15,
            });
            glass.castShadow = false;
          }
          const frame = add(
            start,
            end,
            band.base,
            Math.min(0.035, band.height),
            "#8d9b8c",
            wall.thickness + 0.02,
          );
          if (frame) frame.userData.kind = "window-frame";
        }
      }
    }
    for (const item of floor.items) {
      if (["door", "window", "opening"].includes(item.type)) continue;
      const model = furnitureModel(item);
      scene.add(model);
      picks.push(model);
    }
    const grid = new THREE.GridHelper(
      Math.max(width, depth) + 10,
      Math.round((Math.max(width, depth) + 10) * 2),
      "#cdd6c3",
      "#dce3d5",
    );
    grid.position.set(width / 2, -0.145, depth / 2);
    if (!walk) scene.add(grid);
    let fitted = false,
      yaw = 0,
      pitch = 0;
    if (walk) {
      const room =
        floor.rooms.find((r) => r.type === "Hallway") || floor.rooms[0];
      camera.position.set(
        room ? room.x + room.w / 2 : width / 2,
        1.65,
        room ? room.y + room.h / 2 : depth / 2,
      );
      camera.rotation.order = "YXZ";
    } else if (savedCamera.current?.floorId === floor.id) {
      camera.position.copy(savedCamera.current.position);
      controls.target.copy(savedCamera.current.target);
      fitted = true;
    }
    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      renderer.setSize(bounds.width, bounds.height);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
      if (!fitted && !walk) {
        const radius = Math.hypot(width, depth) / 2;
        const distance =
          ((radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) *
            1.18) /
          Math.min(1, camera.aspect);
        camera.position
          .copy(controls.target)
          .add(
            new THREE.Vector3(0.85, 1.3, 1.05)
              .normalize()
              .multiplyScalar(distance),
          );
        fitted = true;
      }
      controls.update();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    controls.addEventListener("change", render);
    resize();
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number; lastX: number; lastY: number } | null =
      null;
    const pointerDown = (e: PointerEvent) => {
      renderer.domElement.focus();
      down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
    };
    const pointerMove = (e: PointerEvent) => {
      if (!walk || !down) return;
      yaw -= (e.clientX - down.lastX) * 0.005;
      pitch = Math.max(
        -1.2,
        Math.min(1.2, pitch - (e.clientY - down.lastY) * 0.005),
      );
      down.lastX = e.clientX;
      down.lastY = e.clientY;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      render();
    };
    const pointerUp = (e: PointerEvent) => {
      if (
        down &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 &&
        !walk
      ) {
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        const intersection = raycaster.intersectObjects(picks, true)[0];
        if (intersection) {
          let object: THREE.Object3D | null = intersection.object;
          while (object && !object.userData.id) object = object.parent;
          if (object)
            selectionCallback.current?.({
              kind: object.userData.kind,
              id: object.userData.id,
            });
        }
      }
      down = null;
    };
    const keyDown = (e: KeyboardEvent) => {
      if (
        !walk ||
        document.activeElement !== renderer.domElement ||
        ![
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(e.key.toLowerCase())
      )
        return;
      e.preventDefault();
      pressed.current.add(e.key.toLowerCase());
    };
    const keyUp = (e: KeyboardEvent) =>
      pressed.current.delete(e.key.toLowerCase());
    const blur = () => pressed.current.clear();
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    let frame = 0,
      last = performance.now();
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (walk && pressed.current.size) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
          camera.quaternion,
        );
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
          camera.quaternion,
        );
        right.y = 0;
        right.normalize();
        const delta = new THREE.Vector3();
        const keys = pressed.current;
        if (keys.has("w") || keys.has("arrowup")) delta.add(forward);
        if (keys.has("s") || keys.has("arrowdown")) delta.sub(forward);
        if (keys.has("d") || keys.has("arrowright")) delta.add(right);
        if (keys.has("a") || keys.has("arrowleft")) delta.sub(right);
        delta.normalize().multiplyScalar(dt * 2);
        const x = camera.position.x + delta.x,
          z = camera.position.z + delta.z;
        if (canWalkTo(x, z, floor)) {
          camera.position.x = x;
          camera.position.z = z;
          render();
        }
      } else if (!walk) controls.update();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    live.current = { scene, renderer };
    return () => {
      if (!walk)
        savedCamera.current = {
          floorId: floor.id,
          position: camera.position.clone(),
          target: controls.target.clone(),
        };
      live.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      pressed.current.clear();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          const list = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const m of list) {
            if ("map" in m && (m as THREE.MeshStandardMaterial).map)
              (m as THREE.MeshStandardMaterial).map!.dispose();
            m.dispose();
          }
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [floor, walk, fullWalls]);
  return (
    <div
      className="scene3d"
      ref={hostRef}
      data-ceiling-height={ceilingHeight(floor)}
    >
      {error && <p className="empty-state">{error}</p>}
      <div className="scene-controls">
        <button
          className={!walk ? "active" : ""}
          onClick={() => setWalk(false)}
        >
          <Orbit size={14} />
          Orbit
        </button>
        <button className={walk ? "active" : ""} onClick={() => setWalk(true)}>
          <Footprints size={14} />
          Walk through
        </button>
        {!walk && (
          <button
            title="Toggle full-height walls"
            aria-label="Toggle full-height walls"
            className={fullWalls ? "active" : ""}
            onClick={() => setFullWalls((v) => !v)}
          >
            <PanelTop size={15} />
          </button>
        )}
      </div>
      {walk && (
        <div className="walk-controls">
          {[
            { key: "a", Icon: ArrowLeft, label: "left" },
            { key: "w", Icon: ArrowUp, label: "forward" },
            { key: "s", Icon: ArrowDown, label: "backward" },
            { key: "d", Icon: ArrowRight, label: "right" },
          ].map(({ key, Icon, label }) => (
            <button
              key={key}
              aria-label={"Walk " + label}
              onPointerDown={() => pressed.current.add(key)}
              onPointerUp={() => pressed.current.delete(key)}
              onPointerLeave={() => pressed.current.delete(key)}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      )}
      <div className="scene-help">
        {walk
          ? "Click-drag to look · W A S D / arrow keys to move"
          : "Drag to orbit · Scroll to zoom · Right-drag to pan"}
        <span>
          {walk
            ? "Walk through this floor. Select another floor to explore it."
            : "Concept model · Click a room or object to edit it"}
        </span>
      </div>
    </div>
  );
});
export default SceneView;
