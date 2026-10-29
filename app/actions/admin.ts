"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { setUserDisabledByAdmin } from "@/lib/services/admin";
import { NotFoundError } from "@/lib/services/errors";
import type { FormState } from "@/lib/forms";

const schema = z.object({ userId: z.uuid(), disabled: z.enum(["true", "false"]).transform((v) => v === "true") });

export async function setUserDisabledAction(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireUser("/admin");
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { message: "Invalid request." };
  try {
    await setUserDisabledByAdmin(actor, parsed.data.userId, parsed.data.disabled);
  } catch (error) {
    if (error instanceof NotFoundError) return { message: "That user can't be changed." };
    throw error;
  }
  refresh();
  return { ok: true, message: parsed.data.disabled ? "User disabled, signed out everywhere, and notified by email." : "User re-enabled." };
}
