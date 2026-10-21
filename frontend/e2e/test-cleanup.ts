import { request } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where the E2E run remembers which projects already existed when it started. */
export const MARKER = join(tmpdir(), "labflow-e2e-watermark.json");

/** The backend the suite talks to directly. The UI goes through the Vite proxy to the same one. */
export const API = process.env.LABFLOW_API ?? "http://127.0.0.1:8086";

export type Watermark = { watermark: number | null };

export function readWatermark(): Watermark {
  try {
    return JSON.parse(readFileSync(MARKER, "utf8")) as Watermark;
  } catch {
    return { watermark: null };
  }
}

export function writeWatermark(value: Watermark) {
  writeFileSync(MARKER, JSON.stringify(value));
}

export function apiContext() {
  return request.newContext({
    baseURL: API,
    // Deleting test data requires this header; the endpoint also refuses after<1.
    extraHTTPHeaders: { "X-LabFlow-Test-Run": "1" },
  });
}