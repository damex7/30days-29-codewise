"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { ErrorSummary, Field, SubmitButton, inputClass } from "@/components/form";
import type { FormState } from "@/lib/forms";

const LABELS = { email: "Email", password: "Password", confirm: "Confirm password" };

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <form action={action} noValidate>
      <ErrorSummary errors={state.errors} message={state.message} labels={LABELS} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field id="email" label="Email" error={state.errors?.email}>
        {(a) => <input {...a} type="email" autoComplete="email" defaultValue={state.values?.email ?? ""} className={inputClass} />}
      </Field>
      <Field id="password" label="Password" error={state.errors?.password}>
        {(a) => <input {...a} type="password" autoComplete="current-password" className={inputClass} />}
      </Field>
      <SubmitButton pending="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
      <p className="mt-4 text-sm text-muted">
        New here? <Link href="/sign-up">Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});
  if (state.ok) {
    return (
      <div role="status" className="rounded-md border border-line bg-card p-4">
        <p className="font-semibold">{state.message}</p>
        <p className="mt-3">
          <Link href="/sign-in" className="font-semibold">
            Go to sign in
          </Link>
        </p>
      </div>
    );
  }
  return (
    <form action={action} noValidate>
      <ErrorSummary errors={state.errors} message={state.message} labels={LABELS} />
      <Field id="email" label="Email" error={state.errors?.email}>
        {(a) => <input {...a} type="email" autoComplete="email" defaultValue={state.values?.email ?? ""} className={inputClass} />}
      </Field>
      <Field id="password" label="Password" hint="At least 10 characters. A short sentence works well." error={state.errors?.password}>
        {(a) => <input {...a} type="password" autoComplete="new-password" className={inputClass} />}
      </Field>
      <Field id="confirm" label="Confirm password" error={state.errors?.confirm}>
        {(a) => <input {...a} type="password" autoComplete="new-password" className={inputClass} />}
      </Field>
      <SubmitButton pending="Creating account…" className="w-full">
        Create account
      </SubmitButton>
      <p className="mt-4 text-sm text-muted">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  );
}
