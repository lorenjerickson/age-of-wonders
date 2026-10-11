import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@aow/ui";
import {
  terrainCellAddress,
  terrainCellIndex,
  terrainSolidTriangles,
  type IsometricTerrainVolume,
  type TerrainAddress,
  type TerrainPoint,
} from "@aow/common";
import type * as Three from "three";
import {
  TerrainMaterialLibrary,
  TERRAIN_MATERIALS,
  terrainTextureUvs,
  type TerrainTextureQuality,
} from "./terrainMaterials";
import {
  terrainSurfaceNormals,
  type TerrainNormalBatch,
} from "./terrainSurfaceNormals";
import { terrainOpeningGeometry } from "./terrainOpeningGeometry";
import {
  terrainPlaneAxis,
  type TerrainWorkPlane,
} from "./isometricEditorModel";

import {
  createSessionSurfacePicker,
  sessionClickWasDrag,
  terrainViewportFocus,
  type SessionViewportInteraction,
} from "./sessionViewportModel";

export interface IsometricViewportProps {
  /** Container and canvas sizing for embedded full-height Session maps. */
  className?: string;
  viewportClassName?: string;
  /** Full GM overview with real actor focus and declaration-only destination picking. */
  session?: SessionViewportInteraction;
  /** Full captured GM map reference; no authoring or gameplay actor is displayed. */
  overview?: boolean;
  volume: IsometricTerrainVolume;
  level: number;
  plane?: TerrainWorkPlane;
  textureQuality?: TerrainTextureQuality;
  slice: boolean;
  actor: TerrainPoint;
  selection: readonly TerrainAddress[];
  disabled: boolean;
  onStroke(
    start: TerrainAddress,
    end: TerrainAddress,
    mode: "replace" | "add" | "subtract",
  ): void;
}

