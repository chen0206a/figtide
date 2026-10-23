import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("shows whole bytes below 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(86)).toBe("86 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("shows one decimal in KB below 1 MB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(Math.round(12.4 * 1024))).toBe("12.4 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("shows one decimal in MB at or above 1 MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(Math.round(1.2 * 1024 * 1024))).toBe("1.2 MB");
  });
});