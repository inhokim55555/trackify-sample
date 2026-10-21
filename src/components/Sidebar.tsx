"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Video,
  Users,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from "lucide-react";
import { CollectionTree } from "@/components/CollectionTree";
import { CampaignList } from "@/components/CampaignList";
import { AuthMenu } from "@/components/AuthMenu";
import { NotificationCenter } from "@/components/NotificationCenter";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/videos", label: "All Videos", icon: Video },
  { href: "/campaigns", label: "Campaigns", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const showCampaignTree = pathname.startsWith("/campaigns");

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-(--border) bg-white transition-[width] duration-200 ${
        collapsed ? "w-[68px]" : "w-[240px]"
      }`}
    >
      {/* Org switcher */}
      <div
        className={`flex items-center px-3 py-3 ${
          collapsed ? "justify-center" : "justify-between gap-2"
        }`}
      >
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              I
            </div>
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1 text-sm font-semibold">
                Sample Studio <ChevronDown size={14} className="text-gray-400" />
              </div>
              <div className="text-xs text-gray-400">Scale</div>
            </div>
          </div>
        ) : null}
        {onToggle ? (
          <button
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        ) : null}
      </div>

      {/* Primary nav */}
      <nav className="px-2">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`mb-0.5 flex items-center rounded-lg py-2 text-sm ${
                active
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-gray-600 hover:bg-gray-100"
              } ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}`}
            >
              <Icon size={17} />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>

      {/* Collections */}
      {!collapsed ? (
        <div className="mt-3 flex items-center justify-between px-4 py-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Collections
          </span>
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto scroll-thin">
        {!collapsed ? <CollectionTree /> : null}

        {showCampaignTree && !collapsed ? (
          <>
            <div className="mt-3 flex items-center gap-2 px-4 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Campaigns
              </span>
            </div>
            <CampaignList />
          </>
        ) : null}
      </div>

      {/* Usage + footer */}
      <div className="border-t border-(--border) p-3">
        {!collapsed ? (
          <>
            <div className="mb-3">
              <AuthMenu />
            </div>
            <div className="rounded-lg bg-brand-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-brand-700">
                <Sparkles size={13} /> Internal workspace
              </div>
              <p className="mt-1 text-[11px] leading-snug text-gray-500">
                Campaign management and tracked short-form video metrics.
              </p>
            </div>
          </>
        ) : null}
        <div
          className={`mt-3 flex items-center text-gray-500 ${
            collapsed ? "justify-center gap-0" : "gap-3 px-1"
          }`}
        >
          {!collapsed ? <NotificationCenter /> : null}
          <Link
            href="/settings"
            className="hover:text-gray-700"
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
