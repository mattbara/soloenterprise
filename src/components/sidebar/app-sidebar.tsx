"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeft, Menu } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";

interface AppSidebarProps {
  errorCount: number;
  warningCount: number;
}

export function AppSidebar({ errorCount, warningCount }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const totalIssues = errorCount + warningCount;

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md bg-white p-2 shadow-md lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200",
          "lg:relative lg:z-auto",
          collapsed ? "w-16" : "w-56",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        {/* Logo + collapse toggle */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-3">
          {!collapsed && (
            <span className="text-sm font-bold text-gray-900 truncate">
              SoloEnterprise
            </span>
          )}
          <button
            onClick={() => {
              setCollapsed(!collapsed);
              setMobileOpen(false);
            }}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href + "/"));
              const Icon = item.icon;
              const isErrors = item.href === "/errors";
              const showBadge = isErrors && totalIssues > 0 && !isActive;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMobileOpen(false)}
                    className={[
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                      collapsed ? "justify-center" : "",
                    ].join(" ")}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      className={[
                        "h-5 w-5 shrink-0",
                        isActive
                          ? "text-blue-600"
                          : "text-gray-400 group-hover:text-gray-600",
                      ].join(" ")}
                    />
                    {!collapsed && <span>{item.label}</span>}
                    {showBadge && (
                      <span
                        className={[
                          "absolute flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white",
                          collapsed
                            ? "right-1 top-1"
                            : "right-2 top-1/2 -translate-y-1/2",
                          errorCount > 0 ? "bg-red-500" : "bg-orange-500",
                        ].join(" ")}
                      >
                        {totalIssues > 9 ? "9+" : totalIssues}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
