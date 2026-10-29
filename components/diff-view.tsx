"use client";

import { useState } from "react";
import { diffLines, diffStats, sideBySide, type DiffOp } from "@/lib/diff";

// Renders the app-computed diff (lib/diff.ts). Each changed line carries a
// visible text marker (+ / -) and a screen-reader word ("added" /
// "removed"); the background tint is only an extra cue, never the only one.

function Marker({ op }: { op: DiffOp | null }) {
  if (!op) return <span aria-hidden="true"> </span>;
  if (op.type === "add") return (<><span aria-hidden="true">+</span><span className="sr-only">added: </span></>);
  if (op.type === "del") return (<><span aria-hidden="true">-</span><span className="sr-only">removed: </span></>);
  return <span aria-hidden="true"> </span>;
}

const rowTint = (op: DiffOp | null) => (op?.type === "add" ? "bg-diff-add" : op?.type === "del" ? "bg-diff-del line-through decoration-white/40" : "");

function Cell({ op }: { op: DiffOp | null }) {
  const n = op ? (op.type === "add" ? op.newLine : op.type === "del" ? op.oldLine : op.newLine) : "";
  return (
    <div className={`flex ${rowTint(op)}`}>
      <span aria-hidden="true" className="w-12 shrink-0 select-none pr-2 text-right text-code-muted">{n}</span>
      <span className="w-5 shrink-0 select-none text-center font-bold"><Marker op={op} /></span>
      <code className="pr-4 whitespace-pre">{op ? op.text || " " : " "}</code>
    </div>
  );
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const [view, setView] = useState<"unified" | "split">("unified");
  const ops = diffLines(before, after);
  const { added, removed } = diffStats(ops);
  return (
    <figure className="code-panel min-w-0 overflow-hidden rounded-lg border border-code-line bg-code text-code-fg">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 px-3 py-2 text-xs">
        <span className="font-semibold">
          Diff, computed by Codewise: {added} line{added === 1 ? "" : "s"} added (+), {removed} removed (-)
        </span>
        <span role="group" aria-label="Diff layout" className="flex gap-1">
          {(["unified", "split"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className="min-h-9 rounded border border-white/40 px-3 font-semibold aria-pressed:bg-white aria-pressed:text-black"
            >
              {v === "unified" ? "Unified" : "Side by side"}
            </button>
          ))}
        </span>
      </figcaption>
      <div tabIndex={0} role="region" aria-label="Diff (scrollable)" className="max-h-[32rem] overflow-auto">
        {added + removed === 0 ? (
          <p className="p-3 text-sm">No changes: the corrected code is identical to yours.</p>
        ) : view === "unified" ? (
          <pre className="min-w-max py-2 font-mono text-[13px] leading-6">
            {ops.map((op, i) => <Cell key={i} op={op} />)}
          </pre>
        ) : (
          <div className="grid min-w-max grid-cols-2 py-2 font-mono text-[13px] leading-6">
            <p className="px-3 pb-1 font-sans text-xs font-semibold text-code-muted">Your code</p>
            <p className="px-3 pb-1 font-sans text-xs font-semibold text-code-muted">Corrected</p>
            {sideBySide(ops).map((row, i) => (
              <div key={i} className="contents">
                <pre className="m-0"><Cell op={row.left} /></pre>
                <pre className="m-0 border-l border-white/15"><Cell op={row.right} /></pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
