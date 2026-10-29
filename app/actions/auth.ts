"use server";

import { redirect } from "next/navigation";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fieldErrors, formValues, type FormState } from "@/lib/forms";
import { signIn, signUp, signOut } from "@/lib/services/auth";
import { clientIp } from "@/lib/request";
import { LimitError } from "@/lib/services/errors";
import { DatabaseUnavailableError } from "@/lib/db";

// Thin Server Actions: parse with Zod, call a service, shape the response.

const DB_DOWN = "We couldn't reach the database just now. Your details are still here; please try again in a moment.";

/** Only same-site relative paths, so ?next= can't send people elsewhere. */
function safeNext(value: FormDataEntryValue | null): string {
  return typeof value === "string" && /^\/(?!\/)[\w\-/?=&]*$/.test(value) ? value : "/workbench";
}

export async function signInAction(_prev: FormState, data: FormData): Promise<FormState> {
  const values = formValues(data, ["password"]);
  const parsed = signInSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  let result;
  try {
    result = await signIn(parsed.data.email, parsed.data.password, await clientIp());
  } catch (error) {
    if (error instanceof LimitError) return { message: error.message, values };
    if (error instanceof DatabaseUnavailableError) return { message: DB_DOWN, values };
    throw error;
  }
  if (!result.ok) return { message: result.message, values };
  redirect(safeNext(data.get("next")));
}

export async function signUpAction(_prev: FormState, data: FormData): Promise<FormState> {
  const values = formValues(data, ["password", "confirm"]);
  const parsed = signUpSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    const { message } = await signUp(parsed.data.email, parsed.data.password, await clientIp());
    return { ok: true, message, values: { email: parsed.data.email } };
  } catch (error) {
    if (error instanceof LimitError) return { message: error.message, values };
    if (error instanceof DatabaseUnavailableError) return { message: DB_DOWN, values };
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}
