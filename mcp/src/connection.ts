import { readFile } from "node:fs/promises";
import path from "node:path";

export type EndpointSource = "environment" | "port-file" | "default";

export type FigTideEndpoint = {
  baseUrl: URL;
  source: EndpointSource;
  allowDevelopment: boolean;
};

export type ConnectionOptions = {
  env?: NodeJS.ProcessEnv;
  readText?: (filename: string) => Promise<string>;
};

const DEFAULT_URL = "http://127.0.0.1:17861/";

function localBase(env: NodeJS.ProcessEnv): string {
  const local = env.LOCALAPPDATA?.trim();
  if (local) return local;
  const profile = env.USERPROFILE?.trim();
  if (profile) return path.join(profile, "AppData", "Local");
  return path.join(process.cwd(), "AppData", "Local");
}

function validateLoopback(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("FIGTIDE_URL 不是有效地址");
  }
  if (url.protocol !== "http:") throw new Error("FIGTIDE_URL 只支持本机 http 地址");
  if (!new Set(["127.0.0.1", "localhost", "[::1]"]).has(url.hostname))
    throw new Error("FIGTIDE_URL 必须指向本机回环地址");
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  url.search = "";
  url.hash = "";
  return url;
}

export async function resolveEndpoint(options: ConnectionOptions = {}): Promise<FigTideEndpoint> {
  const env = options.env ?? process.env;
  const configured = env.FIGTIDE_URL?.trim();
  if (configured)
    return { baseUrl: validateLoopback(configured), source: "environment", allowDevelopment: true };

  const filename = path.join(localBase(env), "FigTide", "data", "app.port");
  const load = options.readText ?? ((name: string) => readFile(name, "utf8"));
  try {
    const record = JSON.parse(await load(filename)) as { port?: unknown };
    if (!Number.isInteger(record.port) || Number(record.port) < 1 || Number(record.port) > 65535)
      throw new Error("invalid port");
    return {
      baseUrl: new URL(`http://127.0.0.1:${record.port}/`),
      source: "port-file",
      allowDevelopment: false,
    };
  } catch {
    return { baseUrl: new URL(DEFAULT_URL), source: "default", allowDevelopment: false };
  }
}

export function apiUrl(endpoint: FigTideEndpoint, pathname: string): URL {
  return new URL(`api/${pathname.replace(/^\/+/, "")}`, endpoint.baseUrl);
}
