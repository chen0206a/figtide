import { describe, expect, it, vi, afterEach } from "vitest";
import { ApiError, api } from "./api";
import { readableError, saveFailureMessage } from "./saveFeedback";

afterEach(() => vi.unstubAllGlobals());

describe("api 的网络层失败", () => {
  it("把 Failed to fetch 转成本地服务没有响应", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await api("/projects").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("offline");
    expect((error as ApiError).message).toBe("本地服务没有响应");
    expect((error as ApiError).message).not.toContain("Failed to fetch");
  });

  it("保留后端返回的中文业务错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "表头必须唯一" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const error = await api("/x").catch((e) => e);
    expect((error as ApiError).message).toBe("表头必须唯一");
    expect((error as ApiError).kind).toBe("http");
  });

  it("不把 5xx 的英文正文直接抛给界面", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 })),
    );
    const error = await api("/x").catch((e) => e);
    expect((error as ApiError).message).toBe("本地服务处理请求时出错，请稍后重试");
  });
});

describe("保存失败文案", () => {
  it("草稿已写入时告诉用户改动没丢", () => {
    expect(saveFailureMessage(true)).toContain("仍保存在本机草稿中");
  });

  it("草稿没写成时不承诺改动还在", () => {
    expect(saveFailureMessage(false)).toBe("保存失败：本地服务没有响应。");
  });
});

describe("readableError", () => {
  it("英文网络错误也会被改写", () => {
    expect(readableError(new Error("Failed to fetch"))).toBe("本地服务没有响应");
  });

  it("保留中文业务错误", () => {
    expect(readableError(new ApiError("图表已被更新", 409))).toBe("图表已被更新");
  });
});