import { startDemo } from "@/lib/services/demo";
import { LimitError } from "@/lib/services/errors";
import { clientIp } from "@/lib/request";
import { sameOrigin } from "@/lib/http";

// POST only (a GET link could be triggered by crawlers and link previews).
// Creates a demo user + session, then 303 to the workbench.

export async function POST(request: Request) {
  const base = new URL(request.url);
  if (!sameOrigin(request)) return new Response("Cross-site requests are not allowed.", { status: 403 });
  try {
    await startDemo(await clientIp());
  } catch (error) {
    if (error instanceof LimitError) return Response.redirect(new URL("/sign-up?demo=limit", base), 303);
    return Response.redirect(new URL("/?demo=unavailable", base), 303);
  }
  return Response.redirect(new URL("/workbench", base), 303);
}
