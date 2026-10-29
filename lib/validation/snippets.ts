import { z } from "zod";
import { LANGUAGE_IDS } from "@/lib/constants";

/** "React, Utils ,frontend" -> ["react","utils","frontend"]: lowercase, deduped, max 8. */
export const tagsField = z
  .string()
  .max(300)
  .default("")
  .transform((raw) => [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))])
  .pipe(
    z
      .array(z.string().max(24, "Keep each tag under 24 characters.").regex(/^[a-z0-9][a-z0-9+#.-]*$/, "Tags can use letters, numbers and + # . - only."))
      .max(8, "Use at most 8 tags."),
  );

export const snippetSchema = z.object({
  title: z.string().trim().min(1, "Give the snippet a title.").max(120, "Keep the title under 120 characters."),
  language: z.enum(LANGUAGE_IDS, "Choose a language."),
  code: z
    .string()
    .max(20_000, "Snippets can be up to 20,000 characters.")
    .refine((v) => v.trim().length > 0, "The snippet needs some code."),
  tags: tagsField,
});
export type SnippetInput = z.infer<typeof snippetSchema>;

export const saveRunSchema = z.object({
  runId: z.uuid(),
  title: z.string().trim().min(1, "Give the snippet a title.").max(120, "Keep the title under 120 characters."),
  tags: tagsField,
});

export const snippetSearchSchema = z.object({
  q: z.string().trim().max(80).optional().transform((v) => v || undefined),
  tag: z.string().trim().toLowerCase().max(24).regex(/^[a-z0-9+#.-]*$/).optional().transform((v) => v || undefined),
  after: z.string().max(200).optional(),
});

export const shareSchema = z.object({
  snippetId: z.uuid(),
  expiresInDays: z.enum(["never", "1", "7", "30"]).default("7"),
});
