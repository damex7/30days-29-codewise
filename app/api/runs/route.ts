import { getCurrentUser } from "@/lib/auth/current-user";
import { runRequestSchema } from "@/lib/validation/runs";
import { startRun, executeRun, type RunView } from "@/lib/services/runs";
import { LimitError } from "@/lib/services/errors";
import { DatabaseUnavailableError } from "@/lib/db";
import { json, sameOrigin } from "@/lib/http";
import { fieldErrors } from "@/lib/forms";
import { log } from "@/lib/log";

// POST /api/runs: thin transport over the run service.
// Parse with Zod -> who is asking -> startRun (idempotency, limits, secrets
// gate, pending row) -> executeRun, streamed back as NDJSON (one JSON event
// per line):
//   {"type":"started","run":{...}}      the run row exists (recorded before the model call)
//   {"type":"text","text":"..."}        streamed pieces (stream modes)
//   {"type":"reset","notice":"..."}     provider switched: clear what was shown
//   {"type":"done","run":{...}}         final, validated result
//   {"type":"error","message":"..."}    something failed after streaming began
// Why stream? A 20-second answer that appears word by word feels fast and
// lets the user press Stop if it's going the wrong way; a blank wait doesn't.
// The connection dropping (Stop, closed tab) aborts the provider call and
// the partial answer is saved as 'interrupted'.

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-site requests are not allowed." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "The request body must be JSON." }, 400);
  }
  const parsed = runRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, 400);

  let actor;
  let started;
  try {
    actor = await getCurrentUser();
    if (!actor) return json({ error: "Your session has ended. Sign in again; your input is still here." }, 401);
    started = await startRun(actor, parsed.data);
  } catch (error) {
    if (error instanceof LimitError) {
      return json({ error: error.message, limit: error.kind, retryAfter: error.retryAfter }, 429, { "retry-after": String(error.retryAfter) });
    }
    if (error instanceof DatabaseUnavailableError) {
      return json({ error: "We couldn't reach the database. Nothing was sent to the AI; please try again in a moment." }, 503);
    }
    throw error;
  }

  if (started.type === "existing") return json({ type: "existing", run: started.run });
  if (started.type === "blocked") return json({ type: "blocked", run: started.run, findings: started.findings });

  const user = actor;
  const begun = started;
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the browser went away; keep working so the run is saved
        }
      };
      const publicRun = (run: RunView) => ({ ...run, inputText: undefined, inputExtra: undefined }); // the browser already has its input
      send({ type: "started", run: publicRun(begun.run) });
      try {
        const run = await executeRun(user, begun, {
          signal: abort.signal,
          onText: (text) => send({ type: "text", text }),
          onReset: (notice) => send({ type: "reset", notice }),
        });
        send({ type: "done", run: publicRun(run) });
      } catch (error) {
        log("run.stream_error", { runId: begun.run.id, error: error instanceof Error ? error.name : "unknown" });
        send({ type: "error", message: "Something went wrong while saving the answer. Your input is still here." });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort(); // Stop pressed or tab closed
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
