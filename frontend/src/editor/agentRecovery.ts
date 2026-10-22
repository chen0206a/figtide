import type { Config } from "./model";
export type SessionBudget = {
  session_id: string;
  chart_id: number | null;
  dataset_version_id: number;
  max_budget: number;
  used_budget: number;
  reserved_budget: number;
  remaining_budget: number;
  reported_tokens: number;
  uncertain_runs: number;
};
export const recoveryKey = (
  project: number,
  chart: number | null,
  dataset: number,
) => `labflow:assistant:v1:${project}:${chart ?? "draft"}:${dataset}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Persist identifiers only: no messages, configurations, rows, credentials or model settings.
export function recoveryRead(key: string): string | null {
  const value = sessionStorage.getItem(key);
  return value && uuid.test(value) ? value : null;
}
export function recoveryWrite(key: string, id: string | null) {
  if (id) sessionStorage.setItem(key, id);
  else sessionStorage.removeItem(key);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function sameConfig(a: Config, b: Config) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
