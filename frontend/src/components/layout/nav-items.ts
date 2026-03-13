import {
  BarChart3,
  Briefcase,
  FileText,
  MessageSquare,
  Settings,
  LayoutDashboard,
  Users,
} from "lucide-react";
import type { UserRole } from "@/hooks/use-auth";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
  { label: "Interviews", href: "/dashboard/interviews", icon: MessageSquare },
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
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
