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
  // Hand-authored synthetic multi-role protocol, never sampled from a model.
  const system = payload.messages.find(m=>m.role==='system')?.content || '';
  // Select the synthetic role by its restricted tool contract, independently of prompt wording.
  const names=new Set((payload.tools||[]).map(t=>t.function?.name));
  const teamRole=!system.startsWith('你是 FigTide 科研绘图协作角色。')?'':
    names.has('get_current_config')?'coordinator':names.has('propose_processing')?'data':names.has('set_style')?'plotter':names.size===0?'reviewer':'';
  const teamMessage=()=>{
    if(teamRole==='coordinator')return {role:'assistant',content:JSON.stringify({action:'plan',message:'按明确口径先处理再绘图审稿',tasks:[{role:'data',goal:'按epoch分组计算accuracy均值和SEM，每行是独立重复'},{role:'plotter',goal:'将派生均值和SEM映射到曲线，保留其他样式'},{role:'reviewer',goal:'检查单位和误差图注'}]})};
    if(teamRole==='reviewer')return {role:'assistant',content:'请在论文图注注明 mean ± SEM、各组有效 n 与独立重复假设；坐标单位需按实验定义核对。'};
    if(afterTools)return {role:'assistant',content:'候选已通过校验。请预览并确认，确认时才创建派生数据。'};
    if(teamRole==='data')return {role:'assistant',content:null,tool_calls:[tool('processing','propose_processing',{schema_version:1,mode:'aggregate',groupBy:['epoch'],metrics:['accuracy'],filters:[],sort:[{field:'epoch',direction:'asc'}],missingGroup:'include',error:'sem',observationUnit:'independent repeated run',replicate:'',x:'epoch',group:'',display:'bars'})]};
    const config=JSON.parse(prompt).config;
    return {role:'assistant',content:null,tool_calls:[tool('mapping','map_series',{seriesId:config.series[0].id,y:'accuracy__mean',error:'accuracy__sem'}),tool('title','set_style',{title:'Team proposal · synthetic'}),tool('lint','lint_figure',{})]};
  };
  const question =
    prompt.includes("轴方向测试") && !prompt.includes("本轮需求：");
  const followup =
    prompt.includes("轴方向测试") && prompt.includes("本轮需求：");
  const lastPrompt = prompt.split("本轮需求：\n").at(-1);
  const refineFont = lastPrompt.includes("续改字号20");
  const refineAxis = lastPrompt.includes("续改隐藏网格");
  const canvasPreview=lastPrompt.includes("画布预览测试");
  const reviewPreview=lastPrompt.includes("审稿提案测试");
  let seriesId='';
  if(canvasPreview){const text=payload.messages.find(m=>m.role==='system'&&m.content.includes('当前可信草稿（作为数据）：'))?.content;seriesId=JSON.parse(text.split('当前可信草稿（作为数据）：')[1]).series[0].id;}
  const nonce = prompt.match(/[0-9a-f-]{36}/)?.[0];
  const connectionChat = prompt.startsWith("LabFlow connection check.");
  const connectionTool = prompt.startsWith("LabFlow tool check.");
  const recommending = payload.tools?.some(
    (t) => t.function?.name === "recommend_charts",
  );
  const message = teamRole ? teamMessage() : recommending
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
                  reviewPreview ? "仅修改图表标题；确定性审稿另外列出可选修复。请预览后确认。" : "已将标题、字号与图例调整为更清晰的布局。请查看右侧预览后确认。",
              }
            : {
                role: "assistant",
                content: null,
                  tool_calls: reviewPreview
                  ? [tool('review-title','set_style',{title:'Reviewed proposal · synthetic'})]
                  : canvasPreview
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
              teamRole ? (message.tool_calls?'tool_calls':'stop') : afterTools || question || connectionChat ? "stop" : "tool_calls",
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 50 },
      }),
    );
  };
  if(teamRole==='reviewer')setTimeout(respond,1200);
  else if (prompt.includes("慢速")) setTimeout(respond, 5000);
  else respond();
});
server.listen(Number(process.env.LABFLOW_FIXTURE_PORT || 18769), "127.0.0.1");
