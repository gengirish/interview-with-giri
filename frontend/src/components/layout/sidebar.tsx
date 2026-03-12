"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  LogOut,
  MessageSquare,
  Settings,
  LayoutDashboard,
  Users,
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
  { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["admin"] },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { role, hasRole, logout } = useAuth();

  const visibleItems = navItems.filter(
    (item) => !item.roles || (role && hasRole(...item.roles)),
  );

  return (
    <aside
      className={cn(
        "flex w-64 flex-col border-r border-slate-200 bg-white",
        className,
      )}
      data-testid="sidebar"
    >
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
        <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <MessageSquare className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold text-slate-900">InterviewBot</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
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
          <div className="mb-2 px-3 text-xs text-slate-400 uppercase tracking-wider">
            {role.replace("_", " ")}
          </div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
