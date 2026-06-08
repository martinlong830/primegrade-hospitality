"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSectionsForStation, formatSectionTimingSummary } from "@/lib/db";
import {
  MAX_MAP_HEIGHT,
  MAX_MAP_WIDTH,
  MIN_MAP_HEIGHT,
  MIN_MAP_WIDTH,
  clampStationLayout,
  clampZoneGeometry,
  defaultMapPlacement,
  getBohWallBounds,
  getDefaultMapLayout,
  getDefaultMapZoneLabels,
  isStationOnMap,
  mergeMapLayout,
  mergeMapZones,
  resizeStationGeometry,
  resizeZoneGeometry,
  type MapZone,
  type ResizeEdge,
} from "@/lib/mapConstants";
import type {
  MapLayoutSettings,
  MapZoneStored,
  Station,
  TaskSection,
} from "@/lib/types";

interface MapViewProps {
  stations: Station[];
  sections?: TaskSection[];
  mapZones?: MapZoneStored[];
  mapLayout?: MapLayoutSettings;
  editable?: boolean;
  onStationMove?: (station: Station) => void | Promise<void>;
  onStationAdd?: (station: Station) => void | Promise<void>;
  onStationCreate?: (name: string) => void | Promise<void>;
  onStationRemoveFromMap?: (station: Station) => void | Promise<void>;
  onResetLayout?: () => void | Promise<void>;
  onMapZoneRename?: (zone: Pick<MapZoneStored, "id" | "name">) => void | Promise<void>;
  onMapZoneResize?: (zone: MapZoneStored) => void | Promise<void>;
  onMapZoneDelete?: (zoneId: string) => void | Promise<void>;
  onMapLayoutChange?: (layout: MapLayoutSettings) => void | Promise<void>;
  onLayoutSaved?: () => void;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

interface StationResizeState {
  id: string;
  startX: number;
  startY: number;
  origin: Pick<Station, "map_x" | "map_y" | "map_width" | "map_height">;
}

interface ZoneResizeState {
  id: string;
  edge: ResizeEdge;
  startX: number;
  startY: number;
  origin: Pick<MapZone, "x" | "y" | "width" | "height">;
}

interface CanvasResizeState {
  startX: number;
  startY: number;
  originW: number;
  originH: number;
}

const RESIZE_HANDLE =
  "pointer-events-auto absolute z-40 touch-none border-0 bg-transparent shadow-none outline-none";

const ZONE_EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function edgeHandleClass(edge: ResizeEdge): string {
  const base = `${RESIZE_HANDLE} `;
  switch (edge) {
    case "n":
      return `${base} left-0 top-0 h-3 w-full cursor-ns-resize sm:h-2`;
    case "s":
      return `${base} bottom-0 left-0 h-3 w-full cursor-ns-resize sm:h-2`;
    case "e":
      return `${base} right-0 top-0 h-full w-3 cursor-ew-resize sm:w-2`;
    case "w":
      return `${base} left-0 top-0 h-full w-3 cursor-ew-resize sm:w-2`;
    case "ne":
      return `${base} right-0 top-0 h-5 w-5 cursor-ne-resize sm:h-3 sm:w-3`;
    case "nw":
      return `${base} left-0 top-0 h-5 w-5 cursor-nw-resize sm:h-3 sm:w-3`;
    case "se":
      return `${base} bottom-0 right-0 h-5 w-5 cursor-se-resize sm:h-3 sm:w-3`;
    case "sw":
      return `${base} bottom-0 left-0 h-5 w-5 cursor-sw-resize sm:h-3 sm:w-3`;
  }
}

function RestaurantSchematic({
  zones,
  layout,
  wall,
}: {
  zones: MapZone[];
  layout: MapLayoutSettings;
  wall: { x: number; width: number };
}) {
  const { width, height } = layout;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <rect x="0" y="0" width={width} height={height} fill="#f8fafc" />

      <rect
        x="8"
        y="8"
        width={width - 16}
        height={height - 16}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="1.5"
        rx="6"
      />

      {zones.map((zone) => (
        <rect
          key={zone.id}
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          fill={zone.fill}
          stroke={zone.stroke}
          strokeWidth="1"
          rx="4"
        />
      ))}

      <rect
        x={wall.x}
        y="16"
        width={wall.width}
        height={height - 32}
        fill="#94a3b8"
        rx="1"
      />

      <rect
        x={wall.x - 6}
        y="148"
        width="6"
        height="64"
        fill="#cbd5e1"
        rx="1"
      />

      <text x="24" y={height - 24} fill="#d6d3d1" fontSize="8">
        Entrance →
      </text>
    </svg>
  );
}

