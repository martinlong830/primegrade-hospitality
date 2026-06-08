import {
  defaultMapPlacement,
  getDefaultMapLayout,
  getDefaultMapZoneLabels,
  LAYOUT_VERSION,
  mergeMapLayout,
  mergeMapZones,
  migrateStoredMapZones,
  resetAllStationLayouts,
} from "./mapConstants";
import { DEFAULT_DATA } from "./seed";
import {
  COMPLETION_FUTURE_DAYS,
  COMPLETION_HISTORY_DAYS,
  addDays,
  getToday,
} from "./dates";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  AppData,
  MapLayoutSettings,
  MapZoneStored,
  Station,
  Task,
  TaskCompletion,
  TaskSection,
  User,
} from "./types";
import { DEFAULT_SECTION_TIMING } from "./types";

const STORAGE_KEY = "doh-inspection-data";
const LAYOUT_VERSION_KEY = "doh-layout-version";
const SECTION_TIMING_VERSION_KEY = "doh-section-timing-version";
const SECTION_TIMING_VERSION = 2;

function today(): string {
  return getToday();
}

type LegacyShift = "opening" | "during_service" | "closing";

interface LegacyTimeGroup {
  id: string;
  name: string;
  time?: string;
  due_window_minutes?: number;
  sort_order: number;
}

interface LegacyTask {
  shift?: LegacyShift;
  time_group_ids?: string[];
  section_id?: string | null;
  timing_notes?: string;
  recurrence?: string;
  interval_minutes?: number | null;
}

interface LegacyAppData {
  users: User[];
  stations: Station[];
  tasks: (Task & LegacyTask)[];
  sections?: TaskSection[];
  time_groups?: LegacyTimeGroup[];
  completions: TaskCompletion[];
  mapZones?: MapZoneStored[];
  mapLayout?: MapLayoutSettings;
}

type SectionTimingDefaults = Pick<
  TaskSection,
  "name" | "time" | "recurrence" | "interval_minutes" | "due_window_minutes"
>;

/** Legacy section names → neutral name + default timing metadata */
const LEGACY_SECTION_TIMING: Record<string, SectionTimingDefaults> = {
  Opening: {
    name: "Pre-Service",
    time: "06:00",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: 60,
  },
  "Opening Checks": {
    name: "Pre-Service",
    time: "06:00",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: 60,
  },
  "Pre-Open": {
    name: "Pre-Service",
    time: "06:30",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: 60,
  },
  "Pre-Open Checks": {
    name: "Pre-Service",
    time: "06:30",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: 60,
  },
  "Mid-Service": {
    name: "Service Hours",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: null,
  },
  "Mid Service": {
    name: "Service Hours",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: null,
  },
  "Mid-Service Checks": {
    name: "Service Hours",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: null,
  },
  "During Service": {
    name: "Service Hours",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: null,
  },
  Closing: {
    name: "End of Day",
    time: "22:00",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: 90,
  },
  "Closing Checks": {
    name: "End of Day",
    time: "22:00",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: 90,
  },
  "End of Day Checks": {
    name: "End of Day",
    time: "22:00",
    recurrence: "daily_once",
    interval_minutes: null,
    due_window_minutes: 90,
  },
  "Temperature Monitoring": {
    name: "Temperature Monitoring",
    recurrence: "interval",
    interval_minutes: 120,
    due_window_minutes: 30,
  },
};

function normalizeLegacySectionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const LEGACY_SECTION_LOOKUP = new Map<string, SectionTimingDefaults>(
  Object.entries(LEGACY_SECTION_TIMING).map(([key, value]) => [
    normalizeLegacySectionName(key),
    value,
  ])
);

function lookupLegacySectionTiming(name: string): SectionTimingDefaults | null {
  return LEGACY_SECTION_LOOKUP.get(normalizeLegacySectionName(name)) ?? null;
}

function sectionNeedsTimingMigration(section: TaskSection): boolean {
  const legacy = lookupLegacySectionTiming(section.name);
  if (!legacy) return false;
  if (legacy.name !== section.name) return true;
  if (legacy.time && section.time !== legacy.time) return true;
  if (legacy.recurrence && section.recurrence !== legacy.recurrence) return true;
  if (
    legacy.interval_minutes != null &&
    section.interval_minutes !== legacy.interval_minutes
  ) {
    return true;
  }
  if (
    legacy.due_window_minutes != null &&
    section.due_window_minutes !== legacy.due_window_minutes
  ) {
    return true;
  }
  return false;
}

