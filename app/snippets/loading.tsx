export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="h-9 w-48 skeleton" aria-hidden="true" />
      <div className="mt-6 h-72 skeleton" aria-hidden="true" />
    </div>
  );
}
