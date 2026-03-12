"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  LayoutDashboard,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, type UserRole } from "@/hooks/use-auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
  { label: "Interviews", href: "/dashboard/interviews", icon: MessageSquare },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  {
    label: "Team",
    href: "/dashboard/team",
    icon: Users,
    roles: ["admin"],
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["admin"],
  },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { role, hasRole, logout } = useAuth();

  const visibleItems = navItems.filter(
    (item) => !item.roles || (role && hasRole(...item.roles)),
  );

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">InterviewBot</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6 text-slate-600" />
        </button>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">InterviewBot</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="h-6 w-6 text-slate-600" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          {role && (
            <div className="mb-2 px-3 text-xs uppercase tracking-wider text-slate-400">
              {role.replace("_", " ")}
            </div>
          )}
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
