import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/current-user";
import { signOutAction } from "@/app/actions/auth";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-page focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-ink no-underline" aria-label="Codewise home">
          <span className="text-brand">
            <LogoMark size={30} />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">Codewise</span>
        </Link>
        <Suspense fallback={<div className="ml-auto h-10 w-48 skeleton" aria-hidden="true" />}>
          <UserNav />
        </Suspense>
      </div>
    </header>
  );
}

const navLink = "rounded-md px-2.5 py-2 text-sm font-medium text-ink no-underline hover:bg-card";

async function UserNav() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Database down: render the signed-out header rather than crash the page.
  }
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1 sm:gap-2">
      {user ? (
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          <Link href="/workbench" className={navLink}>
            Workbench
          </Link>
          <Link href="/history" className={navLink}>
            History
          </Link>
          <Link href="/snippets" className={navLink}>
            Snippets
          </Link>
          {user.role === "admin" ? (
            <Link href="/admin" className={navLink}>
              Admin
            </Link>
          ) : null}
        </nav>
      ) : null}
      <ThemeToggle />
      {user ? (
        <form action={signOutAction}>
          <button type="submit" className="min-h-10 rounded-md border border-line px-3 text-sm font-medium text-ink hover:bg-card">
            Sign out<span className="sr-only"> ({user.isDemo ? "demo visitor" : user.email})</span>
          </button>
        </form>
      ) : (
        <Link href="/sign-in" className="inline-flex min-h-10 items-center rounded-md bg-brand-btn px-4 text-sm font-semibold text-on-brand no-underline">
          Sign in
        </Link>
      )}
    </div>
  );
}
