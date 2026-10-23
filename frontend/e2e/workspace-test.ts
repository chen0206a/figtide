import { test as base } from "@playwright/test";
export * from "@playwright/test";
/** Existing workbench scenarios opt out of the first-visit tour in one place. */
export const test = base.extend({
  context: async ({context},use)=>{
    await context.addInitScript(()=>{try {localStorage.setItem("labflow-intro-seen","1")} catch { /* storage may be deliberately blocked */ }});
    await use(context);
  },
});
