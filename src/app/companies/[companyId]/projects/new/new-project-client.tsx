"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FullPageOverlay } from "@/components/FullPageOverlay";

interface BriefField {
  fieldKey: string;
  question: string;
  placeholder: string;
  type: "text" | "textarea";
  required?: boolean;
}

const BRIEF_FIELDS: BriefField[] = [
  {
    fieldKey: "projectName",
    question: "Project Name",
    placeholder: "My New App",
    type: "text",
    required: true,
  },
  {
    fieldKey: "whatToBuild",
    question: "What does the client need built?",
    placeholder: "Describe the product, features, and goals...",
    type: "textarea",
    required: true,
  },
  {
    fieldKey: "targetUsers",
    question: "Who are the target users?",
    placeholder: "E.g., small business owners, enterprise teams, end consumers...",
    type: "textarea",
  },
  {
    fieldKey: "integrations",
    question: "Existing systems to integrate with?",
    placeholder: "E.g., Stripe, Salesforce, internal APIs...",
    type: "textarea",
  },
  {
    fieldKey: "timeline",
    question: "Desired timeline?",
    placeholder: "E.g., 4 weeks, end of Q2...",
    type: "text",
  },
  {
    fieldKey: "budget",
    question: "Budget range?",
    placeholder: "E.g., $5k-$10k, $50k+...",
    type: "text",
  },
  {
    fieldKey: "constraints",
    question: "Technical constraints?",
    placeholder: "E.g., must use React, needs to run on AWS, HIPAA compliance...",
    type: "textarea",
  },
];

interface NewProjectClientProps {
  companyId: string;
  companyName: string;
}

export function NewProjectClient({ companyId, companyName }: NewProjectClientProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    router.push(`/companies/${companyId}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const projectName = answers.projectName?.trim();
    if (!projectName) {
      setError("Project name is required");
      setSubmitting(false);
      return;
    }

    const briefQuestions = BRIEF_FIELDS.filter((f) => f.fieldKey !== "projectName").map((f) => ({
      fieldKey: f.fieldKey,
      question: f.question,
      answer: answers[f.fieldKey]?.trim() || "",
    }));

    try {
      const res = await fetch(`/api/companies/${companyId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, briefQuestions }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }

      router.push(`/companies/${companyId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FullPageOverlay onClose={handleClose}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">New Project</h1>
        <p className="text-sm text-gray-500 mb-8">for {companyName}</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {BRIEF_FIELDS.map((field) => (
            <div key={field.fieldKey}>
              <label
                htmlFor={field.fieldKey}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {field.question}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={field.fieldKey}
                  value={answers[field.fieldKey] || ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={4}
                  className="block w-full rounded-md border border-gray-300 p-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              ) : (
                <input
                  type="text"
                  id={field.fieldKey}
                  value={answers[field.fieldKey] || ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  className="block w-full rounded-md border border-gray-300 p-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              )}
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Brief"}
            </button>
          </div>
        </form>
      </div>
    </FullPageOverlay>
  );
}
