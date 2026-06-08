"use client";

import {
  completeTask,
  formatTimingSummary,
  getSectionLabel,
  getSectionScheduleGroup,
  uncompleteTask,
} from "@/lib/db";
import type {
  Station,
  Task,
  TaskCompletion,
  TaskSection,
  User,
} from "@/lib/types";

interface EmployeeTaskListProps {
  tasks: Task[];
  stations: Station[];
  sections: TaskSection[];
  completions: TaskCompletion[];
  users: User[];
  currentUser: User;
  onUpdate: () => void;
  readOnly?: boolean;
  viewMode?: "today" | "past" | "future";
  viewDateLabel?: string;
}

export default function EmployeeTaskList({
  tasks,
  stations,
  sections,
  completions,
  users,
  currentUser,
  onUpdate,
  readOnly = false,
  viewMode = "today",
  viewDateLabel,
}: EmployeeTaskListProps) {
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

  const upcomingTasks = tasks.filter((t) => !getCompletion(t.id));
  const completedTasks = tasks.filter((t) => getCompletion(t.id));

  const renderTask = (
    task: Task,
    station: Station | undefined,
    options: { showStation?: boolean; showSection?: boolean } = {}
  ) => {
    const { showStation = true, showSection = true } = options;
    const completion = getCompletion(task.id);
    const assigned = getUserName(task.assigned_user_id);
    const timingSummary = formatTimingSummary(task);
    const sectionName = getSectionLabel(task.section_id, sections);

    return (
      <label
        key={task.id}
        className={`flex items-start gap-4 rounded-lg border p-4 transition-all ${
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
          className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-60"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-medium ${completion ? "text-emerald-800 line-through" : "text-slate-900"}`}
            >
              {task.title}
            </span>
            {showStation && station && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-700"
                style={{ backgroundColor: `${station.color}22` }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: station.color }}
                />
                {station.name}
              </span>
            )}
            {showSection && sectionName !== "Unassigned" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {sectionName}
              </span>
            )}
            {assigned && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {assigned}
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
    );
  };

  const getSection = (sectionId: string | null) =>
    sectionId ? sections.find((s) => s.id === sectionId) : null;

  const sortTasks = (taskList: Task[]) =>
    [...taskList].sort((a, b) => {
      const stationA = stations.findIndex((s) => s.id === a.station_id);
      const stationB = stations.findIndex((s) => s.id === b.station_id);
      if (stationA !== stationB) return stationA - stationB;

      const sectionA = getSection(a.section_id);
      const sectionB = getSection(b.section_id);
      const orderA = sectionA?.sort_order ?? 999;
      const orderB = sectionB?.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;

      return a.sort_order - b.sort_order;
    });

  const renderByTime = (tasksToShow: Task[]) => {
    if (tasksToShow.length === 0) return null;

    const groupMap = new Map<
      string,
      {
        key: string;
        sortKey: number;
        label: string;
        subtitle: string | null;
        tasks: Task[];
      }
    >();

    for (const task of tasksToShow) {
      const section = getSection(task.section_id);
      const schedule = getSectionScheduleGroup(section);

      const existing = groupMap.get(schedule.key);
      if (existing) {
        existing.tasks.push(task);
      } else {
        groupMap.set(schedule.key, { ...schedule, tasks: [task] });
      }
    }

    const timeGroups = [...groupMap.values()].sort(
      (a, b) => a.sortKey - b.sortKey || a.label.localeCompare(b.label)
    );

    return (
      <div className="space-y-6">
        {timeGroups.map((group) => {
          const sortedTasks = sortTasks(group.tasks);

          const stationGroups = stations
            .map((station) => ({
              station,
              tasks: sortedTasks.filter((t) => t.station_id === station.id),
            }))
            .filter(({ tasks: stationTasks }) => stationTasks.length > 0);

          return (
            <div key={group.key} className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{group.label}</h3>
                  {group.subtitle && group.subtitle !== group.label && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {group.subtitle}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {group.tasks.length} task
                  {group.tasks.length === 1 ? "" : "s"}
                </p>
              </div>

              {stationGroups.map(({ station, tasks: stationTasks }) => {
                const sectionGroups = [
                  ...new Set(stationTasks.map((t) => t.section_id ?? "")),
                ]
                  .map((sectionKey) => {
                    const sectionTasks = stationTasks
                      .filter((t) => (t.section_id ?? "") === sectionKey)
                      .sort((a, b) => a.sort_order - b.sort_order);
                    const section = getSection(sectionKey || null);
                    return { section, tasks: sectionTasks };
                  })
                  .sort(
                    (a, b) =>
                      (a.section?.sort_order ?? 999) -
                      (b.section?.sort_order ?? 999)
                  );

                return (
                  <div key={station.id} className="space-y-3 pl-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: station.color }}
                      />
                      <h4 className="text-sm font-medium text-slate-800">
                        {station.name}
                      </h4>
                    </div>

                    {sectionGroups.map(({ section, tasks: sectionTasks }) => (
                      <div
                        key={section?.id ?? "unsectioned"}
                        className="space-y-2 pl-3"
                      >
                        {section && (
                          <p className="text-xs font-medium text-slate-500">
                            {section.name}
                          </p>
                        )}
                        <div className="space-y-2">
                          {sectionTasks.map((task) =>
                            renderTask(task, station, {
                              showStation: false,
                              showSection: false,
                            })
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const renderTaskGroup = (tasksToShow: Task[], emptyMessage: string) => {
    if (tasksToShow.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          {emptyMessage}
        </p>
      );
    }
    return renderByTime(tasksToShow);
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-slate-500">No tasks assigned yet.</p>
      </div>
    );
  }

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
          "All caught up — no upcoming tasks across locations."
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Complete Tasks</h2>
        {renderTaskGroup(
          completedTasks,
          "No tasks completed yet for this day."
        )}
      </section>
    </div>
  );
}
