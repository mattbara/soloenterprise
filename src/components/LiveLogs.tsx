import { RefreshButton } from "./RefreshButton";

interface LogEntry {
  id: string;
  taskId: string | null;
  level: string;
  message: string;
  createdAt: string;
}

interface LiveLogsProps {
  logs: LogEntry[];
}

const levelColors: Record<string, string> = {
  debug: "text-gray-500",
  info: "text-blue-600",
  warn: "text-yellow-600",
  error: "text-red-600",
};

const levelBgColors: Record<string, string> = {
  debug: "bg-gray-100",
  info: "bg-blue-50",
  warn: "bg-yellow-50",
  error: "bg-red-50",
};

// Pure server component - no client-side fetching, no state, no API calls
export function LiveLogs({ logs }: LiveLogsProps) {
  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:px-6 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Live Logs</h2>
          <p className="text-sm text-gray-500">Recent task execution logs</p>
        </div>
        <RefreshButton />
      </div>
      <div className="overflow-hidden">
        <div className="max-h-96 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No logs yet. Logs will appear here when tasks are running.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`px-4 py-2 ${levelBgColors[log.level] || "bg-white"}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-gray-400 flex-shrink-0 tabular-nums">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="text-gray-600 font-semibold flex-shrink-0">
                      [{log.taskId?.slice(0, 8) ?? 'system'}]
                    </span>
                    <span
                      className={`uppercase text-xs font-bold flex-shrink-0 ${
                        levelColors[log.level] || "text-gray-600"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-gray-800 break-words">{log.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
