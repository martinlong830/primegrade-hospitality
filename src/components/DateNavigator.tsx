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
      <div
        className="h-[42px] w-full shrink-0 rounded-lg border border-slate-200 bg-slate-50 lg:w-[20rem]"
        aria-hidden
      />
    );
  }

  return (
    <div className="flex w-full shrink-0 items-center justify-center gap-2 lg:w-[20rem]">
      <div className="flex w-full shrink-0 items-center rounded-lg border border-slate-200 bg-white sm:w-[14.5rem]">
        <button
          type="button"
          onClick={goPrevDay}
          aria-label="Previous day"
          className="shrink-0 rounded-l-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 sm:px-3"
        >
          ‹
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          aria-label="Select date"
          className="w-full min-w-0 flex-1 border-x border-slate-200 px-2 py-2 text-sm font-medium text-slate-900 sm:w-[9.5rem] sm:flex-none"
        />
        <button
          type="button"
          onClick={goNextDay}
          aria-label="Next day"
          className="shrink-0 rounded-r-lg px-2.5 py-2 text-slate-600 hover:bg-slate-50 sm:px-3"
        >
          ›
        </button>
      </div>

      <span
        className={`hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 sm:inline ${
          isViewingPast ? "" : "invisible"
        }`}
        aria-hidden={!isViewingPast}
      >
        History
      </span>
    </div>
  );
}
