"use client";

import { useEffect, useRef, useState } from "react";
import {
  createSection,
  createStation,
  createTask,
  placeStationOnMap,
  removeStationFromMap,
  resetMapLayout,
  deleteSection,
  deleteStation,
  deleteTask,
  formatTimingSummary,
  formatSectionTimingSummary,
  getSectionLabel,
  getSectionsForStation,
  restoreMissingSeedStations,
  restoreStationWithTasks,
  saveSection,
  saveMapZoneLabel,
  saveMapZone,
  deleteMapZone,
  saveMapLayoutSettings,
  saveStation,
  saveTask,
} from "@/lib/db";
import {
  RECURRENCE_LABELS,
  DEFAULT_SECTION_TIMING,
  type AppData,
  type Station,
  type Task,
  type TaskCompletion,
  type TaskRecurrence,
  type TaskSection,
} from "@/lib/types";
import { useTaskSectionDragDrop } from "@/hooks/useTaskSectionDragDrop";
import { useViewDate } from "@/contexts/DateContext";
import MapView from "./MapView";
import StationTabs from "./StationTabs";

interface AdminPanelProps {
  data: AppData;
  completionsForDate: TaskCompletion[];
  onUpdate: () => void;
}

const UNDO_TIMEOUT_MS = 20_000;
const SEED_RESTORE_KEY = "doh-missing-seed-restored";

interface DeletedStationSnapshot {
  station: Station;
  sections: TaskSection[];
  tasks: Task[];
}

const emptyNewTask = () => ({
  title: "",
  description: "",
  section_id: "",
  timing_notes: "",
  recurrence: "daily_once" as TaskRecurrence,
  interval_minutes: null as number | null,
  assigned_user_id: "",
});

