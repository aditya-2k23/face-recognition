import { supabase } from "./client";

type StepEntry = { step: string; ok: boolean; info?: unknown; error?: string };
export interface SupabaseConnectivityReport {
  supabaseUrl: string;
  timestamp: string;
  elapsedMs: number;
  steps: StepEntry[];
}

// Narrow the possible probe tables (strings need to be literal types to pass to supabase.from)
type KnownProbeTable = "course_sessions" | "students";
const PROBE_TABLES: KnownProbeTable[] = ["course_sessions", "students"];

interface PostgrestErrorLike {
  code?: string;
  message: string;
}

/**
 * Runs a series of lightweight probes to determine if the frontend
 * is actually able to reach and query the configured Supabase project.
 */
export async function checkSupabaseConnectivity(): Promise<SupabaseConnectivityReport> {
  const started = performance.now();
  const supabaseUrl =
    (supabase as unknown as { rest?: { url?: string } }).rest?.url || "unknown";
  const steps: StepEntry[] = [];

  async function step(name: string, fn: () => Promise<unknown>) {
    try {
      const info = await fn();
      steps.push({ step: name, ok: true, info });
    } catch (e) {
      steps.push({
        step: name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 1. Auth session (even if anonymous)
  await step("getSession", async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { hasSession: !!data.session };
  });

  // 2. Probe accessible tables
  await step("ping_simple_select", async () => {
    for (const table of PROBE_TABLES) {
      const { data, error } = await supabase.from(table).select("id").limit(1);
      if (!error) {
        return { tableUsed: table, rowCount: data?.length ?? 0 };
      }
      const err = error as PostgrestErrorLike | null;
      if (err?.code === "PGRST116") {
        // permission denied – still proves connectivity but RLS blocked
        return { tableUsed: table, rlsBlocked: true };
      }
      // Try next table on other errors
    }
    throw new Error("No probe tables accessible (missing or blocked)");
  });

  // 3. Explicit course_sessions query result size (if exists / accessible)
  await step("course_sessions_presence", async () => {
    const { data, error } = await supabase
      .from("course_sessions")
      .select("id")
      .limit(5);
    if (error) {
      return { available: false, error: error.message };
    }
    return { available: true, count: data?.length ?? 0 };
  });

  return {
    supabaseUrl,
    timestamp: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - started),
    steps,
  };
}

// Expose a global helper in dev so you can run from browser console:
//   await window.__supabaseCheck()
if (typeof window !== "undefined") {
  // @ts-expect-error attaching debug helper
  window.__supabaseCheck = async () => {
    const r = await checkSupabaseConnectivity();
    console.group("[Supabase Connectivity Report]");
    console.table(r.steps);
    console.log(r);
    console.groupEnd();
    return r;
  };
}
