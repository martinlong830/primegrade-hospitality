"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  addDays,
  formatDisplayDate,
  formatFullDate,
  getToday,
  isFutureDate,
  isPastDate,
  isToday,
} from "@/lib/dates";

interface DateContextValue {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  goToToday: () => void;
  goPrevDay: () => void;
  goNextDay: () => void;
  isViewingToday: boolean;
  isViewingPast: boolean;
  isViewingFuture: boolean;
  displayLabel: string;
  fullLabel: string;
  readOnly: boolean;
  ready: boolean;
}

const DateContext = createContext<DateContextValue | null>(null);

export function DateProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDate(getToday());
  }, []);

  const resolvedDate = selectedDate ?? getToday();

  const goToToday = useCallback(() => setSelectedDate(getToday()), []);
  const goPrevDay = useCallback(
    () => setSelectedDate((d) => addDays(d ?? getToday(), -1)),
    []
  );
  const goNextDay = useCallback(
    () => setSelectedDate((d) => addDays(d ?? getToday(), 1)),
    []
  );

  const value = useMemo<DateContextValue>(
    () => ({
      selectedDate: resolvedDate,
      setSelectedDate,
      goToToday,
      goPrevDay,
      goNextDay,
      isViewingToday: isToday(resolvedDate),
      isViewingPast: isPastDate(resolvedDate),
      isViewingFuture: isFutureDate(resolvedDate),
      displayLabel: formatDisplayDate(resolvedDate),
      fullLabel: formatFullDate(resolvedDate),
      readOnly: !isToday(resolvedDate),
      ready: selectedDate !== null,
    }),
    [resolvedDate, selectedDate, goToToday, goPrevDay, goNextDay]
  );

  return (
    <DateContext.Provider value={value}>{children}</DateContext.Provider>
  );
}

export function useViewDate(): DateContextValue {
  const ctx = useContext(DateContext);
  if (!ctx) {
    throw new Error("useViewDate must be used within DateProvider");
  }
  return ctx;
}