function sectionsNeedTimingMigration(sections: TaskSection[]): boolean {
  return sections.some(sectionNeedsTimingMigration);
}

function normalizeSection(section: TaskSection): TaskSection {
  return {
    ...section,
    recurrence: section.recurrence ?? DEFAULT_SECTION_TIMING.recurrence,
    interval_minutes: section.interval_minutes ?? DEFAULT_SECTION_TIMING.interval_minutes,
    due_window_minutes:
      section.due_window_minutes ?? DEFAULT_SECTION_TIMING.due_window_minutes,
  };
}

function applyLegacySectionTiming(section: TaskSection): TaskSection {
  const legacy = lookupLegacySectionTiming(section.name);
  if (!legacy) return normalizeSection(section);

  return normalizeSection({
    ...section,
    ...legacy,
  });
}

function sectionsEqual(a: TaskSection, b: TaskSection): boolean {
  return (
    a.name === b.name &&
    a.time === b.time &&
    a.recurrence === b.recurrence &&
    a.interval_minutes === b.interval_minutes &&
    a.due_window_minutes === b.due_window_minutes
  );
}

function migrateSectionTiming(sections: TaskSection[]): TaskSection[] {
  return sections.map(applyLegacySectionTiming);
}

function stripLegacyTaskFields(t: Task & LegacyTask): Task {
  return {
    id: t.id,
    station_id: t.station_id,
    section_id: t.section_id ?? null,
    title: t.title,
    description: t.description,
    timing_notes: t.timing_notes ?? "",
    recurrence: (t.recurrence as Task["recurrence"]) ?? "daily_once",
    interval_minutes: t.interval_minutes ?? null,
    assigned_user_id: t.assigned_user_id,
    sort_order: t.sort_order,
  };
}

function sectionKey(stationId: string, name: string): string {
  return `${stationId}::${name}`;
}

function migrateFromTimeGroups(raw: LegacyAppData): AppData {
  const timeGroups = raw.time_groups ?? [];
  const groupById = new Map(timeGroups.map((g) => [g.id, g]));
  const sectionByKey = new Map<string, TaskSection>();
  const sections: TaskSection[] = [];
  let sectionOrder = 1;

  const ensureSection = (stationId: string, name: string, group?: LegacyTimeGroup): TaskSection => {
    const key = sectionKey(stationId, name);
    const existing = sectionByKey.get(key);
    if (existing) return existing;

    const base: TaskSection = {
      id: `section-${crypto.randomUUID().slice(0, 8)}`,
      station_id: stationId,
      name,
      sort_order: sectionOrder++,
      ...DEFAULT_SECTION_TIMING,
    };

    if (group?.time) base.time = group.time;
    if (group?.due_window_minutes != null) {
      base.due_window_minutes = group.due_window_minutes;
    }

    const section = applyLegacySectionTiming(base);
    sectionByKey.set(key, section);
    sections.push(section);
    return section;
  };

  const tasks: Task[] = raw.tasks.map((t) => {
    const base = stripLegacyTaskFields(t);

    if (t.section_id !== undefined && t.section_id !== null) {
      return base;
    }

    if (t.time_group_ids && t.time_group_ids.length > 0) {
      const groupId = t.time_group_ids[0];
      const group = groupById.get(groupId);
      const name = group?.name ?? "General";
      const section = ensureSection(t.station_id, name, group);
      return { ...base, section_id: section.id };
    }

    if (t.shift) {
      const shiftNames: Record<LegacyShift, string> = {
        opening: "Pre-Service",
        during_service: "Service Hours",
        closing: "End of Day",
      };
      const name = shiftNames[t.shift];
      const section = ensureSection(t.station_id, name);
      return { ...base, section_id: section.id };
    }

    return base;
  });

  for (const station of raw.stations) {
    const stationSections = sections.filter((s) => s.station_id === station.id);
    stationSections.sort((a, b) => a.sort_order - b.sort_order);
    stationSections.forEach((s, i) => {
      s.sort_order = i + 1;
    });
  }

  return {
    users: raw.users,
    stations: raw.stations,
    sections,
    tasks,
    completions: raw.completions,
    mapZones: migrateStoredMapZones(raw.mapZones),
    mapLayout: raw.mapLayout ?? getDefaultMapLayout(),
  };
}

