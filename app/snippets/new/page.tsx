import type { Metadata } from "next";
import Link from "next/link";
import { SnippetForm } from "@/components/snippet-forms";

export const metadata: Metadata = { title: "New snippet" };

// proxy.ts sends signed-out visitors to sign-in; the action itself checks
// the user again (requireUser) before writing anything.
export default function NewSnippetPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/snippets" className="text-sm font-semibold">
        ← Snippets
      </Link>
      <h1 className="mt-3 mb-6 text-3xl font-bold text-ink">New snippet</h1>
      <SnippetForm />
    </div>
  );
}
