"use client";

import { useActionState } from "react";
import { setUserDisabledAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/forms";

export function UserToggle({ userId, email, disabled }: { userId: string; email: string; disabled: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(setUserDisabledAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
      <SubmitButton pending="Saving…" className="min-h-9 px-3 text-sm">
        {disabled ? "Enable" : "Disable"}
        <span className="sr-only"> {email}</span>
      </SubmitButton>
      {state.message ? (
        <span role="status" className="text-xs text-ink">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
