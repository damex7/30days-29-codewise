/**
 * "Try it without signing up": a plain POST form (no GET link), so crawlers
 * and link previews can't create demo accounts. /api/demo creates an
 * isolated demo user, starts a session and redirects to the workbench.
 */
export function DemoButton() {
  return (
    <form action="/api/demo" method="post">
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md border-2 border-brand px-5 font-semibold text-brand hover:bg-brand-soft"
      >
        Try it without signing up
      </button>
    </form>
  );
}
