const TEXT: Record<string, string> = {
  limit: "This network has started too many demo sessions today. Create a free account to keep going: it takes a minute.",
  unavailable: "The demo couldn't start just now (the database may be unreachable). Please try again shortly.",
};

/** Shown after /api/demo redirects back with ?demo=limit or ?demo=unavailable. */
export async function DemoNotice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const value = (await searchParams).demo;
  const text = typeof value === "string" ? TEXT[value] : undefined;
  if (!text) return null;
  return (
    <p role="status" className="mb-6 rounded-md border-2 border-strong p-3 text-sm text-ink">
      {text}
    </p>
  );
}