function migrateLegacyData(raw: LegacyAppData): AppData {
  if (raw.sections && raw.sections.length > 0) {
    const tasks = raw.tasks.map(stripLegacyTaskFields);
    return {
      users: raw.users,
      stations: raw.stations,
      sections: migrateSectionTiming(raw.sections.map(normalizeSection)),
      tasks,
      completions: raw.completions,
      mapZones: migrateStoredMapZones(raw.mapZones),
      mapLayout: raw.mapLayout ?? getDefaultMapLayout(),
    };
  }

  if (raw.time_groups && raw.time_groups.length > 0) {
    return migrateFromTimeGroups(raw);
  }

  return structuredClone(DEFAULT_DATA);
}

function applySectionTimingMigration(data: AppData): AppData {
  const normalizedSections = data.sections.map(normalizeSection);
  const storedVersion =
    typeof window !== "undefined"
      ? localStorage.getItem(SECTION_TIMING_VERSION_KEY)
      : null;
  const versionCurrent = storedVersion === String(SECTION_TIMING_VERSION);
  const needsMigration =
    !versionCurrent || sectionsNeedTimingMigration(normalizedSections);

  if (!needsMigration) {
    return { ...data, sections: normalizedSections };
  }

  const sections = migrateSectionTiming(normalizedSections);
  const stillLegacy = sectionsNeedTimingMigration(sections);

  if (typeof window !== "undefined") {
    if (stillLegacy) {
      localStorage.removeItem(SECTION_TIMING_VERSION_KEY);
    } else {
      localStorage.setItem(
        SECTION_TIMING_VERSION_KEY,
        String(SECTION_TIMING_VERSION)
      );
    }
  }

  return { ...data, sections };
}

function persistSectionTimingIfChanged(before: AppData, after: AppData): void {
  if (typeof window === "undefined") return;
  const beforeById = new Map(before.sections.map((section) => [section.id, section]));
  const changed = after.sections.some((section) => {
    const previous = beforeById.get(section.id);
    return !previous || !sectionsEqual(section, previous);
  });
  if (changed) {
    saveLocal(after);
  }
}

async function persistMigratedSections(sections: TaskSection[]): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = getSupabase();
  if (!supabase) return;
  for (const section of sections) {
    await supabase.from("task_sections").upsert(normalizeSection(section));
  }
}

function loadMapZonesFromLocal(): MapZoneStored[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return parsed.mapZones?.length ? parsed.mapZones : null;
  } catch {
    return null;
  }
}

function loadMapLayoutFromLocal(): MapLayoutSettings | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return parsed.mapLayout ?? null;
  } catch {
    return null;
  }
}

function ensureMapLayout(data: AppData): AppData {
  const mapLayout = mergeMapLayout(
    data.mapLayout ?? loadMapLayoutFromLocal() ?? getDefaultMapLayout()
  );
  return { ...data, mapLayout };
}

function ensureMapZones(data: AppData): AppData {
  const defaults = getDefaultMapZoneLabels();
  const source =
    data.mapZones?.length ? data.mapZones : loadMapZonesFromLocal();

  if (!source || source.length === 0) {
    return { ...data, mapZones: defaults };
  }

  return { ...data, mapZones: migrateStoredMapZones(source) };
}

function applyLayoutMigration(data: AppData): AppData {
  const withTiming = applySectionTimingMigration(data);
  const withLayout = ensureMapLayout(ensureMapZones(withTiming));
  const zones = mergeMapZones(withLayout.mapZones);

  if (typeof window === "undefined") return withLayout;

  const storedLayoutVersion = localStorage.getItem(LAYOUT_VERSION_KEY);
  let stations = withLayout.stations;

  if (storedLayoutVersion !== String(LAYOUT_VERSION)) {
    stations = resetAllStationLayouts(stations, zones);
    localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
  }

  if (stations === withLayout.stations) return withLayout;
  return { ...withLayout, stations };
}

