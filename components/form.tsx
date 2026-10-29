"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Accessible form building blocks used by every form:
// - Field: label + input + hint + inline error tied by aria-describedby.
// - ErrorSummary: lists all errors as links and takes focus after a failed
//   submit, so keyboard and screen-reader users land on what to fix.
// - SubmitButton: disabled with a pending label while the action runs.

export function ErrorSummary({ errors, labels, message }: { errors?: Record<string, string>; labels: Record<string, string>; message?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors ?? {});
  const show = entries.length > 0 || Boolean(message);
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show, errors, message]);
  if (!show) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="mb-5 rounded-md border-4 border-double border-strong bg-page p-4 text-ink">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ErrorIcon />
        {entries.length ? "Please fix the following" : "Something needs attention"}
      </h2>
      {message ? <p className="mt-1 text-sm">{message}</p> : null}
      {entries.length ? (
        <ul className="mt-2 list-disc pl-6 text-sm">
          {entries.map(([field, text]) => (
            <li key={field}>
              <a href={`#${field}`} className="underline">
                {labels[field] ?? field}: {text}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ErrorIcon() {
  // An octagon with an exclamation mark: the "error" shape used app-wide.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M6 1h6l5 5v6l-5 5H6l-5-5V6Z" fill="currentColor" />
      <path d="M9 4.5v5.5" stroke="var(--page)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="13" r="1.2" fill="var(--page)" />
    </svg>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (aria: { id: string; name: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

export function Field({ id, label, error, hint, children }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mb-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children({ id, name: id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ErrorIcon />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "block w-full min-h-11 rounded-md border border-line bg-page px-3 py-2 text-ink placeholder:text-muted aria-[invalid=true]:border-2 aria-[invalid=true]:border-strong";

export function SubmitButton({ children, pending: pendingLabel = "Working…", className = "" }: { children: ReactNode; pending?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-md bg-brand-btn px-5 font-semibold text-on-brand hover:opacity-90 disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
