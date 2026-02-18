import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  MessageCircleQuestion,
  BarChart3,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Questions", href: "/questions", icon: MessageCircleQuestion },
  { label: "Metrics", href: "/metrics", icon: BarChart3 },
  { label: "Errors", href: "/errors", icon: AlertTriangle },
];
