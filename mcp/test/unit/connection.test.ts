import { describe, expect, it } from "vitest";
import { resolveEndpoint } from "../../src/connection.js";
import { requireSupportedNode } from "../../src/runtime.js";

describe("connection discovery", () => {
  it("prefers an explicit loopback FIGTIDE_URL", async () => {
    const endpoint = await resolveEndpoint({
      env: { FIGTIDE_URL: "http://localhost:8086" },
      readText: async () => {
        throw new Error("must not read port file");
      },
    });
    expect(endpoint.baseUrl.toString()).toBe("http://localhost:8086/");
    expect(endpoint.source).toBe("environment");
    expect(endpoint.allowDevelopment).toBe(true);
  });

  it("reads the desktop port file and falls back when absent", async () => {
    const desktop = await resolveEndpoint({
      env: { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" },
      readText: async (filename) => {
        expect(filename).toContain("FigTide");
        expect(filename).toContain("app.port");
        return '{"port":49123,"instance_id":"ignored"}';
      },
    });
    expect(desktop.baseUrl.toString()).toBe("http://127.0.0.1:49123/");
    expect(desktop.source).toBe("port-file");

    const fallback = await resolveEndpoint({ env: {}, readText: async () => Promise.reject() });
    expect(fallback.baseUrl.toString()).toBe("http://127.0.0.1:17861/");
    expect(fallback.source).toBe("default");
  });

  it("rejects remote, TLS and malformed explicit endpoints", async () => {
    await expect(resolveEndpoint({ env: { FIGTIDE_URL: "https://127.0.0.1:1" } })).rejects.toThrow(
      "只支持本机 http",
    );
    await expect(resolveEndpoint({ env: { FIGTIDE_URL: "http://example.com" } })).rejects.toThrow(
      "回环地址",
    );
    await expect(resolveEndpoint({ env: { FIGTIDE_URL: "not a url" } })).rejects.toThrow(
      "不是有效地址",
    );
  });
});

describe("runtime guard", () => {
  it("accepts Node 18+ and explains older versions", () => {
    expect(() => requireSupportedNode("18.0.0")).not.toThrow();
    expect(() => requireSupportedNode("22.12.0")).not.toThrow();
    expect(() => requireSupportedNode("16.20.2")).toThrow("需要 Node.js 18");
  });
});
