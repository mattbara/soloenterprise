"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Brief {
  id: string;
  title: string;
  rawContent: string;
  status: string;
  clientId: string | null;
  createdAt: string;
  client: { id: string; name: string; contactEmail: string | null } | null;
  scope: { id: string; status: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  received: "bg-gray-100 text-gray-800",
  scoping: "bg-blue-100 text-blue-800",
  scoped: "bg-green-100 text-green-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

export default function BriefsPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchBriefs = useCallback(async () => {
    try {
      const res = await fetch("/api/briefs");
      if (!res.ok) throw new Error("Failed to fetch briefs");
      const data = await res.json();
      setBriefs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch briefs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  // Auto-refresh while any brief is in 'scoping' status
  useEffect(() => {
    const hasScoping = briefs.some((b) => b.status === "scoping");
    if (!hasScoping) return;

    const interval = setInterval(fetchBriefs, 5000);
    return () => clearInterval(interval);
  }, [briefs, fetchBriefs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMessage(null);

    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          clientName: clientName.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit brief");
      }

      const result = await res.json();
      setSubmitMessage({ type: "success", text: `Brief submitted. ID: ${result.briefId}` });
      setTitle("");
      setClientName("");
      setContactEmail("");
      setContent("");
      // Refresh list with new brief
      fetchBriefs();
    } catch (err) {
      setSubmitMessage({ type: "error", text: err instanceof Error ? err.message : "Submit failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Briefs</h1>

      {/* Submit New Brief */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Submit New Brief</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
              placeholder="Project title"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-gray-700">
                Client Name
              </label>
              <input
                type="text"
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">
                Contact Email
              </label>
              <input
                type="email"
                id="contactEmail"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                placeholder="client@example.com"
              />
            </div>
          </div>
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700">
              Brief Content <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={8}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
              placeholder="Describe what the client needs built..."
            />
          </div>
          <div className="flex items-center space-x-4">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Brief"}
            </button>
            {submitMessage && (
              <span className={`text-sm ${submitMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {submitMessage.text}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Briefs List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">All Briefs</h2>
          {briefs.some((b) => b.status === "scoping") && (
            <span className="text-xs text-blue-600 animate-pulse">Auto-refreshing...</span>
          )}
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-gray-500">Loading briefs...</div>
        ) : error ? (
          <div className="px-6 py-8 text-center text-red-500">{error}</div>
        ) : briefs.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No briefs yet. Submit one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {briefs.map((brief) => (
                  <tr key={brief.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {brief.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {brief.client?.name || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[brief.status] || "bg-gray-100 text-gray-800"}`}>
                        {brief.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(brief.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {brief.scope ? (
                        <Link
                          href={`/briefs/${brief.id}/scope`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Scope
                        </Link>
                      ) : brief.status === "scoping" ? (
                        <span className="text-gray-400">Scoping...</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
