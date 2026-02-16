import {
  FolderKanban,
  ListTodo,
  MessageCircleQuestion,
  Bot,
  FileText,
  AlertTriangle,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Questions", href: "/questions", icon: MessageCircleQuestion },
  { label: "Workers", href: "/workers", icon: Bot },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Errors", href: "/errors", icon: AlertTriangle },
  { label: "Settings", href: "/settings", icon: Settings },
];
