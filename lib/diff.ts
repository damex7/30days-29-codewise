// A line diff built from scratch with the longest common subsequence (LCS).
//
// Idea: the lines both versions share, in order, are the "unchanged"
// skeleton. Everything in the old file that isn't on that skeleton was
// removed (-), everything in the new file that isn't on it was added (+).
// The LONGEST such skeleton gives the smallest diff.
//
// How: build a table where cell [i][j] is the LCS length of old[i..] and
// new[j..]. If old[i] === new[j] the cell is 1 + [i+1][j+1]; otherwise
// it's the larger of [i+1][j] (skip an old line) and [i][j+1] (skip a new
// line). Then walk from [0][0]: equal lines -> "same", otherwise step in
// the direction of the larger neighbour, emitting "del" or "add".
// Cost is O(n × m) time and memory, so we first trim the common prefix and
// suffix (usually most of a fix) and cap the table size.
//
// Why compute it here? A model-written diff can be wrong or not match the
// code it claims to change. The app always diffs the real original against
// the model's corrected code, so what you see is exactly what changed.

export type DiffOp =
  | { type: "same"; text: string; oldLine: number; newLine: number }
  | { type: "del"; text: string; oldLine: number }
  | { type: "add"; text: string; newLine: number };

const MAX_CELLS = 4_000_000;

export function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop(); // trailing newline isn't a line
  return lines;
}

export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const ops: DiffOp[] = [];

  // 1. Common prefix.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    ops.push({ type: "same", text: a[start] ?? "", oldLine: start + 1, newLine: start + 1 });
    start++;
  }
  // 2. Common suffix (found now, emitted last).
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_CELLS) {
    // Too big for the table: show it as a full replace rather than hang.
    for (let i = start; i < endA; i++) ops.push({ type: "del", text: a[i] ?? "", oldLine: i + 1 });
    for (let j = start; j < endB; j++) ops.push({ type: "add", text: b[j] ?? "", newLine: j + 1 });
  } else {
    // 3. LCS table for the middle part, stored flat: cell(i, j) = t[i * (m + 1) + j].
    const w = m + 1;
    const t = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i * w + j] =
          a[start + i] === b[start + j] ? (t[(i + 1) * w + j + 1] ?? 0) + 1 : Math.max(t[(i + 1) * w + j] ?? 0, t[i * w + j + 1] ?? 0);
      }
    }
    // 4. Walk the table.
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        ops.push({ type: "same", text: a[start + i] ?? "", oldLine: start + i + 1, newLine: start + j + 1 });
        i++;
        j++;
      } else if ((t[(i + 1) * w + j] ?? 0) >= (t[i * w + j + 1] ?? 0)) {
        ops.push({ type: "del", text: a[start + i] ?? "", oldLine: start + i + 1 });
        i++;
      } else {
        ops.push({ type: "add", text: b[start + j] ?? "", newLine: start + j + 1 });
        j++;
      }
    }
    for (; i < n; i++) ops.push({ type: "del", text: a[start + i] ?? "", oldLine: start + i + 1 });
    for (; j < m; j++) ops.push({ type: "add", text: b[start + j] ?? "", newLine: start + j + 1 });
  }

  // 5. The common suffix.
  for (let k = 0; k < a.length - endA; k++) {
    ops.push({ type: "same", text: a[endA + k] ?? "", oldLine: endA + k + 1, newLine: endB + k + 1 });
  }
  return ops;
}

export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "add") added++;
    else if (op.type === "del") removed++;
  }
  return { added, removed };
}

/** Pairs rows for the side-by-side view: deletions next to the additions that replace them. */
export function sideBySide(ops: DiffOp[]): { left: DiffOp | null; right: DiffOp | null }[] {
  const rows: { left: DiffOp | null; right: DiffOp | null }[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (!op) break;
    if (op.type === "same") {
      rows.push({ left: op, right: op });
      i++;
      continue;
    }
    const dels: DiffOp[] = [];
    const adds: DiffOp[] = [];
    while (ops[i]?.type === "del") dels.push(ops[i++] as DiffOp);
    while (ops[i]?.type === "add") adds.push(ops[i++] as DiffOp);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k] ?? null, right: adds[k] ?? null });
  }
  return rows;
}
