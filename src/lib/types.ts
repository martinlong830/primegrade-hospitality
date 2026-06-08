export type UserRole = "admin" | "user";

export type TaskRecurrence = "daily_once" | "interval";

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface Station {
  id: string;
  name: string;
  slug: string;
  color: string;
  map_x: number;
  map_y: number;
  map_width: number;
  map_height: number;
}

export interface TaskSection {
  id: string;
  station_id: string;
  name: string;
  sort_order: number;
  /** HH:MM anchor time (24h) */
  time?: string;
  recurrence?: TaskRecurrence;
  interval_minutes?: number | null;
  /** Minutes after scheduled time tasks remain due */
  due_window_minutes?: number | null;
}

export interface Task {
  id: string;
  station_id: string;
  section_id: string | null;
  title: string;
  description: string;
  timing_notes: string;
  recurrence: TaskRecurrence;
  interval_minutes: number | null;
  assigned_user_id: string | null;
  sort_order: number;
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  user_id: string;
  completed_at: string;
  date: string;
}

/** Persisted map zone — geometry and label */
export interface MapZoneStored {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** @deprecated Use MapZoneStored */
export type MapZoneLabel = Pick<MapZoneStored, "id" | "name">;

export interface MapLayoutSettings {
  width: number;
  height: number;
}

export interface AppData {
  users: User[];
  stations: Station[];
  sections: TaskSection[];
  tasks: Task[];
  completions: TaskCompletion[];
  mapZones: MapZoneStored[];
  mapLayout?: MapLayoutSettings;
}

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  daily_once: "Once daily",
  interval: "Repeating interval",
};

export const DEFAULT_SECTION_TIMING: Pick<
  TaskSection,
  "recurrence" | "interval_minutes" | "due_window_minutes"
> = {
  recurrence: "daily_once",
  interval_minutes: null,
  due_window_minutes: null,
};
