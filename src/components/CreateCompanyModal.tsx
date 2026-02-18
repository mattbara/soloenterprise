"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface CreateCompanyModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateCompanyModal({ open, onClose }: CreateCompanyModalProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contactName: contactName.trim() || undefined,
          contactEmail: email.trim() || undefined,
          whatsappContact: whatsapp.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create company");
      }

      // Reset form
      setName("");
      setContactName("");
      setEmail("");
      setWhatsapp("");
      setNotes("");
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Company</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="company-name" className="block text-sm font-medium text-gray-700">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700">
              Contact Person
            </label>
            <input
              type="text"
              id="contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="contact-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="jane@acme.com"
            />
          </div>
          <div>
            <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-700">
              WhatsApp
            </label>
            <input
              type="text"
              id="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="+1 234 567 8900"
            />
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Any relevant notes about this company..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
