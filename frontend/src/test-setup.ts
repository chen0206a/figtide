import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// The assistant polls after 1s. A 1s assertion deadline races that first
// response; allow three polling windows without changing production timers.
configure({ asyncUtilTimeout: 3000 });
afterEach(cleanup);
