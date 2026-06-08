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
  readOnly?: boolean;
  viewMode?: "today" | "past" | "future";
  viewDateLabel?: string;
}

export default function ChecklistView({
  tasks,
  sections,
  completions,
  users,
  currentUser,
  station,
  onUpdate,
  readOnly = false,
  viewMode = "today",
  viewDateLabel,
}: ChecklistViewProps) {
  const stationTasks = tasks.filter((t) => t.station_id === station.id);
  const stationSections = getSectionsForStation(sections, station.id);

  const {
    draggingTaskId,
    isDragging,
    getDropZoneClassName,
    getDragHandleProps,
    getSectionDropProps,
  } = useTaskSectionDragDrop(stationTasks, readOnly ? () => {} : onUpdate);

  const getCompletion = (taskId: string) =>
    completions.find((c) => c.task_id === taskId);

  const getUserName = (userId: string | null) => {
    if (!userId) return null;
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  };

  const handleToggle = async (task: Task) => {
    if (readOnly) return;
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
        {!readOnly && (
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
        )}
        <label
          className={`flex flex-1 items-start gap-4 rounded-lg border p-4 transition-all ${
            readOnly ? "cursor-default" : "cursor-pointer"
          } ${
            completion
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <input
            type="checkbox"
            checked={!!completion}
            disabled={readOnly}
            onChange={() => handleToggle(task)}
            className="mt-1 h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-60"
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
  const upcomingTasks = stationTasks.filter((t) => !getCompletion(t.id));
  const completedTasks = stationTasks.filter((t) => getCompletion(t.id));

  const renderSectionBlock = (
    section: TaskSection | null,
    sectionTasks: Task[],
    options: { muted?: boolean } = {}
  ) => {
    if (sectionTasks.length === 0 && !isDragging) return null;

    const sectionId = section?.id ?? null;
    const completed = sectionTasks.filter((t) => getCompletion(t.id)).length;
    const timingSummary = section ? formatSectionTimingSummary(section) : null;
    const title = section?.name ?? "Other Tasks";

    return (
      <div
        key={section?.id ?? "unsectioned"}
        {...getSectionDropProps(sectionId)}
        className={getDropZoneClassName(
          "rounded-lg transition-colors",
          sectionId
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          <h4
            className={`font-semibold ${options.muted ? "text-slate-500" : "text-slate-900"}`}
          >
            {title}
          </h4>
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
  };

  const renderTaskGroup = (
    tasksToShow: Task[],
    emptyMessage: string
  ) => {
    if (tasksToShow.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          {emptyMessage}
        </p>
      );
    }

    const taskIds = new Set(tasksToShow.map((t) => t.id));
    const sectionsWithTasks = stationSections.filter((section) =>
      tasksToShow.some((t) => t.section_id === section.id)
    );
    const unsectionedInGroup = tasksToShow.filter((t) => !t.section_id);

    return (
      <div className="space-y-5">
        {sectionsWithTasks.map((section) =>
          renderSectionBlock(
            section,
            tasksToShow.filter((t) => t.section_id === section.id)
          )
        )}
        {(unsectionedInGroup.length > 0 || (isDragging && unsectionedTasks.some((t) => taskIds.has(t.id)))) &&
          renderSectionBlock(
            null,
            unsectionedInGroup,
            { muted: true }
          )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {readOnly && viewDateLabel && viewMode === "past" && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Viewing <span className="font-medium text-slate-900">{viewDateLabel}</span>
          {" — "}
          {completedTasks.length > 0
            ? `${completedTasks.length} task(s) were completed on this day.`
            : "No tasks were completed on this day."}{" "}
          History is read-only.
        </p>
      )}

      <section>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Upcoming Tasks</h2>
        {renderTaskGroup(
          upcomingTasks,
          "All caught up — no upcoming tasks for this station."
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Complete Tasks</h2>
        {renderTaskGroup(
          completedTasks,
          "No tasks completed yet today."
        )}
      </section>
    </div>
  );
}