/** GM terrain only: authoring preview or captured reference, never a participant projection. */
export function IsometricTerrainViewport(props: IsometricViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const runtime = useRef<{ update(): void; dispose(): void } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [textureStatus, setTextureStatus] = useState("");
  const [surfaceStatus, setSurfaceStatus] = useState("");
  useEffect(() => {
    latest.current = props;
    runtime.current?.update();
  }, [props]);
  useEffect(() => {
    let disposed = false;
    const element = host.current;
    if (!element) return;
    void import("three")
      .then((T) => {
        if (disposed) return;
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x19252e);
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        let materialQuality = latest.current.textureQuality ?? "balanced";
        let materials = new TerrainMaterialLibrary(
          T,
          renderer.capabilities.getMaxAnisotropy(),
          materialQuality,
          setTextureStatus,
          draw,
        );
        element.append(renderer.domElement);
        const scene = new T.Scene();
        const camera = new T.OrthographicCamera(-20, 20, 20, -20, 0.1, 1000);
        camera.up.set(0, 0, 1);
        scene.add(new T.AmbientLight(0xdceaff, 1.4));
        const sun = new T.DirectionalLight(0xffefcc, 2.5);
        sun.position.set(40, -25, 100);
        scene.add(sun);
        let terrain = new T.Group();
        scene.add(terrain);
        let azimuth = Math.PI / 4,
          elevation = Math.atan(1 / Math.sqrt(2)),
          span =
            latest.current.overview && !latest.current.session
              ? Math.min(
                  180,
                  Math.max(
                    24,
                    Math.max(
                      ...Object.values(latest.current.volume.dimensions),
                    ) * 2,
                  ),
                )
              : latest.current.session
                ? Math.max(
                    8,
                    Math.min(
                      24,
                      Math.max(
                        latest.current.volume.dimensions.x,
                        latest.current.volume.dimensions.y,
                      ) * 1.4,
                    ),
                  )
                : 24;
        const raycaster = new T.Raycaster(),
          ndc = new T.Vector2();
        let drag:
          | {
              button: number;
              pointerId: number;
              originX: number;
              originY: number;
              moved: boolean;
              touch: boolean;
              x: number;
              y: number;
              level: number;
              plane: TerrainWorkPlane;
              start?: TerrainAddress;
              end?: TerrainAddress;
              mode: "replace" | "add" | "subtract";
            }
          | undefined;
        let graphicsLost = false;
        let supportPicker = createSessionSurfacePicker(latest.current.volume);
        let sessionObjects = new T.Group();
        scene.add(sessionObjects);
        let actorObjects: Three.Sprite[] = [];
        let shownSession = "";
        let supportCycle = 0;
        let lastSupportClick: { x: number; y: number } | undefined;
        const disposeSession = () => {
          sessionObjects.traverse((object) => {
            if (object instanceof T.Sprite) {
              object.material.map?.dispose();
              object.material.dispose();
            } else if (object instanceof T.Mesh || object instanceof T.Line) {
              object.geometry.dispose();
              const list = Array.isArray(object.material)
                ? object.material
                : [object.material];
              list.forEach((material) => material.dispose());
            }
          });
          scene.remove(sessionObjects);
          actorObjects = [];
        };
        function updateSession() {
          const session = latest.current.session;
          const signature = JSON.stringify(
            session
              ? {
                  actors: session.actors,
                  focus: session.focusedActorId,
                  destination: session.pendingDestination,
                }
              : null,
          );
          if (signature === shownSession) return;
          drag = undefined;
          shownSession = signature;
          disposeSession();
          sessionObjects = new T.Group();
          scene.add(sessionObjects);
          if (!session) return;
          for (const entry of session.actors) {
            const focused = entry.id === session.focusedActorId;
            const canvas = document.createElement("canvas");
            canvas.width = 512;
            canvas.height = 192;
            const art = canvas.getContext("2d");
            if (!art) continue;
            art.fillStyle = focused ? "#ffda7a" : "#b9e7ed";
            art.beginPath();
            art.arc(256, 128, 48, 0, Math.PI * 2);
            art.fill();
            art.strokeStyle = "#19252e";
            art.lineWidth = 7;
            art.stroke();
            art.fillStyle = "#19252e";
            art.textAlign = "center";
            art.textBaseline = "middle";
            art.font = "bold 44px sans-serif";
            art.fillText(
              entry.name.trim().slice(0, 1).toUpperCase() || "?",
              256,
              130,
            );
            art.fillStyle = "rgba(15,23,42,0.94)";
            art.fillRect(6, 8, 500, 55);
            art.fillStyle = "#ffffff";
            art.font = "bold 34px sans-serif";
            const label =
              entry.name.length > 27
                ? `${entry.name.slice(0, 26)}…`
                : entry.name;
            art.fillText(label, 256, 37, 485);
            const map = new T.CanvasTexture(canvas);
            map.colorSpace = T.SRGBColorSpace;
            const material = new T.SpriteMaterial({
              map,
              depthTest: false,
              depthWrite: false,
            });
            const token = new T.Sprite(material);
            token.center.set(0.5, 0);
            token.scale.set(4, 1.5, 1);
            token.position.set(
              entry.position.x,
              entry.position.y,
              entry.position.z,
            );
            token.renderOrder = focused ? 14 : 12;
            token.userData.actorId = entry.id;
            sessionObjects.add(token);
            actorObjects.push(token);
            const foot = new T.Mesh(
              new T.RingGeometry(
                focused ? 0.34 : 0.24,
                focused ? 0.44 : 0.31,
                32,
              ),
              new T.MeshBasicMaterial({
                color: focused ? 0xffda7a : 0xb9e7ed,
                side: T.DoubleSide,
                depthTest: false,
                depthWrite: false,
              }),
            );
            foot.position.set(
              entry.position.x,
              entry.position.y,
              entry.position.z + 0.015,
            );
            foot.renderOrder = 11;
            sessionObjects.add(foot);
          }
          const focused = session.actors.find(
            (a) => a.id === session.focusedActorId,
          );
          if (session.pendingDestination && focused) {
            const point = session.pendingDestination;
            const pending = new T.Mesh(
              new T.RingGeometry(0.3, 0.4, 32),
              new T.MeshBasicMaterial({
                color: 0xffa64d,
                side: T.DoubleSide,
                depthTest: false,
                depthWrite: false,
              }),
            );
            pending.position.set(point.x, point.y, point.z + 0.025);
            pending.renderOrder = 15;
            sessionObjects.add(pending);
            const line = new T.Line(
              new T.BufferGeometry().setFromPoints([
                new T.Vector3(
                  focused.position.x,
                  focused.position.y,
                  focused.position.z + 0.025,
                ),
                new T.Vector3(point.x, point.y, point.z + 0.025),
              ]),
              new T.LineDashedMaterial({
                color: 0xffa64d,
                dashSize: 0.25,
                gapSize: 0.15,
                depthTest: false,
                depthWrite: false,
              }),
            );
            line.computeLineDistances();
            line.renderOrder = 15;
            sessionObjects.add(line);
          }
        }
        const cursorGeometry = new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1));
        const cursorMaterial = new T.LineBasicMaterial({
          color: 0xffda7a,
          depthTest: false,
        });
        const cursor = new T.LineSegments(cursorGeometry, cursorMaterial);
        cursor.renderOrder = 10;
        cursor.visible = false;
        scene.add(cursor);
        const gridPositions: number[] = [];
        for (let i = 0; i <= 100; i++)
          gridPositions.push(0, i, 0, 100, i, 0, i, 0, 0, i, 100, 0);
        const gridGeometry = new T.BufferGeometry();
        gridGeometry.setAttribute(
          "position",
          new T.Float32BufferAttribute(gridPositions, 3),
        );
        const gridMaterial = new T.LineBasicMaterial({
          color: 0x8cabb7,
          transparent: true,
          opacity: 0.22,
        });
        const grid = new T.LineSegments(gridGeometry, gridMaterial);
        scene.add(grid);
        const artwork = document.createElement("canvas");
        artwork.width = 64;
        artwork.height = 128;
        const art = artwork.getContext("2d")!;
        art.fillStyle = "#f7e0a0";
        art.beginPath();
        art.arc(32, 23, 13, 0, Math.PI * 2);
        art.fill();
        art.fillStyle = "#b5a8e3";
        art.fillRect(19, 39, 26, 48);
        art.fillRect(18, 83, 11, 35);
        art.fillRect(35, 83, 11, 35);
        const texture = new T.CanvasTexture(artwork);
        texture.colorSpace = T.SRGBColorSpace;
        const actorMaterial = new T.SpriteMaterial({
          map: texture,
          depthTest: false,
        });
        const actor = new T.Sprite(actorMaterial);
        actor.center.set(0.5, 0);
        actor.scale.set(1, 2, 1);
        actor.renderOrder = 9;
        scene.add(actor);
        const floorMarker = new T.Mesh(
          new T.RingGeometry(0.45, 0.55, 32),
          new T.MeshBasicMaterial({
            color: 0xffda7a,
            side: T.DoubleSide,
            depthTest: false,
          }),
        );
        floorMarker.renderOrder = 8;
        scene.add(floorMarker);
        const disposeGroup = (group: Three.Group) =>
          group.traverse((object) => {
            if (object instanceof T.Mesh) {
              object.geometry.dispose();
            }
          });
        function draw() {
          if (disposed || graphicsLost) return;
          const p = latest.current;
          const focusedActor = p.session?.actors.find(
            (actor) => actor.id === p.session?.focusedActorId,
          );
          const focus = terrainViewportFocus(p.actor, focusedActor?.position);
          const target = new T.Vector3(focus.x, focus.y, focus.z);
          const aspect =
            element!.clientWidth / Math.max(element!.clientHeight, 1);
          // Keep named tokens readable in screen pixels as the GM zooms.
          const tokenWidth = (span * 220) / Math.max(element!.clientHeight, 1);
          actorObjects.forEach((token) =>
            token.scale.set(tokenWidth, (tokenWidth * 192) / 512, 1),
          );
          camera.left = (-span * aspect) / 2;
          camera.right = (span * aspect) / 2;
          camera.top = span / 2;
          camera.bottom = -span / 2;
          camera.position
            .copy(target)
            .add(
              new T.Vector3(
                Math.cos(azimuth) * Math.cos(elevation),
                Math.sin(azimuth) * Math.cos(elevation),
                Math.sin(elevation),
              ).multiplyScalar(250),
            );
          camera.lookAt(target);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          renderer.render(scene, camera);
        }
        let shownSelection: readonly TerrainAddress[] | undefined;
        let shownVolume: IsometricTerrainVolume | undefined,
          shownLevel = -1,
          shownSlice = false;
        let shownPlane: TerrainWorkPlane | undefined;
        function update() {
          const p = latest.current;
          actor.visible = !p.overview && !p.session;
          floorMarker.visible = !p.overview && !p.session;
          grid.visible = !p.overview && !p.session;
          updateSession();
          if (materialQuality !== (p.textureQuality ?? "balanced")) {
            materials.dispose();
            materialQuality = p.textureQuality ?? "balanced";
            materials = new TerrainMaterialLibrary(
              T,
              renderer.capabilities.getMaxAnisotropy(),
              materialQuality,
              setTextureStatus,
              draw,
            );
            shownVolume = undefined;
          }
          if (
            drag &&
            ((p.session ? false : p.disabled) ||
              p.volume !== shownVolume ||
              p.level !== drag.level ||
              (p.plane ?? "xy") !== drag.plane)
          ) {
            drag = undefined;
            cursor.visible = false;
          }
          const plane = p.plane ?? "xy";
          const axis = terrainPlaneAxis(plane);
          grid.position.set(0, 0, 0);
          grid.position[axis] = p.level + 0.005;
          grid.rotation.set(
            plane === "xz" ? Math.PI / 2 : 0,
            plane === "yz" ? -Math.PI / 2 : 0,
            0,
          );
          grid.scale.set(
            p.volume.dimensions[plane === "yz" ? "z" : "x"] / 100,
            p.volume.dimensions[
              plane === "xy" ? "y" : plane === "xz" ? "z" : "y"
            ] / 100,
            1,
          );
          actor.position.set(p.actor.x + 0.5, p.actor.y + 0.5, p.actor.z);
          floorMarker.position.set(
            p.actor.x + 0.5,
            p.actor.y + 0.5,
            p.actor.z + 0.01,
          );
          if (
            p.selection !== shownSelection ||
            p.volume !== shownVolume ||
            p.slice !== shownSlice ||
            plane !== shownPlane ||
            (p.slice && p.level !== shownLevel)
          ) {
            supportPicker = createSessionSurfacePicker(p.volume);
            disposeGroup(terrain);
            scene.remove(terrain);
            terrain = new T.Group();
            scene.add(terrain);
            const index = terrainCellIndex(p.volume);
            const palette = new Map<
              string,
              (typeof p.volume.materials)[number]
            >(p.volume.materials.map((m) => [m.key, m]));
            const selected = new Set(
              p.selection.map((a) => `${a.x},${a.y},${a.z}`),
            );
            const solid = (x: number, y: number, z: number) => {
              if (p.slice && { x, y, z }[axis] > p.level) return false;
              const cell = index.get(`${x},${y},${z}`);
              return (
                cell &&
                !cell.opening &&
                palette.get(cell.materialKey)?.terrainType !==
                  "terrain:water" &&
                cell.shape.top.every((h) => h === 1)
              );
            };
            const shapeCache = new Map<
              string,
              ReturnType<typeof terrainSolidTriangles>
            >();
            const smooth = p.volume.chunks.some((chunk) =>
              chunk.cells.some((cell) => !!cell.smoothing),
            );
            const normalBatches: (TerrainNormalBatch & {
              geometry: Three.BufferGeometry;
            })[] = [];
            for (const chunk of p.volume.chunks) {
              const groups = new Map<string, number[]>();
              const weights = new Map<string, number[]>();
              for (const cell of chunk.cells) {
                const a = terrainCellAddress(chunk.address, cell.offset);
                if (p.slice && a[axis] > p.level) continue;
                const shapeKey = JSON.stringify(cell.opening ?? cell.shape);
                let triangles = shapeCache.get(shapeKey);
                if (!triangles) {
                  triangles = cell.opening
                    ? terrainOpeningGeometry(cell.opening).opaque
                    : terrainSolidTriangles(cell.shape);
                  shapeCache.set(shapeKey, triangles);
                }
                const groupKey = `${cell.materialKey}|${selected.has(`${a.x},${a.y},${a.z}`) ? "selected" : "normal"}|${cell.opening ? "opening" : "terrain"}`;
                if (
                  cell.opening?.kind === "window" &&
                  cell.opening.state === "closed"
                ) {
                  const glassKey = groupKey.replace(/opening$/, "glass");
                  const glass = groups.get(glassKey) ?? [];
                  for (const triangle of terrainOpeningGeometry(cell.opening)
                    .glass)
                    for (const v of triangle)
                      glass.push(a.x + v.x, a.y + v.y, a.z + v.z);
                  groups.set(glassKey, glass);
                }
                const positions = groups.get(groupKey) ?? [];
                groups.set(groupKey, positions);
                const strengths = weights.get(groupKey) ?? [];
                weights.set(groupKey, strengths);
                for (const triangle of triangles) {
                  let hidden = false;
                  for (const axis of ["x", "y", "z"] as const)
                    for (const side of [0, 1]) {
                      if (triangle.every((v) => v[axis] === side)) {
                        const adjacent = {
                          ...a,
                          [axis]: a[axis] + (side === 0 ? -1 : 1),
                        };
                        const neighbor = index.get(
                          `${adjacent.x},${adjacent.y},${adjacent.z}`,
                        );
                        const waterInterior =
                          palette.get(cell.materialKey)?.terrainType ===
                            "terrain:water" &&
                          neighbor &&
                          !neighbor.opening &&
                          palette.get(neighbor.materialKey)?.terrainType ===
                            "terrain:water" &&
                          neighbor.shape.top.every((h) => h === 1) &&
                          (!p.slice ||
                            adjacent[terrainPlaneAxis(plane)] <= p.level);
                        if (
                          solid(adjacent.x, adjacent.y, adjacent.z) ||
                          waterInterior
                        )
                          hidden = true;
                      }
                    }
                  if (!hidden)
                    for (const v of triangle) {
                      positions.push(a.x + v.x, a.y + v.y, a.z + v.z);
                      if (smooth) strengths.push(cell.smoothing ?? 0);
                    }
                }
              }
              for (const [groupKey, positions] of groups) {
                const [key, highlight, treatment] = groupKey.split("|");
                if (!positions.length) continue;
                const geometry = new T.BufferGeometry();
                geometry.setAttribute(
                  "position",
                  new T.Float32BufferAttribute(positions, 3),
                );
                geometry.computeVertexNormals();
                if (smooth && treatment === "terrain")
                  normalBatches.push({
                    positions,
                    strengths: weights.get(groupKey)!,
                    geometry,
                  });
                const reference = palette.get(key);
                const meters =
                  reference?.revision === 1
                    ? (TERRAIN_MATERIALS[reference.key]?.meters ?? 2)
                    : 2;
                geometry.setAttribute(
                  "uv",
                  new T.Float32BufferAttribute(
                    terrainTextureUvs(positions, meters),
                    2,
                  ),
                );
                const material = materials.get(
                  reference,
                  treatment,
                  highlight === "selected",
                );
                terrain.add(new T.Mesh(geometry, material));
              }
            }
            if (smooth)
              terrainSurfaceNormals(normalBatches).forEach((normals, i) => {
                normalBatches[i].geometry.setAttribute(
                  "normal",
                  new T.Float32BufferAttribute(normals, 3),
                );
              });
            shownSelection = p.selection;
            shownVolume = p.volume;
            shownLevel = p.level;
            shownSlice = p.slice;
            shownPlane = plane;
          }
          draw();
        }
        function setRay(event: PointerEvent) {
          const bounds = renderer.domElement.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return false;
          ndc.set(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            1 - ((event.clientY - bounds.top) / bounds.height) * 2,
          );
          raycaster.setFromCamera(ndc, camera);
          return true;
        }
        function sessionHit(event: PointerEvent) {
          if (!setRay(event)) return {};
          const actorHit = raycaster
            .intersectObjects(actorObjects, false)
            .find((hit) => {
              const uv = hit.uv;
              // Ignore transparent sprite margins so nearby ground remains pickable.
              return (
                uv &&
                ((uv.y > 0.66 && uv.x > 0.02 && uv.x < 0.98) ||
                  (uv.y < 0.62 && uv.y > 0.05 && Math.abs(uv.x - 0.5) < 0.12))
              );
            });
          if (actorHit)
            return { actorId: actorHit.object.userData.actorId as string };
          const supports = supportPicker(
            raycaster.intersectObjects(terrain.children, false).map((hit) => ({
              point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
              normalZ: hit.face?.normal.z ?? -1,
            })),
          );
          return {
            point: supports[supportCycle % Math.max(1, supports.length)],
            count: supports.length,
          };
        }
        function point(event: PointerEvent): TerrainAddress | undefined {
          const bounds = renderer.domElement.getBoundingClientRect();
          ndc.set(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            1 - ((event.clientY - bounds.top) / bounds.height) * 2,
          );
          raycaster.setFromCamera(ndc, camera);
          const axis = terrainPlaneAxis(
            drag?.plane ?? latest.current.plane ?? "xy",
          );
          const normal = new T.Vector3();
          normal[axis] = 1;
          const hit = raycaster.ray.intersectPlane(
            new T.Plane(normal, -(drag?.level ?? latest.current.level)),
            new T.Vector3(),
          );
          if (!hit) return;
          const address = {
            x: Math.floor(hit.x),
            y: Math.floor(hit.y),
            z: Math.floor(hit.z),
            [axis]: drag?.level ?? latest.current.level,
          };
          const d = latest.current.volume.dimensions;
          return address.x >= 0 &&
            address.y >= 0 &&
            address.x < d.x &&
            address.y < d.y &&
            address.z >= 0 &&
            address.z < d.z
            ? address
            : undefined;
        }
        function move(event: PointerEvent) {
          if (drag && drag.pointerId !== event.pointerId) return;
          if (
            drag &&
            sessionClickWasDrag(
              { x: drag.originX, y: drag.originY },
              { x: event.clientX, y: event.clientY },
            )
          )
            drag.moved = true;
          if (
            drag?.button === 2 ||
            (latest.current.session && drag?.touch && drag.moved)
          ) {
            azimuth -= (event.clientX - drag.x) * 0.008;
            elevation = Math.min(
              1.396,
              Math.max(0.175, elevation + (event.clientY - drag.y) * 0.008),
            );
            drag.x = event.clientX;
            drag.y = event.clientY;
            draw();
            return;
          }
          if (latest.current.session) {
            cursor.visible = false;
            if (
              !drag &&
              !latest.current.session.interactionDisabled &&
              !graphicsLost
            ) {
              const hit = sessionHit(event);
              setSurfaceStatus(
                hit.actorId
                  ? "Click to focus this actor."
                  : hit.point
                    ? `Candidate surface at ${Number(hit.point.z.toFixed(3))} grid units elevation${hit.count && hit.count > 1 ? "; Shift-click the same point to cycle overlapping surfaces" : ""}. Click to choose a destination for review.`
                    : "Point at an actor or an authored support surface.",
              );
            }
            draw();
            return;
          }
          const hit = point(event);
          cursor.visible =
            !!hit && !latest.current.disabled && !latest.current.overview;
          if (drag) drag.end = hit;
          if (hit) {
            const start = drag?.start ?? hit;
            cursor.position.set(
              (start.x + hit.x + 1) / 2,
              (start.y + hit.y + 1) / 2,
              (start.z + hit.z + 1) / 2,
            );
            cursor.scale.set(
              Math.abs(start.x - hit.x) + 1,
              Math.abs(start.y - hit.y) + 1,
              Math.abs(start.z - hit.z) + 1,
            );
          }
          draw();
        }
        function down(event: PointerEvent) {
          if (graphicsLost || (event.button !== 0 && event.button !== 2))
            return;
          if (
            drag ||
            ((latest.current.session
              ? false
              : latest.current.disabled && !latest.current.overview) &&
              event.button === 0)
          )
            return;
          event.preventDefault();
          element!.focus();
          renderer.domElement.setPointerCapture(event.pointerId);
          drag = {
            button:
              latest.current.overview && !latest.current.session
                ? 2
                : event.button,
            pointerId: event.pointerId,
            originX: event.clientX,
            originY: event.clientY,
            moved: false,
            touch: event.pointerType === "touch",
            x: event.clientX,
            y: event.clientY,
            level: latest.current.level,
            plane: latest.current.plane ?? "xy",
            start:
              event.button === 0 &&
              !latest.current.overview &&
              !latest.current.session
                ? point(event)
                : undefined,
            mode: event.altKey
              ? "subtract"
              : event.ctrlKey || event.metaKey
                ? "add"
                : "replace",
          };
          drag.end = drag.start;
          move(event);
        }
        function up(event: PointerEvent) {
          if (drag && drag.pointerId !== event.pointerId) return;
          const stroke = drag;
          if (latest.current.session) {
            drag = undefined;
            if (renderer.domElement.hasPointerCapture(event.pointerId))
              renderer.domElement.releasePointerCapture(event.pointerId);
            if (
              stroke?.button === 0 &&
              !stroke.moved &&
              !sessionClickWasDrag(
                { x: stroke.originX, y: stroke.originY },
                { x: event.clientX, y: event.clientY },
              ) &&
              !graphicsLost
            ) {
              if (
                event.shiftKey &&
                lastSupportClick &&
                !sessionClickWasDrag(lastSupportClick, {
                  x: event.clientX,
                  y: event.clientY,
                })
              )
                supportCycle += 1;
              else supportCycle = 0;
              lastSupportClick = { x: event.clientX, y: event.clientY };
              const hit = sessionHit(event);
              if (hit.actorId)
                latest.current.session.onActorSelect(hit.actorId);
              else if (hit.point && !latest.current.session.interactionDisabled)
                latest.current.session.onDestinationPick(hit.point);
            }
            draw();
            return;
          }
          if (stroke?.button === 0) stroke.end = point(event);
          drag = undefined;
          cursor.scale.set(1, 1, 1);
          if (renderer.domElement.hasPointerCapture(event.pointerId))
            renderer.domElement.releasePointerCapture(event.pointerId);
          if (
            stroke?.button === 0 &&
            stroke.start &&
            stroke.end &&
            !latest.current.disabled &&
            !latest.current.overview
          )
            latest.current.onStroke(stroke.start, stroke.end, stroke.mode);
          draw();
        }
        function cancel() {
          drag = undefined;
          cursor.visible = false;
          draw();
        }
        function wheel(event: WheelEvent) {
          event.preventDefault();
          span = Math.min(
            180,
            Math.max(4, span * Math.exp(event.deltaY * 0.001)),
          );
          draw();
        }
        function context(event: Event) {
          event.preventDefault();
        }
        function key(event: KeyboardEvent) {
          if (event.key === "Escape") {
            cancel();
            return;
          }
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
              "0",
            ].includes(event.key)
          )
            return;
          event.preventDefault();
          if (event.key === "ArrowLeft") azimuth += 0.1;
          if (event.key === "ArrowRight") azimuth -= 0.1;
          if (event.key === "ArrowUp")
            elevation = Math.min(1.396, elevation + 0.05);
          if (event.key === "ArrowDown")
            elevation = Math.max(0.175, elevation - 0.05);
          if (event.key === "+" || event.key === "=")
            span = Math.max(4, span / 1.1);
          if (event.key === "-") span = Math.min(180, span * 1.1);
          if (event.key === "0") {
            azimuth = Math.PI / 4;
            elevation = Math.atan(1 / Math.sqrt(2));
            span =
              latest.current.overview && !latest.current.session
                ? Math.min(
                    180,
                    Math.max(
                      24,
                      Math.max(
                        ...Object.values(latest.current.volume.dimensions),
                      ) * 2,
                    ),
                  )
                : latest.current.session
                  ? Math.max(
                      8,
                      Math.min(
                        24,
                        Math.max(
                          latest.current.volume.dimensions.x,
                          latest.current.volume.dimensions.y,
                        ) * 1.4,
                      ),
                    )
                  : 24;
          }
          draw();
        }
        const canvas = renderer.domElement;
        canvas.addEventListener("pointerdown", down);
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", cancel);
        canvas.addEventListener("lostpointercapture", cancel);
        canvas.addEventListener("contextmenu", context);
        canvas.addEventListener("wheel", wheel, { passive: false });
        element.addEventListener("keydown", key);
        window.addEventListener("blur", cancel);
        const lost = (event: Event) => {
          event.preventDefault();
          graphicsLost = true;
          drag = undefined;
          setError(
            latest.current.overview
              ? "The map reference lost its graphics context. Retry to reopen it."
              : "The terrain view lost its graphics context. Your edits are still available.",
          );
        };
        canvas.addEventListener("webglcontextlost", lost);
        const resize = new ResizeObserver(() => {
          renderer.setSize(element.clientWidth, element.clientHeight);
          draw();
        });
        resize.observe(element);
        runtime.current = {
          update,
          dispose: () => {
            resize.disconnect();
            element.removeEventListener("keydown", key);
            window.removeEventListener("blur", cancel);
            canvas.removeEventListener("webglcontextlost", lost);
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("pointercancel", cancel);
            canvas.removeEventListener("lostpointercapture", cancel);
            canvas.removeEventListener("contextmenu", context);
            canvas.removeEventListener("wheel", wheel);
            disposeSession();
            disposeGroup(terrain);
            materials.dispose();
            cursorGeometry.dispose();
            cursorMaterial.dispose();
            gridGeometry.dispose();
            gridMaterial.dispose();
            floorMarker.geometry.dispose();
            floorMarker.material.dispose();
            texture.dispose();
            actorMaterial.dispose();
            renderer.dispose();
            canvas.remove();
          },
        };
        update();
      })
      .catch(() => {
        if (!disposed)
          setError(
            "The terrain view could not start. Check that hardware graphics are enabled, then retry.",
          );
      });
    return () => {
      disposed = true;
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, [retry]);
  return (
    <div className={props.className}>
      {error && (
        <Alert tone="warning">
          {error}{" "}
          <Button
            type="button"
            tone="outline"
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            Retry view
          </Button>
        </Alert>
      )}
      <div
        ref={host}
        tabIndex={0}
        aria-label={
          props.session
            ? "GM Session map. Click an actor to focus; click a support surface to propose movement. Right drag or touch drag or arrow keys orbit. Plus and minus zoom; zero resets."
            : props.overview
              ? "Captured terrain reference. Drag or arrow keys to orbit, plus and minus to zoom, zero to reset."
              : "Isometric terrain editor. Right drag to orbit; left drag edits the work plane. Arrow keys orbit, plus and minus zoom, zero resets view."
        }
        className={`${props.viewportClassName ?? "h-[32rem]"} w-full touch-none overflow-hidden rounded-box bg-slate-900 outline-offset-2`}
      />
      <p role="status" className="mt-2 text-sm opacity-70">
        {textureStatus}
      </p>
      {props.session && (
        <p role="status" className="mt-2 text-sm opacity-70">
          {props.session.interactionDisabled
            ? "Movement picking is unavailable while paused, refreshing, or awaiting a decision. Actor focus and camera orbit remain available."
            : surfaceStatus ||
              "Choose an actor, then click an authored terrain surface to propose movement."}
        </p>
      )}
      {textureStatus.includes("unavailable") && (
        <Button tone="outline" onClick={() => setRetry((n) => n + 1)}>
          Retry textures
        </Button>
      )}
      <p className="mt-2 text-sm opacity-70">
        {props.session
          ? "GM overview · Real actor positions · Click an actor to focus · Click terrain to choose a destination · Shift-click to cycle overlapping surfaces · Right/touch drag to orbit · Dashed line is a declaration, not an approved route"
          : props.overview
            ? "Captured map reference · Drag or arrow keys to orbit · Scroll or plus/minus to zoom · Zero resets the view"
            : "Focused on Preview actor · Right drag to pivot · Scroll to zoom · Left drag on the work plane · Esc cancels"}
      </p>
    </div>
  );
}
