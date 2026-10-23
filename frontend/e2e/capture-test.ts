import { test as base } from "@playwright/test";
import { captureArtifacts } from "./artifacts";
export * from "@playwright/test";

export const test = base.extend<{ _captureArtifacts: void }>({
  _captureArtifacts: [async ({}, use, testInfo) => {
    await use();
    captureArtifacts(testInfo);
  }, { auto: true }],
});
