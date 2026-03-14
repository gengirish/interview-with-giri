import {
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Dna,
  FileText,
  Film,
  GitBranch,
  GraduationCap,
  MessageSquare,
  Settings,
  LayoutDashboard,
  Sparkles,
  Target,
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
  { label: "Decision Trees", href: "/dashboard/decision-trees", icon: GitBranch, roles: ["admin", "hiring_manager"] },
  { label: "Interviews", href: "/dashboard/interviews", icon: MessageSquare },
  { label: "Co-Pilot", href: "/dashboard/copilot", icon: Bot, roles: ["admin", "hiring_manager"] },
  { label: "Training", href: "/dashboard/training", icon: GraduationCap, roles: ["admin", "hiring_manager"] },
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
  { label: "Clips", href: "/dashboard/clips", icon: Film },
  { label: "Genome", href: "/dashboard/genome", icon: Dna },
  { label: "Predictions", href: "/dashboard/predictions", icon: Target, roles: ["admin"] },
  { label: "Knowledge", href: "/dashboard/knowledge", icon: BookOpen },
  { label: "Compare", href: "/dashboard/compare", icon: BarChart3 },
  { label: "Ask AI", href: "/dashboard/ask-ai", icon: Sparkles },
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
