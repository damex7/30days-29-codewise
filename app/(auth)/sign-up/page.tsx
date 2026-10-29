import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold text-ink">Create an account</h1>
      <p className="mt-2 mb-6 text-muted">Free. Your runs and snippets are visible only to you.</p>
      <SignUpForm />
    </div>
  );
}
