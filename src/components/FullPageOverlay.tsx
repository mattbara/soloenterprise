"use client";

import { X } from "lucide-react";

interface FullPageOverlayProps {
  onClose: () => void;
  children: React.ReactNode;
}

export function FullPageOverlay({ onClose, children }: FullPageOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      <button
        onClick={onClose}
        className="fixed right-4 top-4 z-50 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
