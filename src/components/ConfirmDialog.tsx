"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Styled replacements for window.confirm / window.prompt so destructive and
 * naming actions look and behave consistently across the app.
 * Both close on Escape and backdrop click and move focus into the dialog.
 */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** Return the action's promise to keep the dialog pending and surface rejection. */
  onConfirm: () => unknown;
  onClose: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogForm key={JSON.stringify([props.title, props.message])} {...props} />;
}

function ConfirmDialogForm({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: Omit<ConfirmDialogProps, "open">) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = busy || submitting;

  useEffect(() => {
    mounted.current = true;
    confirmRef.current?.focus();
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !working) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [working, onClose]);

  async function confirm() {
    if (working || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "The action could not be completed. Please try again.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !working) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-busy={working}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          {danger ? (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertTriangle size={16} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-gray-900">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-5 text-gray-600">{message}</p>
          </div>
          <button
            onClick={onClose}
            disabled={working}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        {error ? <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={working}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={confirm}
            disabled={working}
            className={`rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              danger
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {working ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NameDialogProps {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  /** Return the save promise; the dialog closes only after it resolves. */
  onSubmit: (value: string) => unknown;
  onClose: () => void;
}

export function NameDialog(props: NameDialogProps) {
  if (!props.open) return null;
  return <NameDialogForm key={props.defaultValue ?? ""} {...props} />;
}

function NameDialogForm({
  title,
  label = "Name",
  placeholder = "",
  defaultValue = "",
  submitLabel = "Save",
  onSubmit,
  onClose,
}: Omit<NameDialogProps, "open">) {
  const [value, setValue] = useState(defaultValue);
  const inputId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || submitting || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      if (mounted.current) onClose();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "The name could not be saved. Please try again.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-busy={submitting}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-gray-600">
          {label}
        </label>
        <input
          id={inputId}
          autoFocus
          value={value}
          disabled={submitting}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        {error ? <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !value.trim()}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
