"use client";

import { useState } from "react";
import { FixPromptModal } from "./FixPromptModal";

interface ErrorItem {
  taskId: string;
  taskName: string;
  type: "error" | "warning";
  message: string;
  files?: string[];
  createdAt: string;
  needsFix: boolean;
}

interface ErrorsTableProps {
  errors: ErrorItem[];
}

export function ErrorsTable({ errors }: ErrorsTableProps) {
  const [selectedError, setSelectedError] = useState<ErrorItem | null>(null);

  if (errors.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center">
        <div className="text-green-500 mb-2">
          <svg
            className="h-12 w-12 mx-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">No errors or warnings</h3>
        <p className="text-gray-500 mt-1">All tasks are running smoothly.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Task ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Message
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {errors.map((error, index) => (
              <tr key={`${error.taskId}-${index}`} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {error.taskId.slice(0, 8)}...
                  </code>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                    {error.taskName}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <TypeBadge type={error.type} />
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-600 max-w-md truncate" title={error.message}>
                    {error.message}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {error.needsFix ? (
                    <button
                      onClick={() => setSelectedError(error)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Get Fix Prompt
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400">No fix needed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedError && (
        <FixPromptModal
          isOpen={!!selectedError}
          onClose={() => setSelectedError(null)}
          taskId={selectedError.taskId}
          taskName={selectedError.taskName}
          errorType={selectedError.type}
          message={selectedError.message}
          files={selectedError.files}
        />
      )}
    </>
  );
}

function TypeBadge({ type }: { type: "error" | "warning" }) {
  const classes =
    type === "error"
      ? "bg-red-100 text-red-800"
      : "bg-orange-100 text-orange-800";

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      <span
        className={`w-2 h-2 rounded-full ${type === "error" ? "bg-red-500" : "bg-orange-500"}`}
      />
      {type === "error" ? "Error" : "Warning"}
    </span>
  );
}