interface ZoneLabelProps {
  zone: MapZone;
  editable: boolean;
  canDelete: boolean;
  isEditing: boolean;
  editValue: string;
  onStartEdit: (zone: MapZone) => void;
  onEditChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ZoneLabel({
  zone,
  editable,
  canDelete,
  isEditing,
  editValue,
  onStartEdit,
  onEditChange,
  onSave,
  onCancel,
  onDelete,
}: ZoneLabelProps) {
  const labelSize =
    zone.width < 100 || zone.height < 48 ? "compact" : "normal";

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: zone.x,
        top: zone.y,
        width: zone.width,
        height: zone.height,
      }}
    >
      {isEditing ? (
        <div className="pointer-events-auto box-border flex h-full min-h-0 flex-col gap-1 overflow-hidden p-1">
          <input
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
            className="min-h-0 w-full min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm"
          />
          <div className="flex shrink-0 flex-wrap gap-1">
            <button
              type="button"
              onClick={onSave}
              className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-slate-800"
            >
              Save
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => editable && onStartEdit(zone)}
          disabled={!editable}
          className={`pointer-events-auto absolute left-1 top-1 max-w-[calc(100%-8px)] truncate text-left ${
            editable
              ? "cursor-pointer rounded px-1 py-0.5 hover:bg-white/60"
              : "cursor-default"
          }`}
          title={editable ? "Tap to rename zone" : undefined}
        >
          <span
            className={`block truncate font-medium tracking-wide text-slate-600 ${
              labelSize === "compact" ? "text-[9px]" : "text-[10px]"
            }`}
            style={{ color: editable ? undefined : zone.labelColor }}
          >
            {zone.label}
          </span>
        </button>
      )}
    </div>
  );
}

interface ZoneResizeOverlayProps {
  zone: MapZone;
  onPointerDown: (e: React.PointerEvent, zone: MapZone, edge: ResizeEdge) => void;
}

function ZoneResizeOverlay({ zone, onPointerDown }: ZoneResizeOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute z-[15]"
      style={{
        left: zone.x,
        top: zone.y,
        width: zone.width,
        height: zone.height,
      }}
    >
      {ZONE_EDGES.map((edge) => (
        <div
          key={edge}
          className={edgeHandleClass(edge)}
          onPointerDown={(e) => onPointerDown(e, zone, edge)}
        />
      ))}
    </div>
  );
}

interface StationZoneProps {
  station: Station;
  sectionNames: string[];
  editable: boolean;
  isDragging: boolean;
  isResizing: boolean;
  dragOffset: { x: number; y: number } | null;
  onPointerDown: (e: React.PointerEvent, station: Station) => void;
  onResizePointerDown: (e: React.PointerEvent, station: Station) => void;
  onRemove?: (station: Station) => void;
}

