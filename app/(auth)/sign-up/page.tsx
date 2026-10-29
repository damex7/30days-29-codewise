import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { DemoNotice } from "@/components/demo-notice";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold text-ink">Create an account</h1>
      <p className="mt-2 mb-6 text-muted">Free. Your runs and snippets are visible only to you.</p>
      <Suspense fallback={null}>
        <DemoNotice searchParams={searchParams} />
      </Suspense>
      <SignUpForm />
    </div>
  );
}
