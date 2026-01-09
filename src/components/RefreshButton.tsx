"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./Button";

export function RefreshButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    // Brief delay to show feedback
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <Button
      variant="secondary"
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="text-xs px-2 py-1"
    >
      {isRefreshing ? "Refreshing..." : "Refresh"}
    </Button>
  );
}