function loadLocal(): AppData {
  if (typeof window === "undefined") return DEFAULT_DATA;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = applyLayoutMigration(structuredClone(DEFAULT_DATA));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const parsed = JSON.parse(raw) as LegacyAppData;
  const migrated = applyLayoutMigration(migrateLegacyData(parsed));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

async function persistMigratedStations(stations: Station[]): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      for (const station of stations) {
        await supabase.from("stations").upsert(station);
      }
    }
  }
}

function saveLocal(data: AppData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function fetchSupabaseData(): Promise<AppData | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const rangeFrom = addDays(today(), -COMPLETION_HISTORY_DAYS);
  const rangeTo = addDays(today(), COMPLETION_FUTURE_DAYS);

  const [users, stations, sections, tasks, completions, mapZones, mapLayout] =
    await Promise.all([
      supabase.from("users").select("*"),
      supabase.from("stations").select("*"),
      supabase.from("task_sections").select("*").order("sort_order"),
      supabase.from("tasks").select("*").order("sort_order"),
      supabase
        .from("task_completions")
        .select("*")
        .gte("date", rangeFrom)
        .lte("date", rangeTo),
      supabase.from("map_zones").select("*"),
      supabase.from("map_layout").select("*").eq("id", "default").maybeSingle(),
    ]);

  if (users.error || stations.error || sections.error || tasks.error) {
    console.warn("Supabase fetch failed, using local storage", {
      users: users.error,
      stations: stations.error,
      sections: sections.error,
      tasks: tasks.error,
    });
    return null;
  }

  if (mapZones.error?.code === "PGRST205" || mapLayout.error?.code === "PGRST205") {
    console.warn("Map tables missing in Supabase — run supabase/schema.sql");
  }

  const layoutRow = mapLayout.data as { width: number; height: number } | null;
  const zoneRows = (mapZones.data ?? []) as MapZoneStored[];

  return {
    users: users.data as User[],
    stations: stations.data as Station[],
    sections: (sections.data ?? []).map((s) => normalizeSection(s as TaskSection)),
    tasks: (tasks.data ?? []).map((t) => ({
      ...(t as Task),
      section_id: (t as Task).section_id ?? null,
      timing_notes: (t as Task).timing_notes ?? "",
      recurrence: (t as Task).recurrence ?? "daily_once",
      interval_minutes: (t as Task).interval_minutes ?? null,
    })),
    completions: (completions.data ?? []) as TaskCompletion[],
    mapZones: zoneRows.length ? zoneRows : getDefaultMapZoneLabels(),
    mapLayout: layoutRow
      ? { width: layoutRow.width, height: layoutRow.height }
      : getDefaultMapLayout(),
  };
}

async function persistMapZones(mapZones: MapZoneStored[]): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = getSupabase();
  if (!supabase) return;
  for (const zone of mapZones) {
    await supabase.from("map_zones").upsert(zone);
  }
}

async function persistMapLayout(mapLayout: MapLayoutSettings): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("map_layout").upsert({
    id: "default",
    width: mapLayout.width,
    height: mapLayout.height,
  });
}

function mergeCompletions(
  existing: TaskCompletion[],
  incoming: TaskCompletion[]
): TaskCompletion[] {
  const byKey = new Map<string, TaskCompletion>();
  for (const c of existing) {
    byKey.set(`${c.task_id}:${c.date}`, c);
  }
  for (const c of incoming) {
    byKey.set(`${c.task_id}:${c.date}`, c);
  }
  return Array.from(byKey.values());
}

function cacheLocally(data: AppData): void {
  const local = loadLocalRaw();
  const merged = local
    ? { ...data, completions: mergeCompletions(local.completions, data.completions) }
    : data;
  saveLocal(merged);
}

function loadLocalRaw(): AppData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LegacyAppData;
    return applyLayoutMigration(migrateLegacyData(parsed));
  } catch {
    return null;
  }
}

