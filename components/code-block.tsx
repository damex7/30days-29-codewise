"use client";

import { useState } from "react";

// Plain monospaced code with line numbers, no syntax highlighting. A
// regex highlighter across nine languages gets strings, template literals
// and comments wrong often enough to mislead, and colour-only cues don't
// help everyone. Plain text on black is accurate for every language and
// readable in both themes.
//
// Line numbers are aria-hidden and unselectable, so copying the code (or
// a screen reader reading it) gets only the code. The scroll box is
// keyboard-focusable: arrow keys scroll long lines inside the panel, and
// the page itself never scrolls sideways.

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the code is still selectable */
        }
      }}
      className="min-h-9 rounded border border-white/40 px-3 text-xs font-semibold text-code-fg hover:bg-white/10"
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

export function CodeBlock({
  code,
  label,
  startLine = 1,
  highlight,
  copy = true,
  maxHeight = "32rem",
  actions,
}: {
  code: string;
  label: string;
  startLine?: number;
  highlight?: { start: number; end: number } | undefined;
  copy?: boolean;
  maxHeight?: string;
  actions?: React.ReactNode;
}) {
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  const width = String(startLine + lines.length - 1).length;
  return (
    <figure className="code-panel min-w-0 overflow-hidden rounded-lg border border-code-line bg-code text-code-fg">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 px-3 py-2 text-xs">
        <span className="font-semibold">{label}</span>
        <span className="flex flex-wrap gap-2">
          {actions}
          {copy ? <CopyButton text={code} /> : null}
        </span>
      </figcaption>
      <div tabIndex={0} role="region" aria-label={`${label} (scrollable)`} className="overflow-auto" style={{ maxHeight }}>
        <pre className="min-w-max py-2 font-mono text-[13px] leading-6">
          {lines.map((line, i) => {
            const n = startLine + i;
            const lit = highlight && n >= highlight.start && n <= highlight.end;
            return (
              <div key={i} className={`flex ${lit ? "bg-diff-add" : ""}`}>
                <span aria-hidden="true" className="select-none pr-4 pl-3 text-right text-code-muted" style={{ minWidth: `${width + 3}ch` }}>
                  {n}
                </span>
                <code className="pr-4 whitespace-pre">{line || " "}</code>
              </div>
            );
          })}
        </pre>
      </div>
    </figure>
  );
}
