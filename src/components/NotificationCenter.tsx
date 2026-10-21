"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/format";

interface NotificationResponse {
  data: {
    id: string;
    tone: "info" | "warning" | "danger" | "success";
    title: string;
    body: string;
    href: string;
    createdAt: string;
  }[];
}

const TONE_CLASS = {
  info: "bg-sky-50 text-sky-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  success: "bg-emerald-50 text-emerald-700",
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const notifications = useApi<NotificationResponse>(
    open ? "/api/notifications" : null,
    { cache: false }
  );
  const items = notifications.data?.data ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className="relative hover:text-gray-600"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={16} />
        {items.length ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
            {items.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute bottom-7 left-0 z-30 w-80 overflow-hidden rounded-xl border border-(--border) bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-(--border) px-3 py-2">
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <button
              onClick={() => notifications.reload()}
              className="text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              Refresh
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto scroll-thin">
            {notifications.loading ? (
              <div className="space-y-2 p-3">
                <div className="skeleton h-14 w-full" />
                <div className="skeleton h-14 w-full" />
              </div>
            ) : notifications.error ? (
              <div className="p-3 text-sm text-rose-600">
                {notifications.error}
              </div>
            ) : items.length ? (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-(--border) px-3 py-3 last:border-0 hover:bg-gray-50"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TONE_CLASS[item.tone]}`}
                    >
                      {item.tone}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {item.title}
                      </div>
                      <div className="mt-0.5 text-xs leading-5 text-gray-500">
                        {item.body}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400">
                        {formatDate(item.createdAt)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-4 text-sm text-gray-400">No notifications.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
