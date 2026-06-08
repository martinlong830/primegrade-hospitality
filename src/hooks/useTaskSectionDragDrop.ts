"use client";

import { useCallback, useState } from "react";
import { saveTask } from "@/lib/db";
import type { Task } from "@/lib/types";

const UNASSIGNED_KEY = "__unassigned__";

function sectionDropKey(sectionId: string | null): string {
  return sectionId ?? UNASSIGNED_KEY;
}

export function useTaskSectionDragDrop(tasks: Task[], onUpdate: () => void) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const isDragging = draggingTaskId !== null;

  const isDropTarget = useCallback(
    (sectionId: string | null) => {
      if (!draggingTaskId) return false;
      return dropTargetKey === sectionDropKey(sectionId);
    },
    [draggingTaskId, dropTargetKey]
  );

  const handleDragStart = useCallback((taskId: string) => {
    setDraggingTaskId(taskId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDropTargetKey(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, sectionId: string | null) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetKey(sectionDropKey(sectionId));
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent, sectionId: string | null) => {
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      setDropTargetKey((current) =>
        current === sectionDropKey(sectionId) ? null : current
      );
    },
    []
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetSectionId: string | null) => {
      e.preventDefault();
      const taskId = draggingTaskId ?? e.dataTransfer.getData("text/plain");
      if (!taskId) {
        handleDragEnd();
        return;
      }

      const task = tasks.find((t) => t.id === taskId);
      if (!task || (task.section_id ?? null) === targetSectionId) {
        handleDragEnd();
        return;
      }

      await saveTask({ ...task, section_id: targetSectionId });
      handleDragEnd();
      onUpdate();
    },
    [draggingTaskId, tasks, handleDragEnd, onUpdate]
  );

  const getDropZoneClassName = useCallback(
    (baseClass: string, sectionId: string | null) => {
      if (!isDropTarget(sectionId)) return baseClass;
      return `${baseClass} bg-emerald-50/80 ring-2 ring-emerald-400 ring-inset`;
    },
    [isDropTarget]
  );

  const getDragHandleProps = useCallback(
    (taskId: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", taskId);
        e.dataTransfer.effectAllowed = "move";
        handleDragStart(taskId);
      },
      onDragEnd: handleDragEnd,
    }),
    [handleDragStart, handleDragEnd]
  );

  const getSectionDropProps = useCallback(
    (sectionId: string | null) => ({
      onDragOver: (e: React.DragEvent) => handleDragOver(e, sectionId),
      onDragLeave: (e: React.DragEvent) => handleDragLeave(e, sectionId),
      onDrop: (e: React.DragEvent) => handleDrop(e, sectionId),
    }),
    [handleDragOver, handleDragLeave, handleDrop]
  );

  return {
    draggingTaskId,
    isDragging,
    isDropTarget,
    getDropZoneClassName,
    getDragHandleProps,
    getSectionDropProps,
    handleDragEnd,
  };
}
