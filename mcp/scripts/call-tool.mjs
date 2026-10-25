import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [baseUrl, tool, encoded] = process.argv.slice(2);
if (!baseUrl || !tool || !encoded) throw new Error("usage: call-tool.mjs URL TOOL BASE64_JSON");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
const env = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined));
env.FIGTIDE_URL = baseUrl;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "dist", "figtide-mcp.cjs")],
  env,
  stderr: "pipe",
});
const client = new Client({ name: "figtide-e2e", version: "1" });
try {
  await client.connect(transport);
  const result = await client.callTool({ name: tool, arguments: payload });
  process.stdout.write(JSON.stringify(result));
  if (result.isError) process.exitCode = 2;
} finally {
  await client.close().catch(() => undefined);
}
