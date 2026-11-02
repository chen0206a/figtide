# 19-B：skill与AI结构提案验收 · 2026-11-01

任务19-B自动验收完成；按主人连续授权继续19-C，不推送B/C、不发布Release。19-A已通过PR #6全部CI并普通合并为c62f3dd。

改动：六个版本化skill、20个真实合成示例、共享运行账本的机制图模式、事实原句确认、语义操作、确定性排版/审稿、D8、默认可取消的修复、预览/确认/一次撤销/手动保存和按已有图追改。V11为双库配对迁移，旧迁移不变；无新依赖。来源提交与MIT见skills/*/SOURCES.md和THIRD_PARTY_NOTICES。

验证（实际执行）：

| 范围 | 结果 |
| --- | --- |
| 前端全量 / 构建 | 637通过，71文件 / tsc+Vite通过 |
| H2全量 | 458总数，456通过、0失败、2跳过 |
| MySQL全量 | 463总数，461通过、0失败、2跳过 |
| MCP | 类型检查、构建、单测16/16、真实stdio集成3/3 |
| 完整桌面E2E | 105总数，102通过、0失败、3跳过、0 flaky |
| JVM重启 | 完成审计保持不变，未完成运行正确恢复 |
| 模板实际几何 | 20模板×6风格×2语言=240组，均0 error；D3意见保留 |
| 机制图助手 | 选skill→同意发送→简报/原文事实→修改/删除事实→结构→忽略/恢复/取消修复→预览→应用→一次撤销/重做→手动保存→追改 |

两项后端跳过分别为现有ServerEvaluationTest的显式真实服务模式、新增DiagramEvaluationTest的显式真实模型模式；3项桌面跳过仍是migration.spec.ts需要独立已迁移夹具及LABFLOW_MIGRATION_E2E=1，未计为通过。系统托盘和SmartScreen人工项未执行。没有收费调用，没有使用真实工作区。

新增36条合成描述及12条人工协议夹具已验证，但真实模型没有采样。自己的评测成绩、原始输出和费用报告只存.runtime/diagram-eval；本目录仅包含产品功能/视觉测试证据，不刊登模型效果数字。

截图：skill-selection.png、facts.png、structure-proposal.png、refinement.png；另附新建、旗舰编辑器、审稿/修复和导出。所有编号框均透明并可读；通过截图和实际交互核对，不把快照稳定性当视觉验收。新增模板48份快照，旧快照未刷新。

命令：npm --prefix frontend test -- --run --maxWorkers=2；npm --prefix frontend run build；LABFLOW_TEST_DB=h2/mysql分别执行mvn -B -f backend/pom.xml test；npm --prefix mcp run check/test/build/test:integration；scripts/test-agent.ps1 -All -Desktop -FixturePort 18770，设置LABFLOW_CAPTURE=1和专用本目录前缀。

失败与修复：本地协议夹具初次finish_reason误标，修正后复跑；编号框初次缺少CSS导致黑填，修正并补可读性断言后复跑；首轮H2全量因兼容性探针未登记新V11失败，补七条新语句实测期望后全量重跑通过。原V1–V10与旧业务断言保持原样，原始日志均保留.runtime/19-B-*与19-9-*，没有隐藏失败。

共享变更：AgentAuditService/Repository增加可空数据/diagram会话绑定和revision核验；AgentRunService增加diagram模式，并将原协作模型调用实现提取为共享completeRun。原单助手/协作和任务18回放断言未修改，已由双库与完整桌面全量覆盖。图表API原协议、预算结算、取消恢复、确认保存保持兼容。