export async function getAppData(): Promise<AppData> {
  if (isSupabaseConfigured) {
    const remote = await fetchSupabaseData();
    if (remote) {
      const migrated = applyLayoutMigration(remote);
      const local = loadLocalRaw();
      const withCompletions = local
        ? {
            ...migrated,
            completions: mergeCompletions(
              local.completions,
              migrated.completions
            ),
          }
        : migrated;
      persistSectionTimingIfChanged(remote, withCompletions);
      if (withCompletions.stations !== remote.stations) {
        await persistMigratedStations(withCompletions.stations);
      }
      if (withCompletions.sections !== remote.sections) {
        await persistMigratedSections(withCompletions.sections);
      }
      cacheLocally(withCompletions);
      return withCompletions;
    }
  }
  return loadLocal();
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<User | null> {
  const data = await getAppData();
  const normalized = username.trim().toLowerCase();
  const user = data.users.find(
    (u) => u.username === normalized && u.password === password
  );
  return user ?? null;
}

export async function completeTask(
  taskId: string,
  userId: string
): Promise<TaskCompletion> {
  const completion: TaskCompletion = {
    id: generateId("completion"),
    task_id: taskId,
    user_id: userId,
    completed_at: new Date().toISOString(),
    date: today(),
  };

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("task_completions")
        .upsert(completion, { onConflict: "task_id,date" })
        .select()
        .single();
      if (!error && data) return data as TaskCompletion;
    }
  }

  const data = loadLocal();
  const existing = data.completions.findIndex(
    (c) => c.task_id === taskId && c.date === today()
  );
  if (existing >= 0) {
    data.completions[existing] = completion;
  } else {
    data.completions.push(completion);
  }
  saveLocal(data);
  return completion;
}

export async function uncompleteTask(taskId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from("task_completions")
        .delete()
        .eq("task_id", taskId)
        .eq("date", today());
    }
  }

  const data = loadLocal();
  data.completions = data.completions.filter(
    (c) => !(c.task_id === taskId && c.date === today())
  );
  saveLocal(data);
}

export async function saveTask(task: Task): Promise<Task> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("tasks")
        .upsert(task)
        .select()
        .single();
      if (!error && data) return data as Task;
    }
  }

  const data = loadLocal();
  const idx = data.tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    data.tasks[idx] = task;
  } else {
    data.tasks.push(task);
  }
  saveLocal(data);
  return task;
}

export async function deleteTask(taskId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("tasks").delete().eq("id", taskId);
    }
  }

  const data = loadLocal();
  data.tasks = data.tasks.filter((t) => t.id !== taskId);
  saveLocal(data);
}

export async function saveSection(section: TaskSection): Promise<TaskSection> {
  const normalized = normalizeSection(section);
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("task_sections")
        .upsert(normalized)
        .select()
        .single();
      if (!error && data) return normalizeSection(data as TaskSection);
    }
  }

  const data = loadLocal();
  const idx = data.sections.findIndex((s) => s.id === normalized.id);
  if (idx >= 0) {
    data.sections[idx] = normalized;
  } else {
    data.sections.push(normalized);
  }
  data.sections.sort((a, b) => a.sort_order - b.sort_order);
  saveLocal(data);
  return normalized;
}

export async function createSection(
  stationId: string,
  name: string,
  timing?: Partial<
    Pick<
      TaskSection,
      "time" | "recurrence" | "interval_minutes" | "due_window_minutes"
    >
  >
): Promise<TaskSection> {
  const data = await getAppData();
  const stationSections = data.sections.filter((s) => s.station_id === stationId);
  const section: TaskSection = normalizeSection({
    id: generateId("section"),
    station_id: stationId,
    name: name.trim(),
    sort_order: stationSections.length + 1,
    ...DEFAULT_SECTION_TIMING,
    ...timing,
  });
  return saveSection(section);
}

export async function deleteSection(sectionId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("task_sections").delete().eq("id", sectionId);
    }
  }

  const data = loadLocal();
  data.sections = data.sections.filter((s) => s.id !== sectionId);
  data.tasks = data.tasks.map((t) =>
    t.section_id === sectionId ? { ...t, section_id: null } : t
  );
  saveLocal(data);
}

