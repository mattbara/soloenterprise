interface StatusBadgeProps {
  status: string;
}

const statusClasses: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  queued: "bg-blue-100 text-blue-800",
  running: "bg-green-100 text-green-800",
  waiting_human: "bg-yellow-100 text-yellow-800",
  blocked: "bg-orange-100 text-orange-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
        statusClasses[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
