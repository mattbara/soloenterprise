interface Stats {
  projects: number;
  pendingTasks: number;
  runningTasks: number;
  waitingHuman: number;
  pendingQuestions: number;
  activeLocks: number;
}

interface OverviewStatsProps {
  stats: Stats;
}

const STAT_ROWS: { key: keyof Stats; label: string; color: string }[] = [
  { key: "projects", label: "Projects", color: "bg-blue-500" },
  { key: "pendingTasks", label: "Pending Tasks", color: "bg-yellow-500" },
  { key: "runningTasks", label: "Running Tasks", color: "bg-green-500" },
  { key: "waitingHuman", label: "Waiting Human", color: "bg-orange-500" },
  { key: "pendingQuestions", label: "Pending Questions", color: "bg-red-500" },
  { key: "activeLocks", label: "Active File Locks", color: "bg-purple-500" },
];

export function OverviewStats({ stats }: OverviewStatsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Overview</h3>
      </div>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" colSpan={2}>
              Metric
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {STAT_ROWS.map((row) => (
            <tr key={row.key} className="hover:bg-gray-50">
              <td className="pl-4 py-2 w-6">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${row.color}`} />
              </td>
              <td className="px-2 py-2 text-sm text-gray-700">{row.label}</td>
              <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{stats[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