const StationZone = memo(function StationZone({
  station,
  sectionNames,
  editable,
  isDragging,
  isResizing,
  dragOffset,
  onPointerDown,
  onResizePointerDown,
  onRemove,
}: StationZoneProps) {
  const tooltip =
    sectionNames.length > 0
      ? sectionNames.join(" · ")
      : "No sections — add in Stations & Tasks";

  return (
    <div
      className={`group absolute select-none rounded-md shadow-sm ${
        editable
          ? "cursor-grab touch-none active:cursor-grabbing"
          : "cursor-default"
      } ${
        isDragging || isResizing ? "z-50 shadow-md" : "z-30"
      }`}
      style={{
        left: station.map_x,
        top: station.map_y,
        width: station.map_width,
        height: station.map_height,
        transform: dragOffset
          ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
          : undefined,
        willChange: isDragging ? "transform" : undefined,
        backgroundColor: station.color,
      }}
      title={tooltip}
      onPointerDown={(e) => editable && onPointerDown(e, station)}
    >
      <div className="flex h-full items-center justify-between gap-1 px-2">
        <span className="truncate text-[11px] font-semibold text-white">
          {station.name}
        </span>
        {editable && onRemove && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(station);
            }}
            className="shrink-0 rounded px-1 text-xs leading-none text-white/90 opacity-100 hover:bg-white/20 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
            title="Remove from layout"
          >
            ×
          </button>
        )}
      </div>

      {editable && (
        <div
          className={`${RESIZE_HANDLE} bottom-0 right-0 h-5 w-5 cursor-se-resize sm:h-3 sm:w-3`}
          onPointerDown={(e) => onResizePointerDown(e, station)}
        />
      )}

      {!isDragging && !isResizing && (
        <div className="pointer-events-none absolute left-1/2 top-full z-40 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
          {tooltip}
        </div>
      )}
    </div>
  );
});

function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

function clampCanvasSize(width: number, height: number): MapLayoutSettings {
  return {
    width: Math.round(Math.max(MIN_MAP_WIDTH, Math.min(width, MAX_MAP_WIDTH))),
    height: Math.round(
      Math.max(MIN_MAP_HEIGHT, Math.min(height, MAX_MAP_HEIGHT))
    ),
  };
}

