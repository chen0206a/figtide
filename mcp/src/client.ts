import { apiUrl, resolveEndpoint, type ConnectionOptions, type FigTideEndpoint } from "./connection.js";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class FigTideHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "FigTideHttpError";
  }
}

export type ClientOptions = ConnectionOptions & {
  fetch?: FetchLike;
  timeoutMs?: number;
};

export class FigTideClient {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: ClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  async endpoint(): Promise<FigTideEndpoint> {
    const endpoint = await resolveEndpoint(this.options);
    await this.verify(endpoint);
    return endpoint;
  }

  async request<T>(pathname: string, init: RequestInit = {}): Promise<{ data: T; endpoint: FigTideEndpoint }> {
    const endpoint = await this.endpoint();
    const response = await this.send(apiUrl(endpoint, pathname), init);
    return { data: (await this.body(response)) as T, endpoint };
  }

  editorUrl(endpoint: FigTideEndpoint, project: number, chart: number): string {
    return new URL(`projects/${project}/figures/${chart}`, endpoint.baseUrl).toString();
  }

  private async verify(endpoint: FigTideEndpoint): Promise<void> {
    let response: Response;
    try {
      response = await this.send(apiUrl(endpoint, "desktop/ping"), { method: "GET" }, false);
    } catch {
      throw new Error("无法连接 FigTide，请先启动 FigTide");
    }
    if (response.ok) {
      const body = await this.body(response);
      if (!body || typeof body !== "object" || typeof (body as { instance_id?: unknown }).instance_id !== "string")
        throw new Error("目标服务不是 FigTide 桌面版");
      return;
    }
    if (endpoint.allowDevelopment && response.status === 404) {
      const health = await this.send(apiUrl(endpoint, "health"), { method: "GET" }, false);
      const body = await this.body(health);
      if (health.ok && body && typeof body === "object" && (body as { status?: unknown }).status === "ok") return;
    }
    throw new Error("无法确认 FigTide 服务，请先启动 FigTide");
  }

  private async send(url: URL, init: RequestInit, mapErrors = true): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (init.body !== undefined && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
      const response = await this.fetchImpl(url, { ...init, headers, signal: controller.signal });
      if (mapErrors && !response.ok) await this.throwHttp(response);
      return response;
    } catch (error) {
      if (error instanceof FigTideHttpError) throw error;
      if (error instanceof Error && error.name === "AbortError")
        throw new Error("连接 FigTide 超时，请确认应用仍在运行");
      throw new Error("无法连接 FigTide，请先启动 FigTide");
    } finally {
      clearTimeout(timer);
    }
  }

  private async body(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      if (response.ok) throw new Error("FigTide 返回了无法解析的响应");
      return { message: text };
    }
  }

  private async throwHttp(response: Response): Promise<never> {
    const body = await this.body(response);
    const payload = body && typeof body === "object" ? (body as { code?: unknown; message?: unknown }) : {};
    const serverMessage = typeof payload.message === "string" ? payload.message : "请求失败";
    if (response.status === 409)
      throw new FigTideHttpError(409, "图表已被修改，请重新读取后再试", String(payload.code ?? "REQUEST_409"));
    if (response.status === 404)
      throw new FigTideHttpError(404, `找不到指定的 FigTide 资源：${serverMessage}`, String(payload.code ?? "REQUEST_404"));
    if (response.status === 400)
      throw new FigTideHttpError(400, `FigTide 拒绝了输入：${serverMessage}`, String(payload.code ?? "REQUEST_400"));
    throw new FigTideHttpError(response.status, `FigTide 请求失败：${serverMessage}`, String(payload.code ?? `HTTP_${response.status}`));
  }
}