export default function AdminPanel({
  data,
  completionsForDate,
  onUpdate,
}: AdminPanelProps) {
  const { fullLabel, isViewingToday } = useViewDate();
  const [tab, setTab] = useState<"stations" | "team" | "map" | "status">(
    "stations"
  );
  const [selectedStationSlug, setSelectedStationSlug] = useState(
    data.stations[0]?.slug ?? ""
  );
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newStationName, setNewStationName] = useState("");
  const selectedStation =
    data.stations.find((s) => s.slug === selectedStationSlug) ??
    data.stations[0];
  const [newTask, setNewTask] = useState(emptyNewTask);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddStation, setShowAddStation] = useState(false);
  const [stationToDelete, setStationToDelete] = useState<Station | null>(null);
  const [deletedSnapshot, setDeletedSnapshot] =
    useState<DeletedStationSnapshot | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [editingSection, setEditingSection] = useState<TaskSection | null>(
    null
  );
  const addTaskRef = useRef<HTMLDivElement>(null);
  const addStationRef = useRef<HTMLDivElement>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (localStorage.getItem(SEED_RESTORE_KEY)) return;
    restoreMissingSeedStations().then((restored) => {
      if (restored.length > 0) {
        localStorage.setItem(SEED_RESTORE_KEY, "1");
        onUpdate();
      }
    });
  }, [onUpdate]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showAddTask) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        addTaskRef.current &&
        !addTaskRef.current.contains(e.target as Node)
      ) {
        setShowAddTask(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAddTask]);

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

  const stationSections = selectedStation
    ? getSectionsForStation(data.sections, selectedStation.id)
    : [];

  const handleSaveTask = async (task: Task) => {
    await saveTask(task);
    setEditingTask(null);
    onUpdate();
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !selectedStation) return;
    await createTask({
      title: newTask.title,
      description: newTask.description,
      station_id: selectedStation.id,
      section_id: newTask.section_id || null,
      timing_notes: newTask.timing_notes,
      recurrence: newTask.recurrence,
      interval_minutes:
        newTask.recurrence === "interval" ? newTask.interval_minutes : null,
      assigned_user_id: newTask.assigned_user_id || null,
    });
    setNewTask(emptyNewTask());
    setShowAddTask(false);
    onUpdate();
  };

  const handleCreateStation = async () => {
    if (!newStationName.trim()) return;
    const station = await createStation(newStationName);
    setNewStationName("");
    setShowAddStation(false);
    setSelectedStationSlug(station.slug);
    onUpdate();
  };

  const handleCreateSection = async () => {
    if (!newSectionName.trim() || !selectedStation) return;
    await createSection(selectedStation.id, newSectionName);
    setNewSectionName("");
    setAddingSection(false);
    onUpdate();
  };

  const handleSaveSection = async () => {
    if (!editingSection?.name.trim()) return;
    await saveSection({
      ...editingSection,
      recurrence: editingSection.recurrence ?? "daily_once",
      interval_minutes:
        editingSection.recurrence === "interval"
          ? editingSection.interval_minutes
          : null,
    });
    setEditingSection(null);
    onUpdate();
  };

  const handleDeleteSection = async (sectionId: string) => {
    const section = data.sections.find((s) => s.id === sectionId);
    const taskCount = data.tasks.filter((t) => t.section_id === sectionId).length;
    const msg =
      taskCount > 0
        ? `Delete "${section?.name}"? ${taskCount} task(s) will become unassigned.`
        : `Delete "${section?.name}"?`;
    if (!confirm(msg)) return;
    await deleteSection(sectionId);
    onUpdate();
  };

  const clearUndoState = () => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setDeletedSnapshot(null);
  };

  const handleConfirmDeleteStation = async () => {
    if (!stationToDelete) return;

    const station = stationToDelete;
    const sections = data.sections.filter((s) => s.station_id === station.id);
    const tasks = data.tasks.filter((t) => t.station_id === station.id);
    const snapshot: DeletedStationSnapshot = { station, sections, tasks };

    await deleteStation(station.id);
    setStationToDelete(null);

    if (selectedStation?.id === station.id) {
      const remaining = data.stations.filter((s) => s.id !== station.id);
      setSelectedStationSlug(remaining[0]?.slug ?? "");
      setShowAddTask(false);
    }

    clearUndoState();
    setDeletedSnapshot(snapshot);
    undoTimeoutRef.current = setTimeout(() => {
      setDeletedSnapshot(null);
      undoTimeoutRef.current = null;
    }, UNDO_TIMEOUT_MS);

    onUpdate();
  };

  const handleUndoDeleteStation = async () => {
    if (!deletedSnapshot) return;

    await restoreStationWithTasks(
      deletedSnapshot.station,
      deletedSnapshot.tasks,
      deletedSnapshot.sections
    );
    setSelectedStationSlug(deletedSnapshot.station.slug);
    clearUndoState();
    onUpdate();
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    await deleteTask(taskId);
    onUpdate();
  };

  const tabs = [
    { id: "stations" as const, label: "Stations & Tasks" },
    { id: "team" as const, label: "Team" },
    { id: "map" as const, label: "Layout Map" },
    { id: "status" as const, label: "Completion Status" },
  ];

  const stationTasks = selectedStation
    ? data.tasks.filter((t) => t.station_id === selectedStation.id)
    : [];

  const {
    draggingTaskId,
    isDragging,
    getDropZoneClassName,
    getDragHandleProps,
    getSectionDropProps,
  } = useTaskSectionDragDrop(stationTasks, onUpdate);

  const renderSectionPicker = (
    sectionId: string,
    onChange: (id: string) => void
  ) => (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-600">Section</p>
      <select
        value={sectionId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Unassigned</option>
        {stationSections.map((section) => {
          const timing = formatSectionTimingSummary(section);
          return (
            <option key={section.id} value={section.id}>
              {timing ? `${section.name} · ${timing}` : section.name}
            </option>
          );
        })}
      </select>
    </div>
  );

  const renderTimingFields = (
    task: {
      recurrence: TaskRecurrence;
      interval_minutes: number | null;
      timing_notes: string;
    },
    onChange: (updates: Partial<typeof task>) => void
  ) => (
    <div className="space-y-2">
      <select
        value={task.recurrence}
        onChange={(e) =>
          onChange({ recurrence: e.target.value as TaskRecurrence })
        }
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {task.recurrence === "interval" && (
        <input
          type="number"
          min={1}
          placeholder="Interval (minutes)"
          value={task.interval_minutes ?? ""}
          onChange={(e) =>
            onChange({
              interval_minutes: e.target.value
                ? parseInt(e.target.value, 10)
                : null,
            })
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      )}
      <input
        placeholder="Timing notes (optional)"
        value={task.timing_notes}
        onChange={(e) => onChange({ timing_notes: e.target.value })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );

  const renderSectionTimingFields = (
    section: TaskSection,
    onChange: (updates: Partial<TaskSection>) => void
  ) => (
    <div className="rounded-lg border border-indigo-200 bg-white p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700">
        Section timing
      </p>
      <div className="grid w-full gap-2 sm:grid-cols-2">
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600">Scheduled time</p>
        <input
          type="time"
          value={section.time ?? ""}
          onChange={(e) =>
            onChange({ time: e.target.value || undefined })
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600">Recurrence</p>
        <select
          value={section.recurrence ?? "daily_once"}
          onChange={(e) =>
            onChange({
              recurrence: e.target.value as TaskRecurrence,
              interval_minutes:
                e.target.value === "interval" ? section.interval_minutes : null,
            })
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {(section.recurrence ?? "daily_once") === "interval" && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">Interval (minutes)</p>
          <input
            type="number"
            min={1}
            placeholder="120"
            value={section.interval_minutes ?? ""}
            onChange={(e) =>
              onChange({
                interval_minutes: e.target.value
                  ? parseInt(e.target.value, 10)
                  : null,
              })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600">Due window (minutes)</p>
        <input
          type="number"
          min={1}
          placeholder="Optional grace period"
          value={section.due_window_minutes ?? ""}
          onChange={(e) =>
            onChange({
              due_window_minutes: e.target.value
                ? parseInt(e.target.value, 10)
                : null,
            })
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      </div>
    </div>
  );

  const renderTaskRow = (task: Task) => {
    const assigned = data.users.find((u) => u.id === task.assigned_user_id);
    const timingSummary = formatTimingSummary(task);

    if (editingTask?.id === task.id) {
      return (
        <div
          key={task.id}
          className="rounded-lg border border-blue-300 bg-blue-50 p-4"
        >
          <div className="space-y-3">
            <input
              value={editingTask.title}
              onChange={(e) =>
                setEditingTask({ ...editingTask, title: e.target.value })
              }
              className="w-full rounded border px-2 py-1 text-sm"
            />
            <input
              value={editingTask.description}
              onChange={(e) =>
                setEditingTask({
                  ...editingTask,
                  description: e.target.value,
                })
              }
              className="w-full rounded border px-2 py-1 text-sm"
            />
            {renderSectionPicker(editingTask.section_id ?? "", (id) =>
              setEditingTask({
                ...editingTask,
                section_id: id || null,
              })
            )}
            {renderTimingFields(editingTask, (updates) =>
              setEditingTask({ ...editingTask, ...updates })
            )}
            <select
              value={editingTask.assigned_user_id ?? ""}
              onChange={(e) =>
                setEditingTask({
                  ...editingTask,
                  assigned_user_id: e.target.value || null,
                })
              }
              className="w-full rounded border px-2 py-1 text-sm"
            >
              <option value="">Unassigned</option>
              {data.users
                .filter((u) => u.role === "user")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => handleSaveTask(editingTask)}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white"
            >
              Save
            </button>
            <button
              onClick={() => setEditingTask(null)}
              className="rounded bg-slate-200 px-3 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 ${
          draggingTaskId === task.id ? "opacity-50" : ""
        }`}
      >
        <button
          type="button"
          {...getDragHandleProps(task.id)}
          aria-label={`Drag ${task.title} to another section`}
          className="cursor-grab touch-none rounded px-1 py-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
        >
          <svg
            aria-hidden
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <circle cx="5" cy="4" r="1.25" />
            <circle cx="11" cy="4" r="1.25" />
            <circle cx="5" cy="8" r="1.25" />
            <circle cx="11" cy="8" r="1.25" />
            <circle cx="5" cy="12" r="1.25" />
            <circle cx="11" cy="12" r="1.25" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{task.title}</p>
          <p className="text-xs text-slate-500">
            {getSectionLabel(task.section_id, data.sections)}
            {timingSummary ? ` · ${timingSummary}` : ""}
            {assigned ? ` · ${assigned.name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setEditingTask(task)}
            className="rounded bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200"
          >
            Edit
          </button>
          <button
            onClick={() => handleDeleteTask(task.id)}
            className="rounded bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  const openSectionEditor = (section: TaskSection) => {
    setEditingSection({
      ...section,
      ...DEFAULT_SECTION_TIMING,
      ...section,
    });
  };

  const renderSectionHeader = (
    section: TaskSection,
    taskCount: number
  ) => {
    const timingSummary = formatSectionTimingSummary(section);

    if (editingSection?.id === section.id) {
      return (
        <div className="mb-2 space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={editingSection.name}
              onChange={(e) =>
                setEditingSection({ ...editingSection, name: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveSection();
                if (e.key === "Escape") setEditingSection(null);
              }}
              autoFocus
              placeholder="Section name"
              className="min-w-[160px] flex-1 rounded border border-blue-300 px-2 py-1 text-sm font-semibold text-slate-900"
            />
            <button
              type="button"
              onClick={handleSaveSection}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingSection(null)}
              className="rounded bg-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
          {renderSectionTimingFields(editingSection, (updates) =>
            setEditingSection({ ...editingSection, ...updates })
          )}
        </div>
      );
    }

    return (
      <div className="group mb-2 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => openSectionEditor(section)}
          className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-700"
          title="Click to edit section name and timing"
        >
          {section.name}
        </button>
        {timingSummary ? (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {timingSummary}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            No timing set
          </span>
        )}
        <button
          type="button"
          onClick={() => openSectionEditor(section)}
          className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          Edit timing
        </button>
        <span className="text-xs text-slate-500">
          {taskCount} task{taskCount === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => handleDeleteSection(section.id)}
          aria-label={`Delete ${section.name}`}
          className="ml-auto rounded px-2 py-0.5 text-xs font-medium text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          Delete
        </button>
      </div>
    );
  };

  const renderTasksBySection = () => {
    const unsectioned = stationTasks.filter((t) => !t.section_id);
    const hasContent = stationTasks.length > 0 || stationSections.length > 0;

    return (
      <div className="space-y-4">
        {!hasContent && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No tasks in this station yet. Click + to add one, or add a section
            below.
          </p>
        )}

        {stationSections.map((section) => {
          const sectionTasks = stationTasks.filter(
            (t) => t.section_id === section.id
          );
          return (
            <div
              key={section.id}
              {...getSectionDropProps(section.id)}
              className={getDropZoneClassName(
                "rounded-lg transition-colors",
                section.id
              )}
            >
              {renderSectionHeader(section, sectionTasks.length)}
              {sectionTasks.length > 0 ? (
                <div className="space-y-2">
                  {sectionTasks.map(renderTaskRow)}
                </div>
              ) : (
                <p
                  className={`min-h-[2.5rem] text-xs italic text-slate-400 ${
                    isDragging ? "rounded-md border border-dashed border-emerald-300 p-3" : ""
                  }`}
                >
                  {isDragging
                    ? "Drop tasks here"
                    : "No tasks in this section"}
                </p>
              )}
            </div>
          );
        })}

        {(unsectioned.length > 0 || isDragging) && (
          <div
            {...getSectionDropProps(null)}
            className={getDropZoneClassName(
              "rounded-lg transition-colors",
              null
            )}
          >
            <p className="mb-2 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-500">
              Unassigned
            </p>
            {unsectioned.length > 0 ? (
              <div className="space-y-2">{unsectioned.map(renderTaskRow)}</div>
            ) : (
              <p className="min-h-[2.5rem] rounded-md border border-dashed border-emerald-300 p-3 text-xs italic text-slate-400">
                Drop tasks here to unassign
              </p>
            )}
          </div>
        )}

        {addingSection ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 p-3">
            <input
              placeholder="Section name (e.g. Pre-Service)"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSection();
                if (e.key === "Escape") {
                  setAddingSection(false);
                  setNewSectionName("");
                }
              }}
              autoFocus
              className="min-w-[180px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCreateSection}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingSection(false);
                setNewSectionName("");
              }}
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingSection(true)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700"
          >
            + Add section
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative space-y-6">
      {deletedSnapshot && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex w-[min(100%-2rem,28rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg"
        >
          <p className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">
              {deletedSnapshot.station.name}
            </span>{" "}
            deleted
          </p>
          <button
            type="button"
            onClick={handleUndoDeleteStation}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Undo
          </button>
        </div>
      )}

      {stationToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setStationToDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-station-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-station-title"
              className="text-lg font-semibold text-slate-900"
            >
              Delete station?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete{" "}
              <span className="font-medium text-slate-900">
                {stationToDelete.name}
              </span>
              ? This will also delete all sections and tasks in this station.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStationToDelete(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStation}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stations" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-900">Stations</h3>
            <div className="relative" ref={addStationRef}>
              <button
                type="button"
                onClick={() => setShowAddStation((open) => !open)}
                aria-label="Add station"
                aria-expanded={showAddStation}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-lg leading-none font-medium text-white hover:bg-emerald-700"
              >
                +
              </button>
              {showAddStation && (
                <div className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                  <h4 className="mb-3 text-sm font-medium text-slate-700">
                    Add Station
                  </h4>
                  <div className="space-y-3">
                    <input
                      placeholder="Station name (e.g. Bar Area)"
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
                      className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Add Station
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {data.stations.length > 0 ? (
            <>
              <StationTabs
                stations={data.stations}
                tasks={data.tasks}
                completions={completionsForDate}
                selectedSlug={selectedStationSlug}
                onSelect={(slug) => {
                  setSelectedStationSlug(slug);
                  setShowAddTask(false);
                }}
              />

              {selectedStation && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">
                      Tasks in {selectedStation.name}
                    </h3>
                    <div className="relative" ref={addTaskRef}>
                      <button
                        type="button"
                        onClick={() => setShowAddTask((open) => !open)}
                        aria-label="Add task"
                        aria-expanded={showAddTask}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-lg leading-none font-medium text-white hover:bg-emerald-700"
                      >
                        +
                      </button>
                      {showAddTask && (
                        <div className="absolute right-0 z-10 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                          <h4 className="mb-3 text-sm font-medium text-slate-700">
                            Add Task to {selectedStation.name}
                          </h4>
                          <div className="space-y-3">
                            <input
                              placeholder="Task title"
                              value={newTask.title}
                              onChange={(e) =>
                                setNewTask({
                                  ...newTask,
                                  title: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            <input
                              placeholder="Description"
                              value={newTask.description}
                              onChange={(e) =>
                                setNewTask({
                                  ...newTask,
                                  description: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            {renderSectionPicker(newTask.section_id, (id) =>
                              setNewTask({ ...newTask, section_id: id })
                            )}
                            {renderTimingFields(newTask, (updates) =>
                              setNewTask({ ...newTask, ...updates })
                            )}
                            <select
                              value={newTask.assigned_user_id}
                              onChange={(e) =>
                                setNewTask({
                                  ...newTask,
                                  assigned_user_id: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              <option value="">Unassigned</option>
                              {data.users
                                .filter((u) => u.role === "user")
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={handleCreateTask}
                              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                            >
                              Add Task
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {renderTasksBySection()}

                  <div className="border-t border-slate-200 pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Station Settings
                    </p>
                    <button
                      type="button"
                      onClick={() => setStationToDelete(selectedStation)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Delete Station
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              No stations yet. Click + to add your first station.
            </p>
          )}
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-3">
          {data.users.map((user) => {
            const assignedTasks = data.tasks.filter(
              (t) => t.assigned_user_id === user.id
            );
            return (
              <div
                key={user.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{user.name}</p>
                    <p className="text-sm text-slate-500">
                      {user.role === "admin" ? "Administrator" : "Team Member"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
                {assignedTasks.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase text-slate-400">
                      Assigned Tasks
                    </p>
                    <ul className="space-y-1">
                      {assignedTasks.map((t) => {
                        const station = data.stations.find(
                          (s) => s.id === t.station_id
                        );
                        return (
                          <li key={t.id} className="text-sm text-slate-600">
                            {t.title} ({station?.name} ·{" "}
                            {getSectionLabel(t.section_id, data.sections)})
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "map" && (
        <MapView
          stations={data.stations}
          sections={data.sections}
          mapZones={data.mapZones}
          mapLayout={data.mapLayout}
          editable
          onStationMove={async (station) => {
            await saveStation(station);
          }}
          onStationAdd={async (station) => {
            await placeStationOnMap(station, data.stations);
            onUpdate();
          }}
          onStationCreate={async (name) => {
            await createStation(name);
            onUpdate();
          }}
          onStationRemoveFromMap={async (station) => {
            await removeStationFromMap(station);
            onUpdate();
          }}
          onResetLayout={async () => {
            await resetMapLayout();
            onUpdate();
          }}
          onMapZoneRename={async (zone) => {
            await saveMapZoneLabel(zone.id, zone.name);
            onUpdate();
          }}
          onMapZoneResize={async (zone) => {
            await saveMapZone(zone);
            onUpdate();
          }}
          onMapZoneDelete={async (zoneId) => {
            await deleteMapZone(zoneId);
            onUpdate();
          }}
          onMapLayoutChange={async (layout) => {
            await saveMapLayoutSettings(layout);
            onUpdate();
          }}
          onLayoutSaved={onUpdate}
        />
      )}

      {tab === "status" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Completion status for{" "}
            <span className="font-medium text-slate-900">{fullLabel}</span>
            {isViewingToday ? " (today)" : ""}
          </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Task</th>
                <th className="px-4 py-3 font-semibold text-slate-700">
                  Station
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700">
                  Section
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700">
                  Timing
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700">
                  Assigned
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700">
                  Status
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700">
                  Completed At
                </th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((task) => {
                const completion = completionsForDate.find(
                  (c) => c.task_id === task.id
                );
                const station = data.stations.find(
                  (s) => s.id === task.station_id
                );
                const assigned = data.users.find(
                  (u) => u.id === task.assigned_user_id
                );
                const completedBy = completion
                  ? data.users.find((u) => u.id === completion.user_id)
                  : null;
                const timingSummary = (() => {
                  const section = task.section_id
                    ? data.sections.find((s) => s.id === task.section_id)
                    : null;
                  return section
                    ? formatSectionTimingSummary(section)
                    : formatTimingSummary(task);
                })();

                return (
                  <tr key={task.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-900">{task.title}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {station?.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getSectionLabel(task.section_id, data.sections)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {timingSummary ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {assigned?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          completion
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {completion ? "Complete" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {completion
                        ? `${new Date(completion.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} by ${completedBy?.name}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
