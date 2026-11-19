"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { handOffQuestion } from "./handoff";

/** Opens the Assistant with a prefilled question. Nothing is sent until the Assistant page loads it. */
export function useAskAssistant() {
  const router = useRouter();
  return useCallback((question: string) => {
    handOffQuestion(question);
    router.push("/assistant");
  }, [router]);
}
