"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "@/lib/theme";

// Three choices: follow the system, or force light/dark. The choice lives
// in localStorage and on <html data-theme>. The inline script in the root
// layout applies it before the first paint, so there is no flash.

type Choice = "system" | "light" | "dark";
const ORDER: Choice[] = ["system", "light", "dark"];

function read(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply(choice: Choice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* private mode: the choice just won't persist */
  }
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  listeners.forEach((fn) => fn());
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as Choice);
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? "system";
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink hover:bg-card"
      aria-label={`Theme: ${choice}. Switch to ${next}.`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" />
      </svg>
      <span className="capitalize">{choice}</span>
    </button>
  );
}

