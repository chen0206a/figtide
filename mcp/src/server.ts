import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FigTideClient, type ClientOptions } from "./client.js";
import { FigTideTools, registerTools } from "./tools.js";

export function createServer(options: ClientOptions = {}): McpServer {
  const server = new McpServer(
    { name: "figtide", version: "0.1.0" },
    { maxToolInputElements: 10000 },
  );
  registerTools(server, new FigTideTools(new FigTideClient(options)));
  return server;
}
