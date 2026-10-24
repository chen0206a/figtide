import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { TestInfo } from "@playwright/test";

const captures = new WeakMap<TestInfo, Map<string, string>>();

/** Every test owns its artifacts; docs are optional capture copies, never test inputs. */
export function artifactPath(testInfo: TestInfo, destination: string): string {
  const relative = destination.replace(/^\.\.\/docs\//, "").replace(/^\.\.\/\.runtime\//, "exports/");
  if (relative === destination || relative.split(/[\\/]/).includes(".."))
    throw new Error(`Unsupported artifact destination: ${destination}`);
  const output = testInfo.outputPath(relative);
  mkdirSync(path.dirname(output), { recursive: true });
  const files = captures.get(testInfo) ?? new Map<string, string>();
  // Legacy temporary PDFs/archives are also retained under the test output;
  // only explicit docs destinations are mirrored for publication captures.
  if (destination.startsWith("../docs/")) files.set(output, path.resolve(destination));
  captures.set(testInfo, files);
  return output;
}

export function captureArtifacts(testInfo: TestInfo) {
  if (process.env.LABFLOW_CAPTURE !== "1") return;
  for (const [output, destination] of captures.get(testInfo) ?? []) {
    if (!existsSync(output)) continue;
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(output, destination);
  }
}