export default function MapView({
  stations,
  sections = [],
  mapZones,
  mapLayout: mapLayoutProp,
  editable = false,
  onStationMove,
  onStationAdd,
  onStationCreate,
  onStationRemoveFromMap,
  onResetLayout,
  onMapZoneRename,
  onMapZoneResize,
  onMapZoneDelete,
  onMapLayoutChange,
  onLayoutSaved,
}: MapViewProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const dragRef = useRef<DragState | null>(null);
  const stationResizeRef = useRef<StationResizeState | null>(null);
  const zoneResizeRef = useRef<ZoneResizeState | null>(null);
  const canvasResizeRef = useRef<CanvasResizeState | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<Map<string, Station>>(new Map());
  const pendingZoneSaveRef = useRef<Map<string, MapZoneStored>>(new Map());
  const pendingLayoutSaveRef = useRef<MapLayoutSettings | null>(null);

  const [localStations, setLocalStations] = useState(stations);
  const [localLayout, setLocalLayout] = useState(() =>
    mergeMapLayout(mapLayoutProp ?? getDefaultMapLayout())
  );
  const [localZoneOverrides, setLocalZoneOverrides] = useState<
    Map<string, Pick<MapZone, "x" | "y" | "width" | "height">>
  >(new Map());

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingStationId, setResizingStationId] = useState<string | null>(
    null
  );
  const [resizingZoneId, setResizingZoneId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );
  const [newStationName, setNewStationName] = useState("");
  const [showAddStation, setShowAddStation] = useState(false);
  const addStationRef = useRef<HTMLDivElement>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [resetting, setResetting] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState("");
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const updateScale = () => {
      const available = outer.clientWidth;
      const next =
        available > 0
          ? Math.min(1, available / localLayout.width)
          : 1;
      scaleRef.current = next;
      setScale(next);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [localLayout.width]);

  const mergedZones = useMemo(
    () => mergeMapZones(mapZones ?? getDefaultMapZoneLabels()),
    [mapZones]
  );

  const zones = useMemo(() => {
    return mergedZones.map((zone) => {
      const override = localZoneOverrides.get(zone.id);
      if (!override) return zone;
      const clamped = clampZoneGeometry(override, localLayout);
      return { ...zone, ...clamped };
    });
  }, [mergedZones, localZoneOverrides, localLayout]);

  const wall = useMemo(() => getBohWallBounds(zones), [zones]);

  useEffect(() => {
    setLocalLayout(mergeMapLayout(mapLayoutProp ?? getDefaultMapLayout()));
  }, [mapLayoutProp]);

  useEffect(() => {
    setLocalStations((prev) => {
      const prevById = new Map(prev.map((s) => [s.id, s]));
      return stations.map((s) => {
        const existing = prevById.get(s.id);
        if (
          existing &&
          (draggingId === s.id ||
            resizingStationId === s.id ||
            pendingSaveRef.current.has(s.id))
        ) {
          return existing;
        }
        return s;
      });
    });
  }, [stations, draggingId, resizingStationId]);

  useEffect(() => {
    if (!showAddStation) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        addStationRef.current &&
        !addStationRef.current.contains(e.target as Node)
      ) {
        setShowAddStation(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAddStation]);

  useEffect(() => {
    if (resizingZoneId !== null) return;
    setLocalZoneOverrides(new Map());
  }, [mapZones, resizingZoneId]);

  useEffect(() => {
    if (localZoneOverrides.size === 0) return;
    setLocalZoneOverrides((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      let changed = false;
      for (const [id, geometry] of prev) {
        const clamped = clampZoneGeometry(geometry, localLayout);
        if (
          clamped.x !== geometry.x ||
          clamped.y !== geometry.y ||
          clamped.width !== geometry.width ||
          clamped.height !== geometry.height
        ) {
          next.set(id, clamped);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [localLayout, localZoneOverrides.size]);

  const sectionsByStation = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const station of localStations) {
      const names = getSectionsForStation(sections, station.id).map((section) => {
        const timing = formatSectionTimingSummary(section);
        return timing ? `${section.name} · ${timing}` : section.name;
      });
      map.set(station.id, names);
    }
    return map;
  }, [localStations, sections]);

  const onMapStations = useMemo(
    () => localStations.filter(isStationOnMap),
    [localStations]
  );

  const offMapStations = useMemo(
    () => localStations.filter((s) => !isStationOnMap(s)),
    [localStations]
  );

  const flushSaves = useCallback(async () => {
    const stationsToSave = [...pendingSaveRef.current.values()];
    const zonesToSave = [...pendingZoneSaveRef.current.values()];
    const layoutToSave = pendingLayoutSaveRef.current;
    const hasWork =
      stationsToSave.length > 0 ||
      zonesToSave.length > 0 ||
      layoutToSave !== null;

    if (!hasWork) return;

    setSaveStatus("saving");
    try {
      if (layoutToSave && onMapLayoutChange) {
        await onMapLayoutChange(layoutToSave);
        pendingLayoutSaveRef.current = null;
      }
      for (const zone of zonesToSave) {
        await onMapZoneResize?.(zone);
        pendingZoneSaveRef.current.delete(zone.id);
      }
      for (const station of stationsToSave) {
        await onStationMove?.(station);
        pendingSaveRef.current.delete(station.id);
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
      onLayoutSaved?.();
    } catch {
      setSaveStatus("idle");
    }
  }, [onLayoutSaved, onMapLayoutChange, onMapZoneResize, onStationMove]);

  const queueSave = useDebouncedCallback(flushSaves, 400);

  const getLatestStation = useCallback(
    (station: Station): Station =>
      pendingSaveRef.current.get(station.id) ?? station,
    []
  );

  const commitStationUpdate = useCallback(
    (stationId: string, updates: Partial<Station>) => {
      setLocalStations((prev) =>
        prev.map((s) => {
          if (s.id !== stationId) return s;
          const base = pendingSaveRef.current.get(stationId) ?? s;
          const merged = clampStationLayout(
            { ...base, ...updates },
            localLayout,
            wall
          );
          const updated = { ...base, ...merged };
          pendingSaveRef.current.set(stationId, updated);
          queueSave();
          return updated;
        })
      );
    },
    [localLayout, queueSave, wall]
  );

  const commitZoneGeometry = useCallback(
    (zoneId: string, geometry: Pick<MapZone, "x" | "y" | "width" | "height">) => {
      const clamped = clampZoneGeometry(geometry, localLayout);
      setLocalZoneOverrides((prev) => {
        const next = new Map(prev);
        next.set(zoneId, clamped);
        return next;
      });

      const base = mergedZones.find((z) => z.id === zoneId);
      if (base) {
        const stored: MapZoneStored = {
          id: zoneId,
          name: base.label,
          ...clamped,
        };
        pendingZoneSaveRef.current.set(zoneId, stored);
        queueSave();
      }
    },
    [localLayout, mergedZones, queueSave]
  );

  const commitLayoutSize = useCallback(
    (width: number, height: number) => {
      const next = clampCanvasSize(width, height);
      setLocalLayout(next);
      pendingLayoutSaveRef.current = next;
      queueSave();
    },
    [queueSave]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, station: Station) => {
      if (!editable || stationResizeRef.current) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      dragRef.current = {
        id: station.id,
        startX: e.clientX,
        startY: e.clientY,
        originX: station.map_x,
        originY: station.map_y,
        width: station.map_width,
        height: station.map_height,
      };
      setDraggingId(station.id);
      setDragOffset({ x: 0, y: 0 });
    },
    [editable]
  );

  const handleStationResizePointerDown = useCallback(
    (e: React.PointerEvent, station: Station) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const latest = getLatestStation(station);
      stationResizeRef.current = {
        id: station.id,
        startX: e.clientX,
        startY: e.clientY,
        origin: {
          map_x: latest.map_x,
          map_y: latest.map_y,
          map_width: latest.map_width,
          map_height: latest.map_height,
        },
      };
      setResizingStationId(station.id);
    },
    [editable, getLatestStation]
  );

  const handleZoneResizePointerDown = useCallback(
    (e: React.PointerEvent, zone: MapZone, edge: ResizeEdge) => {
      if (!editable || !onMapZoneResize) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      zoneResizeRef.current = {
        id: zone.id,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      };
      setResizingZoneId(zone.id);
    },
    [editable, onMapZoneResize]
  );

  const handleCanvasResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!editable || !onMapLayoutChange) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      canvasResizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originW: localLayout.width,
        originH: localLayout.height,
      };
    },
    [editable, localLayout.height, localLayout.width, onMapLayoutChange]
  );

  const mapDelta = useCallback((clientDx: number, clientDy: number) => {
    const factor = scaleRef.current || 1;
    return { dx: clientDx / factor, dy: clientDy / factor };
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const canvasResize = canvasResizeRef.current;
      if (canvasResize) {
        const { dx, dy } = mapDelta(
          e.clientX - canvasResize.startX,
          e.clientY - canvasResize.startY
        );
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const next = clampCanvasSize(
            canvasResize.originW + dx,
            canvasResize.originH + dy
          );
          setLocalLayout(next);
        });
        return;
      }

      const zoneResize = zoneResizeRef.current;
      if (zoneResize) {
        const { dx, dy } = mapDelta(
          e.clientX - zoneResize.startX,
          e.clientY - zoneResize.startY
        );
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const geometry = resizeZoneGeometry(
            zoneResize.origin,
            zoneResize.edge,
            dx,
            dy,
            localLayout
          );
          setLocalZoneOverrides((prev) => {
            const next = new Map(prev);
            next.set(zoneResize.id, geometry);
            return next;
          });
        });
        return;
      }

      const stationResize = stationResizeRef.current;
      if (stationResize) {
        const { dx, dy } = mapDelta(
          e.clientX - stationResize.startX,
          e.clientY - stationResize.startY
        );
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const geometry = resizeStationGeometry(
            stationResize.origin,
            dx,
            dy,
            localLayout,
            wall
          );
          setLocalStations((prev) =>
            prev.map((s) =>
              s.id === stationResize.id ? { ...s, ...geometry } : s
            )
          );
        });
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      const { dx, dy } = mapDelta(
        e.clientX - drag.startX,
        e.clientY - drag.startY
      );

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const clamped = clampStationLayout(
          {
            id: drag.id,
            name: "",
            slug: "",
            color: "",
            map_x: drag.originX + dx,
            map_y: drag.originY + dy,
            map_width: drag.width,
            map_height: drag.height,
          },
          localLayout,
          wall
        );

        setDragOffset({
          x: clamped.map_x - drag.originX,
          y: clamped.map_y - drag.originY,
        });
      });
    },
    [localLayout, mapDelta, wall]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const canvasResize = canvasResizeRef.current;
      if (canvasResize) {
        const { dx, dy } = mapDelta(
          e.clientX - canvasResize.startX,
          e.clientY - canvasResize.startY
        );
        commitLayoutSize(
          canvasResize.originW + dx,
          canvasResize.originH + dy
        );
        canvasResizeRef.current = null;
        return;
      }

      const zoneResize = zoneResizeRef.current;
      if (zoneResize) {
        const { dx, dy } = mapDelta(
          e.clientX - zoneResize.startX,
          e.clientY - zoneResize.startY
        );
        const geometry = resizeZoneGeometry(
          zoneResize.origin,
          zoneResize.edge,
          dx,
          dy,
          localLayout
        );
        commitZoneGeometry(zoneResize.id, geometry);
        zoneResizeRef.current = null;
        setResizingZoneId(null);
        return;
      }

      const stationResize = stationResizeRef.current;
      if (stationResize) {
        const { dx, dy } = mapDelta(
          e.clientX - stationResize.startX,
          e.clientY - stationResize.startY
        );
        const geometry = resizeStationGeometry(
          stationResize.origin,
          dx,
          dy,
          localLayout,
          wall
        );
        commitStationUpdate(stationResize.id, geometry);
        stationResizeRef.current = null;
        setResizingStationId(null);
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      const { dx, dy } = mapDelta(
        e.clientX - drag.startX,
        e.clientY - drag.startY
      );
      const clamped = clampStationLayout(
        {
          id: drag.id,
          name: "",
          slug: "",
          color: "",
          map_x: drag.originX + dx,
          map_y: drag.originY + dy,
          map_width: drag.width,
          map_height: drag.height,
        },
        localLayout,
        wall
      );

      commitStationUpdate(drag.id, clamped);
      dragRef.current = null;
      setDraggingId(null);
      setDragOffset(null);
    },
    [commitLayoutSize, commitStationUpdate, commitZoneGeometry, localLayout, mapDelta, wall]
  );

  const handlePlaceStation = async (station: Station) => {
    const placement = defaultMapPlacement(
      station,
      onMapStations,
      zones,
      localLayout
    );
    const updated = { ...station, ...placement };
    setLocalStations((prev) =>
      prev.map((s) => (s.id === station.id ? updated : s))
    );
    pendingSaveRef.current.set(station.id, updated);
    await onStationAdd?.(updated);
    setShowAddStation(false);
  };

  const handleCreateStation = async () => {
    const name = newStationName.trim();
    if (!name || !onStationCreate) return;
    await onStationCreate(name);
    setNewStationName("");
    setShowAddStation(false);
  };

  const handleRemoveFromMap = async (station: Station) => {
    const updated = {
      ...station,
      map_width: 0,
      map_height: 0,
      map_x: 0,
      map_y: 0,
    };
    setLocalStations((prev) =>
      prev.map((s) => (s.id === station.id ? updated : s))
    );
    await onStationRemoveFromMap?.(updated);
  };

  const handleResetLayout = async () => {
    if (!onResetLayout) return;
    setResetting(true);
    try {
      pendingSaveRef.current.clear();
      pendingZoneSaveRef.current.clear();
      pendingLayoutSaveRef.current = null;
      setLocalZoneOverrides(new Map());
      await onResetLayout();
    } finally {
      setResetting(false);
    }
  };

  const handleStartZoneEdit = useCallback((zone: MapZone) => {
    setEditingZoneId(zone.id);
    setEditZoneName(zone.label);
  }, []);

  const handleCancelZoneEdit = useCallback(() => {
    setEditingZoneId(null);
    setEditZoneName("");
  }, []);

  const handleSaveZoneEdit = useCallback(async () => {
    if (!editingZoneId || !onMapZoneRename) return;
    const trimmed = editZoneName.trim();
    if (!trimmed) return;

    await onMapZoneRename({ id: editingZoneId, name: trimmed });
    setEditingZoneId(null);
    setEditZoneName("");
  }, [editZoneName, editingZoneId, onMapZoneRename]);

  const handleDeleteZone = useCallback(async () => {
    if (!editingZoneId || !onMapZoneDelete) return;
    const zoneId = editingZoneId;
    setEditingZoneId(null);
    setEditZoneName("");
    setLocalZoneOverrides((prev) => {
      const next = new Map(prev);
      next.delete(zoneId);
      return next;
    });
    pendingZoneSaveRef.current.delete(zoneId);
    await onMapZoneDelete(zoneId);
  }, [editingZoneId, onMapZoneDelete]);

  const canEditZones = editable && Boolean(onMapZoneResize);
  const canEditCanvas = editable && Boolean(onMapLayoutChange);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {!editable && (
          <p className="text-sm text-slate-500">
            Restaurant floor plan with station zones.
          </p>
        )}
        {editable && (
          <div className="ml-auto flex items-center gap-2">
            {saveStatus === "saving" && (
              <span className="text-xs text-slate-400">Saving…</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-emerald-600">Saved</span>
            )}
            {onResetLayout && onMapStations.length > 0 && (
              <button
                type="button"
                onClick={handleResetLayout}
                disabled={resetting}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800 disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Reset layout"}
              </button>
            )}
            <div className="relative" ref={addStationRef}>
              <button
                type="button"
                onClick={() => setShowAddStation((v) => !v)}
                aria-label="Add station to map"
                aria-expanded={showAddStation}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-lg leading-none font-medium text-white hover:bg-emerald-700"
              >
                +
              </button>
              {showAddStation && (
                <div className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                  <h4 className="mb-3 text-sm font-medium text-slate-700">
                    Add to map
                  </h4>
                  {offMapStations.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Stations not on map
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {offMapStations.map((station) => (
                          <button
                            key={station.id}
                            type="button"
                            onClick={() => handlePlaceStation(station)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                          >
                            Place {station.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {onStationCreate && (
                    <div className="space-y-3">
                      <input
                        placeholder="New station name (e.g. Bar Area)"
                        value={newStationName}
                        onChange={(e) => setNewStationName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleCreateStation()
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleCreateStation}
                        disabled={!newStationName.trim()}
                        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Create &amp; place
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div ref={outerRef} className="w-full">
        <div
          style={{
            width: localLayout.width * scale,
            height: localLayout.height * scale,
          }}
        >
          <div
            ref={containerRef}
            className="relative touch-none overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm"
            style={{
              width: localLayout.width,
              height: localLayout.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
        <RestaurantSchematic zones={zones} layout={localLayout} wall={wall} />

        {canEditZones &&
          zones.map((zone) => (
            <ZoneResizeOverlay
              key={`resize-${zone.id}`}
              zone={zone}
              onPointerDown={handleZoneResizePointerDown}
            />
          ))}

        {zones.map((zone) => (
          <ZoneLabel
            key={`label-${zone.id}`}
            zone={zone}
            editable={editable && Boolean(onMapZoneRename)}
            canDelete={editable && Boolean(onMapZoneDelete)}
            isEditing={editingZoneId === zone.id}
            editValue={editZoneName}
            onStartEdit={handleStartZoneEdit}
            onEditChange={setEditZoneName}
            onSave={handleSaveZoneEdit}
            onCancel={handleCancelZoneEdit}
            onDelete={handleDeleteZone}
          />
        ))}

        {onMapStations.map((station) => (
          <StationZone
            key={station.id}
            station={station}
            sectionNames={sectionsByStation.get(station.id) ?? []}
            editable={editable}
            isDragging={draggingId === station.id}
            isResizing={resizingStationId === station.id}
            dragOffset={draggingId === station.id ? dragOffset : null}
            onPointerDown={handlePointerDown}
            onResizePointerDown={handleStationResizePointerDown}
            onRemove={editable ? handleRemoveFromMap : undefined}
          />
        ))}

        {canEditCanvas && (
          <div
            className={`${RESIZE_HANDLE} bottom-0 right-0 z-50 h-5 w-5 cursor-se-resize sm:h-4 sm:w-4`}
            title="Resize floor plan"
            onPointerDown={handleCanvasResizePointerDown}
          />
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
