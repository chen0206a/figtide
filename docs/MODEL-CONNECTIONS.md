# 网页模型连接（2026-10-22）

顶部工具栏「模型连接」，或绘图助手右上角设置图标，可打开连接窗口。填写兼容接口的基地址、准确模型ID和API Key；本机HTTP服务可不填Key。不依赖GET /models，也不伪造模型列表。普通绘图仍无需模型。

## 操作

1. 填写地址、模型名称和密钥。
2. 如需验证，勾选允许发送两条固定测试请求，再点「测试连接」。服务商可能计费。
3. 测试检查基础对话、usage、工具调用标识与参数，不发送项目、实验数据、字段或图表，不执行返回的函数。
4. 测试不会替换正在使用的连接；点「应用连接」才更新。可跳过测试直接应用，此时显示「已配置 · 尚未测试」。
5. 应用后输入框清空，重开只显示「已配置，留空保留」，无密钥读取接口。

「已验证」表示通过一次基础协议检查，并非持续在线监测、全部绘图工具兼容性或模型能力保证。错误区分鉴权401/403、地址404、限流/额度429、响应协议、工具不支持和超时，不透传上游正文。

## 密钥和运行边界

- 网页输入的密钥仅提交到本机Java内存，不写浏览器存储、查询缓存、数据库、文件、日志、URL或命令行。显隐按钮只控制本次新输入的值。
- 网页设置不写系统环境，后端重启后失效，重新使用启动环境配置（若有）。`connect-agent.ps1` 与环境变量方式仍可作为启动入口。
- 更换基地址需重新提供密钥，不能自动转发旧Key。只接受HTTPS或本机HTTP，拒绝凭据/查询参数、缺主机、非法端口和HTTP重定向。
- 每个绘图run创建时冻结连接，更改或断开只影响新run。旧任务和有限运行缓存释放前可能仍持有旧连接，不承诺即时擦除Java字符串或启动环境。
- 回复与决策备注同时按实际run连接和当前连接脱敏，覆盖网页输入的非 `sk-` 密钥；原有审计规则仍适用。
- 仍为本机单用户模式。写操作要求loopback、自定义头及来源校验，无多用户身份认证，不能直接公开部署。

## API

前缀 `/api`；写操作需 `Content-Type:application/json` 和 `X-LabFlow-Connection:1`。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/agent/connection` | 当前元数据，无密钥值 |
| PUT | `/agent/connection` | 应用连接，不请求模型 |
| POST | `/agent/connection/test` | 测试候选，不改变当前连接 |
| POST | `/agent/connection/disconnect` | 断开，阻止新run |

GET/应用/断开成功返回：`{revision,available,base_url,model,has_key,source,verified_at}`。source为environment/session/disabled；verified_at为ISO UTC，空串表示未验证。

配置和测试共用 `{revision,base_url,model,api_key?,keep_key?}`。`keep_key:true` 要求地址完全相同且不能同时提供新Key。测试另需 `allow_test:true`，应用可携带成功测试的 `test_id`。断开只接收 `{revision}`。

测试成功：`{ok:true,code:"verified",message,test_id,latency_ms,tokens,usage_complete:true}`；上游/协议失败返回HTTP200的 `{ok:false,code,message,latency_ms,tokens,usage_complete:false}`，tokens仅表示已经收到的上报值，不意味着实际消费为零。输入/来源/并发版本分别400/403/409，已有测试在途时429。

测试凭证在内存保存10分钟，绑定精确地址、模型、密钥指纹和revision。修改候选或并发修改连接不能沿用旧结果。每次最多两条请求、单条10秒、总计20秒，同时最多一个测试，不自动重试。

## 验证与范围

Java真实本机HTTP覆盖两条探测、各种错误、无工具模型、非法ID/JSON、并发、旧结果、变更地址和连接冻结。React覆盖许可、测试与应用分离、清掉旧凭证、失败保留连接、清空输入与断开。Chrome使用真实Java/HTTP fixture验证成功与鉴权失败后继续绘图，并检查1280×800和390×844的按钮可达性。

实际结果见 [TEST-RESULTS.md](TEST-RESULTS.md)，截图：[连接窗口](screenshots/model-connection.png)、[鉴权失败](screenshots/model-connection-error.png)。未实现多连接档案、模型市场、持久化密钥库和模型特有参数。
