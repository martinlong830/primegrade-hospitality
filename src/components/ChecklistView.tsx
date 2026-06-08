"use client";

import {
  completeTask,
  formatTimingSummary,
  formatSectionTimingSummary,
  getSectionsForStation,
  uncompleteTask,
} from "@/lib/db";
import type {
  Station,
  Task,
  TaskCompletion,
  TaskSection,
  User,
} from "@/lib/types";
import { useTaskSectionDragDrop } from "@/hooks/useTaskSectionDragDrop";

interface ChecklistViewProps {
  tasks: Task[];
  sections: TaskSection[];
  completions: TaskCompletion[];
  users: User[];
  currentUser: User;
  station: Station;
  onUpdate: () => void;
}

export default function ChecklistView({
  tasks,
  sections,
  completions,
  users,
  currentUser,
  station,
  onUpdate,
}: ChecklistViewProps) {
  const stationTasks = tasks.filter((t) => t.station_id === station.id);
  const stationSections = getSectionsForStation(sections, station.id);

  const {
    draggingTaskId,
    isDragging,
    getDropZoneClassName,
    getDragHandleProps,
    getSectionDropProps,
  } = useTaskSectionDragDrop(stationTasks, onUpdate);

  const getCompletion = (taskId: string) =>
    completions.find((c) => c.task_id === taskId);

  const getUserName = (userId: string | null) => {
    if (!userId) return null;
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  };

  const handleToggle = async (task: Task) => {
    const existing = getCompletion(task.id);
    if (existing) {
      await uncompleteTask(task.id);
    } else {
      await completeTask(task.id, currentUser.id);
    }
    onUpdate();
  };

  const renderTask = (task: Task) => {
    const completion = getCompletion(task.id);
    const assigned = getUserName(task.assigned_user_id);
    const timingSummary = formatTimingSummary(task);

    return (
      <div
        key={task.id}
        className={`flex items-start gap-2 ${
          draggingTaskId === task.id ? "opacity-50" : ""
        }`}
      >
        <button
          type="button"
          {...getDragHandleProps(task.id)}
          aria-label={`Drag ${task.title} to another section`}
          className="mt-4 shrink-0 cursor-grab touch-none rounded px-1 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
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
        <label
          className={`flex flex-1 cursor-pointer items-start gap-4 rounded-lg border p-4 transition-all ${
            completion
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <input
            type="checkbox"
            checked={!!completion}
            onChange={() => handleToggle(task)}
            className="mt-1 h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-medium ${completion ? "text-emerald-800 line-through" : "text-slate-900"}`}
              >
                {task.title}
              </span>
              {assigned && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Assigned: {assigned}
                </span>
              )}
              {timingSummary && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  {timingSummary}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">{task.description}</p>
            {completion && (
              <p className="mt-2 text-xs text-emerald-700">
                Completed at{" "}
                {new Date(completion.completed_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                by {getUserName(completion.user_id)}
              </p>
            )}
          </div>
        </label>
      </div>
    );
  };

  if (stationTasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-slate-500">No tasks in {station.name} yet.</p>
      </div>
    );
  }

  const unsectionedTasks = stationTasks.filter((t) => !t.section_id);

  return (
    <div className="space-y-6">
      {stationSections.map((section) => {
        const sectionTasks = stationTasks.filter(
          (t) => t.section_id === section.id
        );
        if (sectionTasks.length === 0 && !isDragging) return null;

        const completed = sectionTasks.filter((t) =>
          getCompletion(t.id)
        ).length;
        const timingSummary = formatSectionTimingSummary(section);

        return (
          <div
            key={section.id}
            {...getSectionDropProps(section.id)}
            className={getDropZoneClassName(
              "rounded-lg transition-colors",
              section.id
            )}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
              <h3 className="font-semibold text-slate-900">{section.name}</h3>
              {timingSummary && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {timingSummary}
                </span>
              )}
              <span className="text-xs text-slate-500">
                {completed}/{sectionTasks.length} complete
              </span>
            </div>
            {sectionTasks.length > 0 ? (
              <div className="space-y-3">{sectionTasks.map(renderTask)}</div>
            ) : (
              <p className="min-h-[2.5rem] rounded-md border border-dashed border-emerald-300 p-3 text-xs italic text-slate-400">
                Drop tasks here
              </p>
            )}
          </div>
        );
      })}

      {(unsectionedTasks.length > 0 || isDragging) && (
        <div
          {...getSectionDropProps(null)}
          className={getDropZoneClassName(
            "rounded-lg transition-colors",
            null
          )}
        >
          <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
            <h3 className="font-semibold text-slate-500">Other Tasks</h3>
            <span className="text-xs text-slate-400">
              {unsectionedTasks.length} task
              {unsectionedTasks.length === 1 ? "" : "s"}
            </span>
          </div>
          {unsectionedTasks.length > 0 ? (
            <div className="space-y-3">{unsectionedTasks.map(renderTask)}</div>
          ) : (
            <p className="min-h-[2.5rem] rounded-md border border-dashed border-emerald-300 p-3 text-xs italic text-slate-400">
              Drop tasks here to unassign
            </p>
          )}
        </div>
      )}
    </div>
  );
}
