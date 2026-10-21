// Deterministic protocol fixture. No SDK, network dependencies, real model or paid requests.
const http = require("node:http");
const server = http.createServer(async (req, res) => {
  if (req.url !== "/chat/completions" || req.method !== "POST") {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200000) {
      res.writeHead(413).end();
      return;
    }
  }
  const payload = JSON.parse(raw);
  const prompt = payload.messages.find((m) => m.role === "user")?.content || "";
  const tool = (id, name, args) => ({
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  });
  const afterTools = payload.messages.some((m) => m.role === "tool");
  const question =
    prompt.includes("轴方向测试") && !prompt.includes("本轮需求：");
  const followup =
    prompt.includes("轴方向测试") && prompt.includes("本轮需求：");
  const message = question
    ? { role: "assistant", content: "请问要调整 X 轴还是 Y 轴？" }
    : afterTools
      ? {
          role: "assistant",
          content:
            "已将标题、字号与图例调整为更清晰的布局。请查看右侧预览后确认。",
        }
      : {
          role: "assistant",
          content: null,
          tool_calls: followup
            ? [tool("axis", "set_axis", { axis: "y", min: 0, max: 1 })]
            : [
                tool("title", "set_style", {
                  title: "Agent proposal · synthetic",
                  fontSize: 18,
                }),
                tool("legend", "set_legend", { position: "right" }),
              ],
        };
  const respond = () => {
    if (res.destroyed) return;
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        model: "labflow-fixture",
        choices: [
          {
            message,
            finish_reason: afterTools || question ? "stop" : "tool_calls",
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 50 },
      }),
    );
  };
  if (prompt.includes("慢速")) setTimeout(respond, 5000);
  else respond();
});
server.listen(Number(process.env.LABFLOW_FIXTURE_PORT || 18769), "127.0.0.1");
