"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require";
import { setFeedback } from "@/lib/services/feedback";
import { NotFoundError } from "@/lib/services/errors";
import { DatabaseUnavailableError } from "@/lib/db";
import type { FormState } from "@/lib/forms";

const schema = z.object({
  runId: z.uuid(),
  rating: z.enum(["up", "down"]),
  reason: z.string().trim().max(300, "Keep the reason under 300 characters.").optional(),
});

export async function feedbackAction(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Invalid feedback." };
  try {
    await setFeedback(actor, parsed.data.runId, parsed.data.rating, parsed.data.reason);
    return { ok: true, message: parsed.data.rating === "up" ? "Thanks! Glad it helped." : "Thanks, that helps us improve." };
  } catch (error) {
    if (error instanceof NotFoundError) return { message: "That answer no longer exists." };
    if (error instanceof DatabaseUnavailableError) return { message: "Couldn't save feedback right now. Please try again." };
    throw error;
  }
}
