"use client";

import { useCallback, useEffect, useState } from "react";
import type { CareerOpportunity } from "../types";
import type { ProviderResult } from "./providers";

export interface LiveJobsState {
  status: "loading" | "ready" | "error";
  configured: boolean;
  listings: CareerOpportunity[];
  providers: ProviderResult[];
  fetchedAt?: string;
  refresh: () => void;
}

export function useLiveJobs(): LiveJobsState {
  const [state, setState] = useState<Omit<LiveJobsState, "refresh">>({ status: "loading", configured: false, listings: [], providers: [] });
  const load = useCallback((refresh = false) => {
    setState((s) => ({ ...s, status: "loading" }));
    fetch(`/api/jobs${refresh ? "?refresh=1" : ""}`)
      .then((r) => r.json())
      .then((d) => setState({ status: "ready", configured: !!d.configured, listings: Array.isArray(d.listings) ? d.listings : [], providers: d.providers ?? [], fetchedAt: d.fetchedAt }))
      .catch(() => setState({ status: "error", configured: false, listings: [], providers: [] }));
  }, []);
  useEffect(() => load(), [load]);
  return { ...state, refresh: () => load(true) };
}