export async function saveMapZoneLabel(
  id: string,
  name: string
): Promise<MapZoneStored> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Zone name is required");
  }

  const data = await getAppData();
  const mapZones = data.mapZones.map((zone) =>
    zone.id === id ? { ...zone, name: trimmed } : zone
  );
  const updated = { ...data, mapZones };
  const zone = mapZones.find((z) => z.id === id)!;

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: saved, error } = await supabase
        .from("map_zones")
        .upsert(zone)
        .select()
        .single();
      if (!error && saved) {
        cacheLocally(updated);
        return saved as MapZoneStored;
      }
    }
  }

  saveLocal(updated);
  return zone;
}

export async function saveMapZone(zone: MapZoneStored): Promise<MapZoneStored> {
  const data = await getAppData();
  const mapZones = data.mapZones.map((existing) =>
    existing.id === zone.id ? { ...existing, ...zone } : existing
  );
  const updated = { ...data, mapZones };
  const saved = mapZones.find((z) => z.id === zone.id)!;

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: row, error } = await supabase
        .from("map_zones")
        .upsert(saved)
        .select()
        .single();
      if (!error && row) {
        cacheLocally(updated);
        return row as MapZoneStored;
      }
    }
  }

  saveLocal(updated);
  return saved;
}

export async function saveMapLayoutSettings(
  settings: MapLayoutSettings
): Promise<MapLayoutSettings> {
  const data = await getAppData();
  const mapLayout = mergeMapLayout(settings);
  const updated = { ...data, mapLayout };

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from("map_layout").upsert({
        id: "default",
        width: mapLayout.width,
        height: mapLayout.height,
      });
      if (!error) {
        cacheLocally(updated);
        return mapLayout;
      }
    }
  }

  saveLocal(updated);
  return mapLayout;
}

export async function resetMapLayout(): Promise<void> {
  const data = await getAppData();
  const mapZones = getDefaultMapZoneLabels();
  const mapLayout = getDefaultMapLayout();
  const zones = mergeMapZones(mapZones);
  const stations = resetAllStationLayouts(data.stations, zones);
  const updated = { ...data, stations, mapZones, mapLayout };

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      for (const station of stations) {
        await supabase.from("stations").upsert(station);
      }
      await persistMapZones(mapZones);
      await persistMapLayout(mapLayout);
      cacheLocally(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
      }
      return;
    }
  }

  saveLocal(updated);
  if (typeof window !== "undefined") {
    localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
  }
}

export async function placeStationOnMap(
  station: Station,
  existing: Station[]
): Promise<Station> {
  const data = await getAppData();
  const layout = data.mapLayout ?? getDefaultMapLayout();
  const zones = mergeMapZones(data.mapZones);
  return saveStation({
    ...station,
    ...defaultMapPlacement(station, existing, zones, layout),
  });
}

export async function removeStationFromMap(station: Station): Promise<Station> {
  return saveStation({
    ...station,
    map_x: 0,
    map_y: 0,
    map_width: 0,
    map_height: 0,
  });
}

export async function saveStation(station: Station): Promise<Station> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("stations")
        .upsert(station)
        .select()
        .single();
      if (!error && data) return data as Station;
    }
  }

  const data = loadLocal();
  const idx = data.stations.findIndex((s) => s.id === station.id);
  if (idx >= 0) {
    data.stations[idx] = station;
  } else {
    data.stations.push(station);
  }
  saveLocal(data);
  return station;
}

const STATION_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createStation(
  name: string,
  color?: string
): Promise<Station> {
  const data = await getAppData();
  const slug = slugify(name);
  const existingSlugs = new Set(data.stations.map((s) => s.slug));
  let uniqueSlug = slug;
  let suffix = 2;
  while (existingSlugs.has(uniqueSlug)) {
    uniqueSlug = `${slug}-${suffix}`;
    suffix++;
  }

  const station: Station = {
    id: generateId("station"),
    name: name.trim(),
    slug: uniqueSlug,
    color: color ?? STATION_COLORS[data.stations.length % STATION_COLORS.length],
    map_x: 0,
    map_y: 0,
    map_width: 0,
    map_height: 0,
  };

  return saveStation(station);
}

