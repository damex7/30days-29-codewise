import { z } from "zod";

// Keyset cursors travel in the URL as opaque base64url "<timestamp>|<uuid>".
// They are validated on the way back in: a hand-edited cursor is ignored
// rather than reaching SQL.

const cursorSchema = z.object({
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T][\d:.]+([+-]\d{2}(:?\d{2})?|Z)?$/),
  id: z.uuid(),
});

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(`${at}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): { at: string; id: string } | undefined {
  if (!value || value.length > 200) return undefined;
  try {
    const [at, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    const parsed = cursorSchema.safeParse({ at, id });
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
