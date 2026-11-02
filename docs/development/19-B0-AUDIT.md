# 19-B0：机制图 AI 运行绑定审计

日期：2026-11-01。实施前只读审计；选择任务书优先方案 A。

## 结论

采用 V11 MySQL/H2 配对迁移，为 agent_runs 和 agent_sessions 新增可空 diagram_id，并将 dataset_version_id 改为可空。继续使用 AgentRunService 的队列、超时、取消、请求幂等和进程恢复，以及 AgentAuditService / AgentAuditRepository 的调用前预留和最终结算；机制图执行分支不调用字段画像或任何数据读取工具。图表分支继续要求原有 config/dataset/chart 上下文。

所有旧迁移保持原样；新运行 mode=diagram，记录 skill_id、skill_version、prompt_version。来源和文档只在当前进程运行缓存中持有，持久审计使用摘要和哈希，不落原提示词、标签或图片。服务重启后保留账本并终止未完成运行，历史提案只能追溯，不能重放应用。

## 实施边界

- start：按 mode 区分配置/文档校验和上下文绑定，不为机制图构造伪数据版本。
- begin / session：可空数据绑定与 diagram_id 共同参与会话一致性检查，防止跨图重用额度。
- execute：独立语义状态机，简报/带出处事实先展示供确认；结构阶段仅语义操作，前端使用现有确定性排版，再提交同源几何审稿。
- view / snapshot / history / resume：机制图返回独立阶段和版本；不会经图表 lint 或字段摘要路径。
- decide：机制图 revision、候选指纹、已选修复均重新核验；应用只进入一次撤销草稿，不保存新版本。
- 图表共享方法仅做可空绑定和模式分流兼容扩展，原 suite v1.5、任务18回放和业务断言不改。

## 假定数据版本或图表存在的位置

V5__agent_audit.sql 的 agent_runs.dataset_version_id、V7__agent_session_budgets.sql 的 agent_sessions.dataset_version_id 均 NOT NULL。其余代码位置如下（实施前基线）。

### backend/src/main/java/dev/labflow/agent/AgentRunService.java

- L148: `"chart_id",`
- L175: `&& (request.has("parent_run_id") || request.path("chart_id").isIntegralNumber()))`
- L200: `for (String key : List.of("protocol_version", "chart_id", "base_revision", "config"))`
- L202: `var lint = figures.lint(project, snapshot);`
- L263: `for (String key : List.of("chart_id", "base_revision"))`
- L267: `.at("/config/datasetVersionId")`
- L268: `.equals(parent.snapshot.at("/config/datasetVersionId")))`
- L411: `var lint = figures.lint(project, pending.snapshot);`
- L477: `figures.lint(project, lintEnvelope(r, r.proposal.path("config"))).get("ok")))`
- L516: `dev.labflow.review.RenderFacts.fields(request,Set.of("agent_run_id","protocol_version","chart_id","base_revision","config","operations"),Set.of("agent_run_id","protocol_version","config","operations"));`
- L521: `if(!request.path("protocol_version").isIntegralNumber()||request.path("protocol_version").asInt()!=1||!request.path("config").equals(run.proposal.path("config"))||!request.path("chart_id").equals(run.snapshot.path("chart_id"))||!request.path("base_revision").equals(run.snapshot.path("base_revision")))throw new ApiException(409,"提案预览上下文已变化");`
- L522: `if(run.previewData==null){var body=(ObjectNode)request.deepCopy();body.remove("agent_run_id");return figures.preview(project,body);}`
- L690: `r.project, r.snapshot.path("config").path("datasetVersionId").asLong()));`
- L706: `return json.valueToTree(figures.preview(r.project, req));`
- L757: `+ profile(r));`
- L877: `var checked = figures.lint(r.project, lintEnvelope(r, result.path("config")));`
- L939: `result = profile(r);`
- L941: `nextRecommendations = ChartRecommendations.validate(args, profile(r));`
- L976: `var check = json.valueToTree(figures.lint(r.project, lintEnvelope(r, candidate)));`
- L1085: `var engine=new dev.labflow.agent.team.TeamOrchestrator(json,teamDrafts,port,r.project,r.id,r.snapshot,profile(r),tools,r.inherited,r.inheritedProcessing,r.previewData);`

### backend/src/main/java/dev/labflow/agent/AgentAuditService.java

- L49: `snapshot.path("chart_id").isIntegralNumber() ? snapshot.path("chart_id").asLong() : null;`
- L50: `long dataset = snapshot.at("/config/datasetVersionId").asLong();`
- L57: `budget.get("chart_id") == null ? null : ((Number) budget.get("chart_id")).longValue())`
- L58: `|| dataset != ((Number) budget.get("dataset_version_id")).longValue())`
- L74: `snapshot.path("chart_id").isIntegralNumber() ? snapshot.path("chart_id").asLong() : null,`
- L76: `snapshot.path("config").path("datasetVersionId").asLong(),`
- L159: `"chart_id",`
- L160: `"dataset_version_id",`
- L219: `"chart_id",`
- L221: `"dataset_version_id",`
- L341: `&& row.get("chart_id") instanceof Number chart`

### backend/src/main/java/dev/labflow/repository/AgentAuditRepository.java

- L20: `+ " (run_id,project_id,instance_id,chart_id,base_revision,dataset_version_id,source_sha256,snapshot_hash,model,endpoint,prompt_version,catalog_hash,status,outcome,max_steps,max_tokens,timeout_seconds,trace_json,created_at,parent_run_id,session_id,request_hash,reservation,turn_index)"`
- L85: `where += " AND chart_id=?";`
- L96: `+ " run_id,chart_id,parent_run_id,status,outcome,model,tokens,latency_ms,created_at,finished_at,decision_at"`
- L141: `"INSERT INTO agent_sessions(session_id,project_id,chart_id,dataset_version_id,max_budget)"`

### backend/src/main/java/dev/labflow/review/ProposalReviewService.java

- L37: `Long chart=row.get("chart_id") instanceof Number n?n.longValue():null;`
- L41: `var source=(ObjectNode)proposal.path("config").deepCopy();if(memory!=null)source.put("datasetVersionId",((Number)memory.get("id")).longValue());`
- L75: `if(row.get("chart_id") instanceof Number chart)envelope.put("chart_id",chart.longValue());`
- L76: `try{if(!Boolean.TRUE.equals(figures.lint(project,envelope).get("ok")))throw stale();}catch(ApiException e){throw stale();}`

### backend/src/main/java/dev/labflow/agent/team/TeamDecisionService.java

- L14: `long dataset=committer.create(project,id,proposal,body);var materialized=proposal.deepCopy();((ObjectNode)materialized.path("config")).put("datasetVersionId",dataset);`

## 验证计划

双库迁移/会话预留/并发幂等/结算/取消/超时/重启；图表旧测试原样回归。机制图补充来源追溯、未确认事实阻止结构、坐标拒绝、工具权限、修复筛选、revision 冲突、一次撤销及追改。12 条人工协议回放与36条合成任务分开标注；真实模型模式只提供命令，不执行、不虚构成绩。自己的评测报告和原始结果只留本地。
