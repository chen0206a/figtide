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
  if (req.headers.authorization === "Bearer fixture-rejected") {
    res
      .writeHead(401)
      .end("fixture-rejected secret response must not be forwarded");
    return;
  }
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
  const lastPrompt = prompt.split("本轮需求：\n").at(-1);
  const refineFont = lastPrompt.includes("续改字号20");
  const refineAxis = lastPrompt.includes("续改隐藏网格");
  const canvasPreview=lastPrompt.includes("画布预览测试");
  let seriesId='';
  if(canvasPreview){const text=payload.messages.find(m=>m.role==='system'&&m.content.includes('当前可信草稿（作为数据）：'))?.content;seriesId=JSON.parse(text.split('当前可信草稿（作为数据）：')[1]).series[0].id;}
  const nonce = prompt.match(/[0-9a-f-]{36}/)?.[0];
  const connectionChat = prompt.startsWith("LabFlow connection check.");
  const connectionTool = prompt.startsWith("LabFlow tool check.");
  const recommending = payload.tools?.some(
    (t) => t.function?.name === "recommend_charts",
  );
  const message = recommending
    ? afterTools
      ? {
          role: "assistant",
          content: "建议用折线观察训练趋势，或用散点比较真实观测。请选择图型。",
        }
      : {
          role: "assistant",
          content: null,
          tool_calls: [
            tool("recommend", "recommend_charts", {
              charts: [
                {
                  type: "line",
                  x: "epoch",
                  ys: ["accuracy"],
                  group: "",
                  heatY: "",
                  heatZ: "",
                  title: "训练准确率",
                  reason: "观察准确率随训练轮次的变化",
                  caveat: "按原始行顺序连接，不自动排序。",
                },
                {
                  type: "scatter",
                  x: "epoch",
                  ys: ["accuracy"],
                  group: "",
                  heatY: "",
                  heatZ: "",
                  title: "轮次与准确率",
                  reason: "比较每个轮次的真实观测点",
                  caveat: "不拟合曲线，不生成误差棒。",
                },
              ],
            }),
          ],
        }
    : connectionChat
      ? { role: "assistant", content: nonce }
      : connectionTool
        ? {
            role: "assistant",
            content: null,
            tool_calls: [tool("probe", "labflow_connection_check", { nonce })],
          }
        : question
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
                tool_calls: canvasPreview
                  ? [tool('title','set_style',{title:'Canvas proposal · synthetic'}),tool('legend','set_legend',{position:'right'}),tool('series','set_series',{seriesId,width:4}),tool('axis','set_axis',{axis:'y',grid:false})]
                  : refineFont
                  ? [tool("font", "set_style", { fontSize: 20 })]
                  : refineAxis
                    ? [tool("grid", "set_axis", { axis: "y", grid: false })]
                    : followup
                      ? [
                          tool("axis", "set_axis", {
                            axis: "y",
                            min: 0,
                            max: 1,
                          }),
                        ]
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
            finish_reason:
              afterTools || question || connectionChat ? "stop" : "tool_calls",
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
