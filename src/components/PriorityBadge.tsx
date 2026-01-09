interface PriorityBadgeProps {
  priority: string;
}

const priorityClasses: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-800",
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
        priorityClasses[priority] || "bg-gray-100 text-gray-800"
      }`}
    >
      {priority}
    </span>
  );
}
