import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold text-ink">Sign in</h1>
      <p className="mt-2 mb-6 text-muted">Welcome back to your workbench.</p>
      <Suspense fallback={<div className="h-64 skeleton" aria-hidden="true" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const next = (await searchParams).next;
  return <SignInForm next={typeof next === "string" ? next : undefined} />;
}
