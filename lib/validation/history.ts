import { z } from "zod";
import { MODES, RUN_STATUSES } from "@/lib/constants";

// /history?mode=review&status=ok&after=<cursor>. The URL is user input:
// unknown values fall back to "no filter" (.catch) instead of erroring or
// reaching SQL.
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const historySearchSchema = z.object({
  mode: z.preprocess(one, z.enum(MODES).optional()).catch(undefined),
  status: z.preprocess(one, z.enum(RUN_STATUSES).optional()).catch(undefined),
  after: z.preprocess(one, z.string().max(200).optional()).catch(undefined),
});
export type HistorySearch = z.infer<typeof historySearchSchema>;
