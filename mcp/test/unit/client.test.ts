import { describe, expect, it } from "vitest";
import { FigTideClient, FigTideHttpError, type FetchLike } from "../../src/client.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function client(fetch: FetchLike) {
  return new FigTideClient({
    env: { FIGTIDE_URL: "http://127.0.0.1:8086" },
    fetch,
    timeoutMs: 50,
  });
}

describe("FigTide HTTP client", () => {
  it("accepts desktop ping and explicit development health fallback", async () => {
    const desktop = client(async (input) =>
      new URL(input.toString()).pathname.endsWith("desktop/ping")
        ? json({ instance_id: "x" })
        : json([{ id: 1 }]),
    );
    await expect(desktop.request("projects")).resolves.toMatchObject({ data: [{ id: 1 }] });

    const development = client(async (input) => {
      const path = new URL(input.toString()).pathname;
      if (path.endsWith("desktop/ping")) return json({ code: "REQUEST_404" }, 404);
      if (path.endsWith("health")) return json({ status: "ok", mode: "local-only" });
      return json([]);
    });
    await expect(development.request("projects")).resolves.toMatchObject({ data: [] });
  });

  it("maps connection failure without exposing the cause", async () => {
    const failing = client(async () => {
      throw new Error("ECONNREFUSED secret-stack");
    });
    await expect(failing.request("projects")).rejects.toThrow("请先启动 FigTide");
    await expect(failing.request("projects")).rejects.not.toThrow("secret-stack");
  });

  it.each([
    [400, "BAD", "输入有误", "FigTide 拒绝了输入：输入有误"],
    [404, "MISSING", "不存在", "找不到指定的 FigTide 资源：不存在"],
    [409, "STALE", "服务端原文", "图表已被修改，请重新读取后再试"],
  ])("maps HTTP %s", async (status, code, message, expected) => {
    const mapped = client(async (input) => {
      const path = new URL(input.toString()).pathname;
      if (path.endsWith("desktop/ping")) return json({ instance_id: "x" });
      return json({ code, message }, status);
    });
    const error = await mapped.request("projects/1/charts/2").catch((value) => value);
    expect(error).toBeInstanceOf(FigTideHttpError);
    expect(error).toMatchObject({ status, code });
    expect(error.message).toBe(expected);
  });
});
