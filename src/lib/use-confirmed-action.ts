"use client";

import { useEffect, useRef, useState } from "react";

/** Keep the editor open on rejection and ignore completion after its target unmounts. */
export function useConfirmedAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function run<T>(operation: () => Promise<T>, onSaved: (saved: T) => void) {
    if (pending.current || !active.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await operation();
      if (active.current) onSaved(saved);
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "Could not save. Please retry.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { busy, error, clearError: () => setError(null), run };
}
