import type { MapLayoutSettings, MapZoneStored, Station } from "./types";

export const DEFAULT_MAP_WIDTH = 640;
export const DEFAULT_MAP_HEIGHT = 480;

/** Bump when zone geometry changes to reset saved station positions */
export const LAYOUT_VERSION = 4;

/** Inset of the outer schematic frame — stations stay inside this area */
export const LAYOUT_PADDING = 8;

/** Compact map cards: name + color bar only */
export const STATION_CARD_WIDTH = 108;
export const STATION_CARD_HEIGHT = 28;

export const MIN_MAP_WIDTH = 400;
export const MIN_MAP_HEIGHT = 300;
export const MAX_MAP_WIDTH = 1200;
export const MAX_MAP_HEIGHT = 900;

export const MIN_ZONE_WIDTH = 60;
export const MIN_ZONE_HEIGHT = 40;
export const MIN_STATION_WIDTH = 72;
export const MIN_STATION_HEIGHT = 24;
export const MAX_STATION_WIDTH = 280;
export const MAX_STATION_HEIGHT = 120;

/** @deprecated Use DEFAULT_MAP_WIDTH */
export const MAP_WIDTH = DEFAULT_MAP_WIDTH;
/** @deprecated Use DEFAULT_MAP_HEIGHT */
export const MAP_HEIGHT = DEFAULT_MAP_HEIGHT;

export interface MapZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Station slugs that default to this zone */
  stationSlugs: string[];
  fill: string;
  stroke: string;
  labelColor: string;
}

type MapZoneDefaults = Omit<MapZone, "label"> & { label: string };

/** Schematic zones — defaults for background + placement */
const MAP_ZONE_DEFAULTS: MapZoneDefaults[] = [
  {
    id: "dining",
    label: "Dining Room",
    x: 16,
    y: 16,
    width: 280,
    height: 456,
    stationSlugs: [],
    fill: "#fafaf9",
    stroke: "#e7e5e4",
    labelColor: "#a8a29e",
  },
  {
    id: "kitchen-line",
    label: "Kitchen",
    x: 318,
    y: 16,
    width: 306,
    height: 148,
    stationSlugs: ["kitchen-line"],
    fill: "#fffbeb",
    stroke: "#fde68a",
    labelColor: "#b45309",
  },
  {
    id: "prep",
    label: "Prep",
    x: 318,
    y: 176,
    width: 148,
    height: 140,
    stationSlugs: ["prep-area"],
    fill: "#fffbeb",
    stroke: "#fde68a",
    labelColor: "#b45309",
  },
  {
    id: "dry-storage",
    label: "Storage",
    x: 476,
    y: 176,
    width: 148,
    height: 68,
    stationSlugs: ["storage"],
    fill: "#fafaf9",
    stroke: "#e7e5e4",
    labelColor: "#78716c",
  },
  {
    id: "dish-pit",
    label: "Dish",
    x: 476,
    y: 252,
    width: 148,
    height: 64,
    stationSlugs: ["dishwashing"],
    fill: "#eff6ff",
    stroke: "#bfdbfe",
    labelColor: "#1d4ed8",
  },
];

export const MAP_ZONES: MapZone[] = MAP_ZONE_DEFAULTS.map((zone) => ({ ...zone }));

const STYLE_BY_ID = new Map(
  MAP_ZONE_DEFAULTS.map((zone) => [
    zone.id,
    {
      stationSlugs: zone.stationSlugs,
      fill: zone.fill,
      stroke: zone.stroke,
      labelColor: zone.labelColor,
    },
  ])
);

export function getDefaultMapLayout(): MapLayoutSettings {
  return { width: DEFAULT_MAP_WIDTH, height: DEFAULT_MAP_HEIGHT };
}

export function getDefaultMapZoneLabels(): MapZoneStored[] {
  return MAP_ZONE_DEFAULTS.map((zone) => ({
    id: zone.id,
    name: zone.label,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
  }));
}

export function mergeMapLayout(stored?: MapLayoutSettings): MapLayoutSettings {
  const defaults = getDefaultMapLayout();
  if (!stored) return defaults;
  return {
    width: clampMapDimension(stored.width, MIN_MAP_WIDTH, MAX_MAP_WIDTH),
    height: clampMapDimension(stored.height, MIN_MAP_HEIGHT, MAX_MAP_HEIGHT),
  };
}

function clampMapDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function mergeMapZones(stored: MapZoneStored[]): MapZone[] {
  const layout = mergeMapLayout();

  return stored
    .filter(
      (zone) =>
        Number.isFinite(zone.width) &&
        Number.isFinite(zone.height) &&
        zone.width > 0 &&
        zone.height > 0
    )
    .map((saved) => {
      const defaults = MAP_ZONE_DEFAULTS.find((zone) => zone.id === saved.id);
      const style = STYLE_BY_ID.get(saved.id) ?? {
        stationSlugs: defaults?.stationSlugs ?? [],
        fill: defaults?.fill ?? "#f8fafc",
        stroke: defaults?.stroke ?? "#cbd5e1",
        labelColor: defaults?.labelColor ?? "#64748b",
      };
      const geometry = clampZoneGeometry(
        {
          x: saved.x,
          y: saved.y,
          width: saved.width,
          height: saved.height,
        },
        layout
      );

      return {
        id: saved.id,
        label: saved.name?.trim() || defaults?.label || "Zone",
        ...geometry,
        stationSlugs: style.stationSlugs,
        fill: style.fill,
        stroke: style.stroke,
        labelColor: style.labelColor,
      };
    });
}

export function getBohWallBounds(zones: MapZone[]): { x: number; width: number } {
  const dining = zones.find((zone) => zone.id === "dining");
  const wallX = dining ? dining.x + dining.width + 6 : 302;
  return { x: wallX, width: 14 };
}

export function getLayoutBounds(layout: MapLayoutSettings = getDefaultMapLayout()) {
  return {
    left: LAYOUT_PADDING,
    top: LAYOUT_PADDING,
    right: layout.width - LAYOUT_PADDING,
    bottom: layout.height - LAYOUT_PADDING,
  };
}

