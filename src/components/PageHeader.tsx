"use client";

import type { ReactNode } from "react";
import DateNavigator from "@/components/DateNavigator";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  actions: ReactNode;
  maxWidthClass?: string;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  maxWidthClass = "max-w-5xl",
}: PageHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className={`mx-auto px-4 py-3 sm:py-4 ${maxWidthClass}`}>
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem_minmax(0,1fr)] lg:items-center lg:gap-4">
          <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
                {title}
              </h1>
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {subtitle}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 lg:hidden">
              {actions}
            </div>
          </div>

          <div className="flex w-full justify-center lg:justify-self-center">
            <DateNavigator />
          </div>

          <div className="hidden shrink-0 items-center justify-end gap-3 lg:flex">
            {actions}
          </div>
        </div>
      </div>
    </header>
  );
}
