"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function RefreshButton() {
  const [loading, setLoading] = useState(false);

  async function handleRefresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/olap/refresh", {
        method: "POST",
      });
      if (response.ok) {
        window.location.reload();
      } else {
        console.error("Refresh failed", await response.text());
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleRefresh}
      disabled={loading}
    >
      <RefreshCw
        className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`}
      />
      Refresh
    </Button>
  );
}
