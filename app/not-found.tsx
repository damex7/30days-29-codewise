import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">Nothing here</h1>
      <p className="mt-3 text-muted">
        This page doesn&apos;t exist, or it isn&apos;t yours to see. Shared links stop working when their owner revokes them or they expire.
      </p>
      <p className="mt-6">
        <Link href="/" className="font-semibold">
          Back to Codewise
        </Link>
      </p>
    </div>
  );
}
