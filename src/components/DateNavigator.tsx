"use client";

import { useViewDate } from "@/contexts/DateContext";

export default function DateNavigator() {
  const {
    selectedDate,
    setSelectedDate,
    goPrevDay,
    goNextDay,
    isViewingPast,
    ready,
  } = useViewDate();

  if (!ready) {
    return (
      <div className="h-[42px] w-[14.5rem] shrink-0 rounded-lg border border-slate-200 bg-slate-50" />
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={goPrevDay}
          aria-label="Previous day"
          className="rounded-l-lg px-3 py-2 text-slate-600 hover:bg-slate-50"
        >
          ‹
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          aria-label="Select date"
          className="w-[9.5rem] border-x border-slate-200 px-2 py-2 text-sm font-medium text-slate-900"
        />
        <button
          type="button"
          onClick={goNextDay}
          aria-label="Next day"
          className="rounded-r-lg px-3 py-2 text-slate-600 hover:bg-slate-50"
        >
          ›
        </button>
      </div>

      {isViewingPast && (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          History
        </span>
      )}
    </div>
  );
}