export async function deleteStation(stationId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("tasks").delete().eq("station_id", stationId);
      await supabase.from("task_sections").delete().eq("station_id", stationId);
      await supabase.from("stations").delete().eq("id", stationId);
    }
  }

  const data = loadLocal();
  data.stations = data.stations.filter((s) => s.id !== stationId);
  data.sections = data.sections.filter((s) => s.station_id !== stationId);
  data.tasks = data.tasks.filter((t) => t.station_id !== stationId);
  saveLocal(data);
}

export async function restoreStationWithTasks(
  station: Station,
  tasks: Task[],
  sections: TaskSection[] = []
): Promise<void> {
  await saveStation(station);
  for (const section of sections) {
    await saveSection(section);
  }
  for (const task of tasks) {
    await saveTask(task);
  }
}

export async function restoreMissingSeedStations(): Promise<string[]> {
  const data = await getAppData();
  const restored: string[] = [];

  for (const seedStation of DEFAULT_DATA.stations) {
    if (data.stations.some((s) => s.id === seedStation.id)) continue;

    const seedSections = DEFAULT_DATA.sections.filter(
      (s) => s.station_id === seedStation.id
    );
    const seedTasks = DEFAULT_DATA.tasks.filter(
      (t) => t.station_id === seedStation.id
    );
    await restoreStationWithTasks(seedStation, seedTasks, seedSections);
    restored.push(seedStation.name);
  }

  return restored;
}

export async function createTask(
  partial: Omit<Task, "id" | "sort_order"> & { sort_order?: number }
): Promise<Task> {
  const data = await getAppData();
  const task: Task = {
    id: generateId("task"),
    sort_order: partial.sort_order ?? data.tasks.length + 1,
    ...partial,
  };
  return saveTask(task);
}

export function getSectionsForStation(
  sections: TaskSection[],
  stationId: string
): TaskSection[] {
  return sections
    .filter((s) => s.station_id === stationId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getSectionLabel(
  sectionId: string | null,
  sections: TaskSection[]
): string {
  if (!sectionId) return "Unassigned";
  return sections.find((s) => s.id === sectionId)?.name ?? "Unknown";
}

export function formatTimingSummary(task: Task): string | null {
  const parts: string[] = [];
  if (task.recurrence === "interval" && task.interval_minutes) {
    const hours = task.interval_minutes / 60;
    parts.push(
      hours >= 1 && task.interval_minutes % 60 === 0
        ? `Every ${hours} hr`
        : `Every ${task.interval_minutes} min`
    );
  }
  if (task.timing_notes.trim()) {
    parts.push(task.timing_notes.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function timeToMinutes(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 99998;
  return h * 60 + m;
}

export function formatTime12(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export function formatSectionTimingSummary(section: TaskSection): string | null {
  const parts: string[] = [];
  if (section.time) {
    parts.push(formatTime12(section.time));
  }
  if (section.recurrence === "interval" && section.interval_minutes) {
    const hours = section.interval_minutes / 60;
    parts.push(
      hours >= 1 && section.interval_minutes % 60 === 0
        ? `Every ${hours} hr`
        : `Every ${section.interval_minutes} min`
    );
  }
  if (section.due_window_minutes) {
    parts.push(`${section.due_window_minutes} min window`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface SectionScheduleGroup {
  key: string;
  sortKey: number;
  label: string;
  subtitle: string | null;
}

export function getSectionScheduleGroup(
  section: TaskSection | null | undefined
): SectionScheduleGroup {
  if (!section) {
    return {
      key: "unscheduled",
      sortKey: 99999,
      label: "Unscheduled",
      subtitle: null,
    };
  }

  const subtitle = formatSectionTimingSummary(section);

  if (section.time) {
    return {
      key: `time-${section.time}`,
      sortKey: timeToMinutes(section.time),
      label: formatTime12(section.time),
      subtitle,
    };
  }

  if (section.recurrence === "interval") {
    const interval = section.interval_minutes ?? 0;
    return {
      key: `interval-${interval}`,
      sortKey: 720 + interval,
      label: subtitle ?? "Repeating tasks",
      subtitle,
    };
  }

  return {
    key: "during-service",
    sortKey: 660,
    label: "During Service",
    subtitle,
  };
}