export function clampZoneGeometry(
  geometry: Pick<MapZone, "x" | "y" | "width" | "height">,
  layout: MapLayoutSettings = getDefaultMapLayout()
): Pick<MapZone, "x" | "y" | "width" | "height"> {
  const bounds = getLayoutBounds(layout);
  const maxWidth = bounds.right - bounds.left;
  const maxHeight = bounds.bottom - bounds.top;

  let width = Math.max(MIN_ZONE_WIDTH, Math.min(geometry.width, maxWidth));
  let height = Math.max(MIN_ZONE_HEIGHT, Math.min(geometry.height, maxHeight));
  let x = geometry.x;
  let y = geometry.y;

  x = Math.max(bounds.left, Math.min(x, bounds.right - width));
  y = Math.max(bounds.top, Math.min(y, bounds.bottom - height));

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function resizeZoneGeometry(
  origin: Pick<MapZone, "x" | "y" | "width" | "height">,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  layout: MapLayoutSettings = getDefaultMapLayout()
): Pick<MapZone, "x" | "y" | "width" | "height"> {
  let { x, y, width, height } = origin;

  if (edge.includes("e")) width += dx;
  if (edge.includes("w")) {
    x += dx;
    width -= dx;
  }
  if (edge.includes("s")) height += dy;
  if (edge.includes("n")) {
    y += dy;
    height -= dy;
  }

  if (width < MIN_ZONE_WIDTH) {
    if (edge.includes("w")) x -= MIN_ZONE_WIDTH - width;
    width = MIN_ZONE_WIDTH;
  }
  if (height < MIN_ZONE_HEIGHT) {
    if (edge.includes("n")) y -= MIN_ZONE_HEIGHT - height;
    height = MIN_ZONE_HEIGHT;
  }

  return clampZoneGeometry({ x, y, width, height }, layout);
}

export function resizeStationGeometry(
  origin: Pick<Station, "map_x" | "map_y" | "map_width" | "map_height">,
  dx: number,
  dy: number,
  layout: MapLayoutSettings = getDefaultMapLayout(),
  wall?: { x: number; width: number }
): Pick<Station, "map_x" | "map_y" | "map_width" | "map_height"> {
  const size = clampStationSize({
    map_width: origin.map_width + dx,
    map_height: origin.map_height + dy,
  });
  return clampStationLayout(
    {
      id: "",
      name: "",
      slug: "",
      color: "",
      ...origin,
      ...size,
    },
    layout,
    wall
  );
}

export function clampStationSize(
  station: Pick<Station, "map_width" | "map_height">
): Pick<Station, "map_width" | "map_height"> {
  return {
    map_width: Math.round(
      Math.max(MIN_STATION_WIDTH, Math.min(station.map_width, MAX_STATION_WIDTH))
    ),
    map_height: Math.round(
      Math.max(
        MIN_STATION_HEIGHT,
        Math.min(station.map_height, MAX_STATION_HEIGHT)
      )
    ),
  };
}

export function isStationOnMap(station: Station): boolean {
  return station.map_width > 0 && station.map_height > 0;
}

export function getZoneForSlug(slug: string, zones: MapZone[] = MAP_ZONES): MapZone | undefined {
  return zones.find((z) => z.stationSlugs.includes(slug));
}

export function getZoneAtPoint(
  cx: number,
  cy: number,
  zones: MapZone[] = MAP_ZONES
): MapZone | undefined {
  return zones.find(
    (z) => cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height
  );
}

function overlapsWall(
  station: Station,
  wall: { x: number; width: number }
): boolean {
  const left = station.map_x;
  const right = station.map_x + station.map_width;
  const wallLeft = wall.x;
  const wallRight = wall.x + wall.width;
  return left < wallRight && right > wallLeft;
}

const LABEL_HEIGHT = 22;

function centerInZone(
  zone: MapZone,
  width = STATION_CARD_WIDTH,
  height = STATION_CARD_HEIGHT
): Pick<Station, "map_x" | "map_y"> {
  const innerTop = zone.y + LABEL_HEIGHT;
  const innerHeight = zone.height - LABEL_HEIGHT;
  return {
    map_x: Math.round(zone.x + (zone.width - width) / 2),
    map_y: Math.round(innerTop + (innerHeight - height) / 2),
  };
}

export function getDefaultLayoutForStation(
  station: Station,
  zones: MapZone[] = MAP_ZONES
): Pick<Station, "map_x" | "map_y" | "map_width" | "map_height"> {
  const zone = getZoneForSlug(station.slug, zones);
  const size = {
    map_width: STATION_CARD_WIDTH,
    map_height: STATION_CARD_HEIGHT,
  };

  if (zone) {
    return { ...centerInZone(zone), ...size };
  }

  const fallback = zones.find((z) => z.id === "kitchen-line")!;
  return { ...centerInZone(fallback), ...size };
}

function pushAwayFromWall(
  map_x: number,
  width: number,
  bounds: ReturnType<typeof getLayoutBounds>,
  wall: { x: number; width: number }
): number {
  const left = map_x;
  const right = map_x + width;
  const wallLeft = wall.x;
  const wallRight = wall.x + wall.width;

  if (left >= wallRight || right <= wallLeft) return map_x;

  const pushLeft = wallLeft - width;
  const pushRight = wallRight;
  const distLeft = Math.abs(map_x - pushLeft);
  const distRight = Math.abs(map_x - pushRight);
  const pushed = distLeft <= distRight ? pushLeft : pushRight;

  return Math.max(bounds.left, Math.min(pushed, bounds.right - width));
}

export function clampStationPosition(
  station: Station,
  layout: MapLayoutSettings = getDefaultMapLayout(),
  wall?: { x: number; width: number }
): Pick<Station, "map_x" | "map_y"> {
  const bounds = getLayoutBounds(layout);
  const wallBounds = wall ?? { x: 302, width: 14 };
  let map_x = Math.max(
    bounds.left,
    Math.min(station.map_x, bounds.right - station.map_width)
  );
  const map_y = Math.max(
    bounds.top,
    Math.min(station.map_y, bounds.bottom - station.map_height)
  );

  map_x = pushAwayFromWall(map_x, station.map_width, bounds, wallBounds);

  return { map_x, map_y };
}

export function clampStationLayout(
  station: Station,
  layout: MapLayoutSettings = getDefaultMapLayout(),
  wall?: { x: number; width: number }
): Pick<Station, "map_x" | "map_y" | "map_width" | "map_height"> {
  const size = clampStationSize(station);
  const pos = clampStationPosition({ ...station, ...size }, layout, wall);
  return { ...size, ...pos };
}

export function defaultMapPlacement(
  station: Station,
  existing: Station[],
  zones: MapZone[] = MAP_ZONES,
  layout: MapLayoutSettings = getDefaultMapLayout()
): Pick<Station, "map_x" | "map_y" | "map_width" | "map_height"> {
  const zoneLayout = getDefaultLayoutForStation(station, zones);
  const onMap = existing.filter(isStationOnMap);
  const wall = getBohWallBounds(zones);

  let { map_x, map_y } = zoneLayout;
  const { map_width, map_height } = zoneLayout;

  for (let attempt = 0; attempt < 8; attempt++) {
    const overlap = onMap.some(
      (s) =>
        map_x < s.map_x + s.map_width &&
        map_x + map_width > s.map_x &&
        map_y < s.map_y + s.map_height &&
        map_y + map_height > s.map_y
    );
    if (!overlap) break;
    map_y += map_height + 6;
  }

  const clamped = clampStationPosition(
    {
      ...station,
      map_x,
      map_y,
      map_width,
      map_height,
    },
    layout,
    wall
  );

  return {
    ...clamped,
    map_width,
    map_height,
  };
}

function isOutsideLayoutBounds(
  station: Station,
  layout: MapLayoutSettings
): boolean {
  const bounds = getLayoutBounds(layout);
  return (
    station.map_x < bounds.left ||
    station.map_y < bounds.top ||
    station.map_x + station.map_width > bounds.right ||
    station.map_y + station.map_height > bounds.bottom
  );
}

export function isStationLayoutMisplaced(
  station: Station,
  layout: MapLayoutSettings = getDefaultMapLayout(),
  zones: MapZone[] = MAP_ZONES
): boolean {
  if (!isStationOnMap(station)) return false;
  const wall = getBohWallBounds(zones);
  if (overlapsWall(station, wall)) return true;
  if (isOutsideLayoutBounds(station, layout)) return true;
  return false;
}

export function isStationInNonAssignableZone(
  station: Station,
  zones: MapZone[] = MAP_ZONES
): boolean {
  if (!isStationOnMap(station)) return false;
  const cx = station.map_x + station.map_width / 2;
  const cy = station.map_y + station.map_height / 2;
  const zone = getZoneAtPoint(cx, cy, zones);
  return zone !== undefined && zone.stationSlugs.length === 0;
}

export function migrateStationLayouts(
  stations: Station[],
  zones: MapZone[] = MAP_ZONES,
  layout: MapLayoutSettings = getDefaultMapLayout()
): Station[] {
  let changed = false;
  const migrated = stations.map((station) => {
    if (!isStationOnMap(station)) return station;

    const needsResize =
      station.map_width > STATION_CARD_WIDTH + 20 ||
      station.map_height > STATION_CARD_HEIGHT + 10;

    if (
      !isStationLayoutMisplaced(station, layout, zones) &&
      !needsResize &&
      !isStationInNonAssignableZone(station, zones)
    ) {
      return station;
    }

    changed = true;
    return { ...station, ...getDefaultLayoutForStation(station, zones) };
  });

  return changed ? migrated : stations;
}

export function resetAllStationLayouts(
  stations: Station[],
  zones: MapZone[] = MAP_ZONES
): Station[] {
  return stations.map((station) => {
    if (!isStationOnMap(station)) return station;
    return { ...station, ...getDefaultLayoutForStation(station, zones) };
  });
}

export function migrateStoredMapZones(
  stored: MapZoneStored[] | undefined
): MapZoneStored[] {
  const defaults = getDefaultMapZoneLabels();
  if (!stored?.length) return defaults;

  const filtered = stored.filter(
    (zone) =>
      zone.id !== "cold-storage" &&
      Number.isFinite(zone.width) &&
      Number.isFinite(zone.height) &&
      zone.width > 0 &&
      zone.height > 0
  );

  if (filtered.length === 0) return defaults;

  return filtered.map((zone) => {
    const defaultZone = MAP_ZONE_DEFAULTS.find((item) => item.id === zone.id);
    const hasGeometry =
      Number.isFinite(zone.x) &&
      Number.isFinite(zone.y) &&
      Number.isFinite(zone.width) &&
      Number.isFinite(zone.height);

    if (!hasGeometry && defaultZone) {
      return {
        id: defaultZone.id,
        name: zone.name?.trim() || defaultZone.label,
        x: defaultZone.x,
        y: defaultZone.y,
        width: defaultZone.width,
        height: defaultZone.height,
      };
    }

    return {
      id: zone.id,
      name: zone.name?.trim() || defaultZone?.label || "Zone",
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
    };
  });
}
