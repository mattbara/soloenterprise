"use client";

import { useState } from "react";
import { Modal } from "./Modal";

interface FixPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskName: string;
  errorType: "error" | "warning";
  message: string;
  files?: string[];
}

export function FixPromptModal({
  isOpen,
  onClose,
  taskId,
  taskName,
  errorType,
  message,
  files,
}: FixPromptModalProps) {
  const [copied, setCopied] = useState(false);

  const prompt = generateFixPrompt(taskName, errorType, message, files);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fix Prompt for Claude Code">
      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          Copy this prompt and paste it into Claude Code to fix the issue:
        </div>

        <div className="relative">
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto max-h-96 whitespace-pre-wrap">
            {prompt}
          </pre>
          <button
            onClick={copyToClipboard}
            className="absolute top-2 right-2 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
          >
            Close
          </button>
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {copied ? "Copied!" : "Copy Prompt"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function generateFixPrompt(
  taskName: string,
  errorType: "error" | "warning",
  message: string,
  files?: string[]
): string {
  const fileList = files?.length ? `\nAffected files:\n${files.map((f) => `- ${f}`).join("\n")}` : "";

  if (errorType === "error") {
    return `Fix this error in task "${taskName}":

${message}
${fileList}

Please:
1. Identify the root cause
2. Fix the issue
3. Verify the fix compiles/runs correctly`;
  }

  return `Fix these syntax warnings in task "${taskName}":

${message}
${fileList}

Please:
1. Review the generated code at packages/core/generated/tasks/
2. Fix the syntax issues identified
3. Verify the code compiles without errors`;
}
