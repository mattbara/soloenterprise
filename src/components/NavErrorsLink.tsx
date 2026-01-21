"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ERRORS_SEEN_KEY = "soloenterprise_errors_seen_count";

interface NavErrorsLinkProps {
  errorCount: number;
  warningCount: number;
}

export function NavErrorsLink({ errorCount, warningCount }: NavErrorsLinkProps) {
  const [showBadge, setShowBadge] = useState(false);
  const pathname = usePathname();

  const hasErrors = errorCount > 0;
  const totalIssues = errorCount + warningCount;
  const isActive = pathname === "/errors";

  // Check if there are unseen errors and mark as seen when on errors page
  useEffect(() => {
    if (isActive) {
      // On errors page - mark as seen
      localStorage.setItem(ERRORS_SEEN_KEY, String(totalIssues));
      setShowBadge(false);
    } else {
      // Not on errors page - check if there are unseen errors
      const seenCount = parseInt(localStorage.getItem(ERRORS_SEEN_KEY) || "0", 10);
      setShowBadge(totalIssues > seenCount);
    }
  }, [totalIssues, isActive]);

  return (
    <Link
      href="/errors"
      prefetch={false}
      className={`relative inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
        isActive
          ? "border-blue-500 text-gray-900"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
      }`}
    >
      Errors
      {showBadge && totalIssues > 0 && (
        <span
          className={`absolute -top-1 -right-3 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium text-white ${
            hasErrors ? "bg-red-500" : "bg-orange-500"
          }`}
        >
          {totalIssues > 9 ? "9+" : totalIssues}
        </span>
      )}
    </Link>
  );
}
