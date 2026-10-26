import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireSupportedNode } from "./runtime.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  requireSupportedNode();
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FigTide MCP 启动失败：${message}\n`);
  process.exitCode = 1;
});
