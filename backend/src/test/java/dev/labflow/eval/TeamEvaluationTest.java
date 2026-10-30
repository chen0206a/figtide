package dev.labflow.eval;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.*;
import dev.labflow.agent.*;
import dev.labflow.agent.team.*;
import dev.labflow.review.*;
import dev.labflow.service.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.util.ReflectionTestUtils;

@SpringBootTest(classes=LabFlowApplication.class,properties={"LABFLOW_AGENT_BASE_URL=http://127.0.0.1:1","LABFLOW_AGENT_MODEL=","labflow.test-support=false"})
@ContextConfiguration(initializers=TestDatasourceInitializer.class)
class TeamEvaluationTest {
  @Autowired ObjectMapper json;@Autowired WorkspaceService workspace;@Autowired FigureToolService figures;@Autowired AgentAuditService audit;@Autowired JdbcTemplate db;
  @Autowired TeamDraftService drafts;@Autowired TeamDecisionService decisions;@Autowired ProposalReviewService reviews;
  // Default is the frozen v1 suite; -Dlabflow.team.suite=<file> selects another suite file for held-out trials.
  boolean defaultSuite(){return System.getProperty("labflow.team.suite","").isBlank();}
  JsonNode suite() throws Exception{String custom=System.getProperty("labflow.team.suite","");return custom.isBlank()?json.readTree(getClass().getResourceAsStream("/agent-eval/team-suite-v1.json")):json.readTree(Files.readAllBytes(Path.of(custom)));}
  void guard() throws Exception {try(var connection=Objects.requireNonNull(db.getDataSource()).getConnection()){String url=connection.getMetaData().getURL();assertTrue(url.matches("jdbc:mysql://[^/]+/labflow_test(\\?.*)?")||url.equals("jdbc:h2:mem:labflow_test")||url.startsWith("jdbc:h2:mem:labflow_test;"),"Only isolated test databases are permitted");}}
  record Fixture(long project,long dataset,long chart,ObjectNode config){}
  Fixture fixture(JsonNode suite,JsonNode item) throws Exception {
    long project=((Number)workspace.createProject("Team eval "+item.path("id").asText(),"Synthetic isolated evaluation fixture").get("id")).longValue();
    try{
      long source=((Number)workspace.upload(project,null,"synthetic-team-evaluation.csv",suite.path("csv").asText().getBytes(StandardCharsets.UTF_8)).get("id")).longValue();
      var config=(ObjectNode)json.readTree(getClass().getResourceAsStream("/config-v1.json"));config.put("datasetVersionId",source);((ObjectNode)config.path("series").get(0)).put("error","");
      for(var entry:item.path("setup").properties()){String path=entry.getKey();((ObjectNode)config.at(path.substring(0,path.lastIndexOf('/')))).set(path.substring(path.lastIndexOf('/')+1),entry.getValue());}
      if(!item.path("setup_operations").isEmpty())config=FigureOperations.apply(config,item.path("setup_operations"));
      long chart=((Number)workspace.saveChart(project,null,"Synthetic evaluation source",null,config).get("id")).longValue();return new Fixture(project,source,chart,config);
    }catch(Exception error){cleanup(project);throw error;}
  }
  void cleanup(long project){db.update("DELETE FROM chart_versions WHERE chart_id IN (SELECT id FROM charts WHERE project_id=?)",project);db.update("DELETE FROM charts WHERE project_id=?",project);db.update("DELETE FROM dataset_versions WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id=?)",project);db.update("DELETE FROM datasets WHERE project_id=?",project);db.update("DELETE FROM projects WHERE id=?",project);}
  ObjectNode envelope(Fixture f){var body=json.createObjectNode().put("protocol_version",1).put("chart_id",f.chart).put("base_revision",1);body.set("config",f.config);return body;}
  ObjectNode expected(Fixture f,JsonNode item){var expected=FigureOperations.apply(f.config,item.path("expected_operations"));if(item.has("expected_processing"))expected.put("datasetVersionId","$derived");return expected;}
  @Test void all120GoldTasksHaveValidExplicitOperationsAndFortyCasesPerCategory() throws Exception {
    guard();var suite=suite();assertTrue(suite.path("synthetic").asBoolean());boolean standard=defaultSuite();if(standard)assertEquals(120,suite.path("cases").size());Map<String,Integer> categories=new TreeMap<>();Set<String> ids=new HashSet<>();int recordings=0;
    for(var item:suite.path("cases")){assertTrue(ids.add(item.path("id").asText()));categories.merge(item.path("category").asText(),1,Integer::sum);assertTrue(item.path("synthetic").asBoolean());assertFalse(item.path("allowed_paths").isEmpty());assertFalse(item.path("expected_operations").isEmpty());if(item.has("replay"))recordings++;
      var f=fixture(suite,item);try{var body=envelope(f);JsonNode actual;
        if(item.has("expected_processing")){var memory=drafts.memory(f.project,f.dataset,item.path("expected_processing"));actual=drafts.preview(f.project,body,(ArrayNode)item.path("expected_operations"),memory).path("config");}
        else{body.set("operations",item.path("expected_operations"));actual=json.valueToTree(figures.preview(f.project,body)).path("config");}
        assertEquals(AuditSanitizer.hash(expected(f,item)),AuditSanitizer.hash(actual),item.path("id").asText());assertEquals(1,workspace.datasets(f.project).size());assertEquals(1,workspace.versions(f.project,f.chart).size());
      }finally{cleanup(f.project);}
    }
    if(standard){assertEquals(Map.of("single_step",40,"multi_step",40,"processing",40),categories);assertEquals(12,recordings);}
  }
  final class Recording implements ModelProvider {
    final JsonNode item;final String mode;final Map<String,Integer> indices=new HashMap<>();
    Recording(JsonNode item,String mode){this.item=item;this.mode=mode;}
    public Info info(){return new Info(true,"authored-team-protocol-v1","offline://fixture","");}
    public Reply complete(ArrayNode messages,ArrayNode tools,int max,Duration timeout){
      String role="single";if(mode.equals("team")){String system=messages.get(0).path("content").asText();role=List.of("coordinator","data","plotter","reviewer").stream().filter(value->TeamPrompts.text(value).equals(system)).findFirst().orElseThrow();}
      JsonNode recording=mode.equals("single")?item.at("/replay/single"):item.at("/replay/team/"+role);int i=indices.merge(role,1,Integer::sum)-1;if(i>=recording.size())throw new IllegalStateException("Authored protocol exhausted");
      var turn=recording.get(i);Set<String> allowed=new HashSet<>();for(var tool:tools)allowed.add(tool.at("/function/name").asText());for(var call:turn.at("/message/tool_calls"))if(!allowed.contains(call.at("/function/name").asText()))throw new IllegalStateException("Fixture called an unavailable tool");
      return new Reply(((ObjectNode)turn.path("message")).deepCopy(),turn.path("prompt_tokens").asInt(),turn.path("completion_tokens").asInt(),info().model(),turn.path("finish_reason").asText());
    }
    boolean complete(){if(mode.equals("single"))return indices.getOrDefault("single",0)==item.at("/replay/single").size();for(var entry:item.at("/replay/team").properties())if(indices.getOrDefault(entry.getKey(),0)!=entry.getValue().size())return false;return true;}
  }
  final class ObservedProvider implements ModelProvider {
    final ModelProvider delegate;
    final ArrayNode exchanges=json.createArrayNode();
    ObservedProvider(ModelProvider delegate){this.delegate=delegate;}
    public Info info(){return delegate.info();}
    public String redactSecret(String value){return delegate.redactSecret(value);}
    public Reply complete(ArrayNode messages,ArrayNode tools,int max,Duration timeout) throws Exception {
      String system=messages.get(0).path("content").asText();
      String role=List.of("coordinator","data","plotter","reviewer").stream().filter(r->TeamPrompts.text(r).equals(system)).findFirst().orElse("single");
      long started=System.currentTimeMillis();
      var exchange=exchanges.addObject().put("role",role).put("started_at",Instant.now().toString());
      try{
        var reply=delegate.complete(messages,tools,max,timeout);
        String safe=delegate.redactSecret(reply.message().toString());
        exchange.set("message",json.readTree(safe==null?reply.message().toString():safe));
        exchange.put("model",reply.model()).put("finish_reason",reply.finishReason()).put("prompt_tokens",reply.promptTokens()).put("completion_tokens",reply.completionTokens());
        return reply;
      }catch(Exception error){
        exchange.put("error_kind",error.getClass().getSimpleName());
        var causes=exchange.putArray("error_cause_types");Set<Throwable> seen=Collections.newSetFromMap(new IdentityHashMap<>());
        for(Throwable cause=error;cause!=null&&causes.size()<8&&seen.add(cause);cause=cause.getCause()){
          causes.add(cause.getClass().getSimpleName());
          if(cause instanceof CompatibleModelProvider.Failure failure)exchange.put("provider_error_code",failure.code());
        }
        throw error;
      }
      finally{exchange.put("latency_ms",System.currentTimeMillis()-started);}
    }
  }
  JsonNode await(AgentRunService service,Fixture f,String id,boolean authored) throws Exception {
    boolean submitted=false;for(int i=0;Boolean.getBoolean("labflow.team.unbounded")||i<14000;i++){
      var run=json.valueToTree(service.get(f.project,id));String phase=run.path("phase").asText();
      if(phase.equals("awaiting_render")&&!submitted){submitted=true;var body=(ObjectNode)json.readTree("""
        {"render_facts":{"version":1,"canvas":{"width":760,"height":500},"plot":{"x":75,"y":70,"width":650,"height":360},"texts":[],"points":[],"bands":[]}}
        """);if(authored){((ObjectNode)body.at("/render_facts/canvas")).put("width",run.at("/proposal/config/style/width").asInt()).put("height",run.at("/proposal/config/style/height").asInt());}else body.removeAll();service.review(f.project,id,body);}
      if(!Set.of("queued","running").contains(run.path("status").asText())&&!phase.equals("awaiting_render"))return run;Thread.sleep(10);
    }throw new AssertionError("Evaluation run did not terminate");
  }
  ObjectNode evaluate(JsonNode suite,JsonNode item,String agentMode,String mode,ModelProvider live) throws Exception {
    long started=System.currentTimeMillis();var f=fixture(suite,item);try{
      String before=AuditSanitizer.hash(json.valueToTree(workspace.data(f.project,f.dataset)));String sourceHash=String.valueOf(workspace.data(f.project,f.dataset).get("sha256"));
      ModelProvider provider=mode.equals("replay")?new Recording(item,agentMode):new ObservedProvider(live);
      var policy=Boolean.getBoolean("labflow.team.unbounded")?AgentExecutionPolicy.EVALUATION_UNBOUNDED:AgentExecutionPolicy.USER_CONFIGURED;
      var service=new AgentRunService(provider,figures,workspace,json,audit,policy);ReflectionTestUtils.setField(service,"teamDrafts",drafts);ReflectionTestUtils.setField(service,"teamDecisions",decisions);ReflectionTestUtils.setField(service,"proposalReviews",reviews);
      try{
        var request=envelope(f);request.put("mode",agentMode).put("prompt",item.path("prompt").asText()).put("share_metadata",true).put("max_tokens",60000).put("max_steps",8).put("timeout_seconds",120);
        String id=json.valueToTree(service.start(f.project,request)).path("run_id").asText();var result=await(service,f,id,mode.equals("replay"));var record=audit.detail(f.project,id);
        boolean exact=result.has("proposal")&&AuditSanitizer.hash(expected(f,item)).equals(AuditSanitizer.hash(result.at("/proposal/config")));
        boolean processing=!item.has("expected_processing")?!result.at("/proposal/processing").isObject():AuditSanitizer.hash(item.path("expected_processing")).equals(AuditSanitizer.hash(result.at("/proposal/processing/rules")))&&result.at("/proposal/processing/source_dataset_version_id").asLong()==f.dataset;
        if(exact&&item.has("expected_processing")){var memory=drafts.memory(f.project,f.dataset,item.path("expected_processing"));processing&=memory.get("sha256").equals(result.at("/proposal/processing/preview_hash").asText());}
        boolean source=result.at("/proposal/source/dataset_version_id").asLong()==f.dataset&&sourceHash.equals(result.at("/proposal/source/sha256").asText());
        ProcessingRuleAssessment.Result processingAssessment=null;
        if(item.has("expected_processing")){
          var actual=result.at("/proposal/processing/rules");boolean verifiedPreview=false,equalData=false;
          if(actual.isObject())try{
            var expectedMemory=drafts.memory(f.project,f.dataset,item.path("expected_processing"));
            var actualMemory=drafts.memory(f.project,f.dataset,actual);
            verifiedPreview=actualMemory.get("sha256").equals(result.at("/proposal/processing/preview_hash").asText());
            equalData=Objects.equals(expectedMemory.get("fields"),actualMemory.get("fields"))&&Objects.equals(expectedMemory.get("rows"),actualMemory.get("rows"))&&Objects.equals(expectedMemory.get("warnings"),actualMemory.get("warnings"));
          }catch(RuntimeException invalid){/* Preserve the old score; the structural check fails. */}
          processingAssessment=ProcessingRuleAssessment.assess(item.path("expected_processing"),actual,source,verifiedPreview,equalData);
        }
        boolean unchanged=before.equals(AuditSanitizer.hash(json.valueToTree(workspace.data(f.project,f.dataset))))&&workspace.datasets(f.project).size()==1&&workspace.versions(f.project,f.chart).size()==1;
        boolean extra=false;int toolCalls=0;for(var event:result.path("trace"))if(event.path("event").asText().equals("tool_call"))toolCalls++;
        for(var change:result.at("/proposal/changes")){String path=change.path("path").asText();boolean allowed=false;for(var prefix:item.path("allowed_paths"))allowed|=path.equals(prefix.asText())||path.startsWith(prefix.asText()+"/")||prefix.asText().startsWith(path+"/");if(!allowed)extra=true;}
        boolean protocol=provider instanceof Recording authored?authored.complete()&&!Set.of("failed","incomplete","cancelled").contains(result.path("status").asText()):record.path("usage_complete").asBoolean();
        var row=json.createObjectNode().put("id",item.path("id").asText()).put("category",item.path("category").asText()).put("agent_mode",agentMode).put("status",result.path("status").asText()).put("exact_config",exact&&processing&&source).put("extra_changes",extra).put("tool_calls",toolCalls).put("tokens",result.path("tokens").asLong()).put("latency_ms",result.path("latency_ms").asLong()).put("budget_exhausted",result.path("phase").asText().equals("budget_limited")||result.path("reason").asText().contains("预算")).put("usage_complete",record.path("usage_complete").asBoolean()).put("source_unchanged",unchanged).put("protocol_complete",protocol).put("mechanical_pass",exact&&processing&&source&&unchanged&&!extra);
        if(processingAssessment!=null){row.put("processing_structural_match",processingAssessment.structuralMatch());row.put("observation_unit_status",processingAssessment.observationUnitStatus());}
        if(mode.equals("replay"))row.put("matches_authored_expectation",row.path("mechanical_pass").asBoolean()==item.at("/replay/expected_mechanical_pass/"+agentMode).asBoolean()&&protocol&&unchanged);
        if(provider instanceof ObservedProvider observed){
          row.put("prompt",item.path("prompt").asText()).put("reason",result.path("reason").asText()).put("text",result.path("text").asText());
          row.set("model_exchanges",observed.exchanges);row.set("trace",result.path("trace"));row.set("roles",result.path("roles"));
          row.set("expected_config",expected(f,item));row.set("actual_config",result.at("/proposal/config"));
          row.set("expected_processing",item.path("expected_processing"));row.set("actual_processing",result.at("/proposal/processing/rules"));
          row.put("config_matches",exact).put("processing_matches",processing).put("source_matches",source);
          row.set("changes",result.at("/proposal/changes"));
          if(agentMode.equals("team")){
            var intent=row.putObject("intent").put("expected_action","plan").put("expected_data_stage",item.has("expected_processing"));
            boolean found=false;
            for(var exchange:observed.exchanges)if(exchange.path("role").asText().equals("coordinator")&&!exchange.at("/message/content").asText().isBlank()){
              try{var plan=json.readTree(exchange.at("/message/content").asText());boolean data=false,plot=false;for(var task:plan.path("tasks")){data|=task.path("role").asText().equals("data");plot|=task.path("role").asText().equals("plotter");}
                intent.set("observed_plan",plan);intent.put("routing_matches","plan".equals(plan.path("action").asText())&&data==item.has("expected_processing")&&plot);found=true;
              }catch(Exception invalid){intent.put("parse_error",true);}
            }
            if(!found)intent.putNull("routing_matches");
          }
        }
        row.put("geometry",mode.equals("replay")?"authored_synthetic_fixture":"unavailable_headless_R7_R8_skipped");return row;
      }catch(Exception error){return json.createObjectNode().put("id",item.path("id").asText()).put("category",item.path("category").asText()).put("agent_mode",agentMode).put("status","harness_error").put("usage_complete",false).put("tokens",0).put("latency_ms",System.currentTimeMillis()-started).put("exact_config",false).putNull("extra_changes").putNull("tool_calls").putNull("budget_exhausted").put("mechanical_pass",false).put("protocol_complete",false).put("matches_authored_expectation",false).put("error_code","evaluation_incomplete").put("error_kind",error.getClass().getSimpleName());
      }finally{service.close();}
    }finally{cleanup(f.project);}
  }
  @Test void pairedReplayOrExplicitlyOptedInLiveComparison() throws Exception {
    guard();String mode=System.getProperty("labflow.team.mode","replay");assertTrue(Set.of("replay","live").contains(mode));var suite=suite();ModelProvider live=null;
    if(!defaultSuite())assertTrue(suite.path("held_out").asBoolean(),"Custom evaluation suites must be marked held_out so they are never mistaken for a tuning pool");
    if(mode.equals("live")){assertEquals("true",System.getProperty("labflow.eval.live"),"Live comparison may incur charges; explicit opt-in required");try{live=new CompatibleModelProvider(json,System.getenv().getOrDefault("LABFLOW_AGENT_BASE_URL","https://api.deepseek.com"),System.getenv().getOrDefault("LABFLOW_AGENT_MODEL",""),System.getenv().getOrDefault("LABFLOW_AGENT_API_KEY",""));}catch(RuntimeException error){throw new IllegalArgumentException("Invalid model configuration; supply credentials only via the API-key environment variable");}assertTrue(live.info().available());}
    Set<String> selected=new LinkedHashSet<>();String selection=System.getProperty("labflow.team.cases","");if(!selection.isBlank())for(String value:selection.split(",",-1)){if(value.isBlank())throw new IllegalArgumentException("Empty case selection");selected.add(value.trim());}
    Set<String> known=new HashSet<>();suite.path("cases").forEach(item->known.add(item.path("id").asText()));assertTrue(known.containsAll(selected),"Unknown case id");
    int repetitions=Integer.parseInt(System.getProperty("labflow.team.repetitions","1"));
    if(mode.equals("replay"))assertEquals(1,repetitions,"Repetitions are live-only; original replay remains unchanged");
    var budget=mode.equals("live")?EvaluationSpendBudget.configured():null;var report=json.createObjectNode().put("report_version",2).put("mode",mode).put("suite_version",suite.path("suite_version").asText()).put("suite_hash",AuditSanitizer.hash(suite)).put("fixture_provenance",suite.path("fixture_provenance").asText()).put("token_usage_kind",mode.equals("replay")?"synthetic_fixture_counts":"provider_reported").put("run_budget",60000).put("max_steps",8).put("repetitions",repetitions).put("started_at",Instant.now().toString()).put("scope",mode.equals("replay")?"Authored protocol only; no model capability conclusion.":"Real model on synthetic tasks; common-capability S/M and processing P must be reported separately. Headless geometry unavailable. Intent coverage is plan/data-stage routing only; refusal, clarification, consultation and multi-turn intent are not covered.");
    if(live!=null){report.put("configured_model",live.info().model()).put("provider_origin",live.info().endpoint());}
    if(!defaultSuite()){report.put("suite_file",Path.of(System.getProperty("labflow.team.suite")).getFileName().toString()).put("suite_held_out",suite.path("held_out").asBoolean());}
    report.put("unbounded_evaluation",Boolean.getBoolean("labflow.team.unbounded"));report.put("processing_diagnostic_version","v1-structural-and-human-review");
    if(Boolean.getBoolean("labflow.team.unbounded")){report.putNull("run_budget").putNull("max_steps").putNull("timeout_seconds");}
    Path output=Path.of(System.getProperty("labflow.team.output","target/agent-eval/team/"+mode+".json"));
    var rows=report.putArray("cases");var skipped=report.putArray("skipped_by_budget");
    var eligible=new LinkedHashMap<String,JsonNode>();for(var item:suite.path("cases")){
      if(!selected.isEmpty()&&!selected.contains(item.path("id").asText()))continue;if(mode.equals("replay")&&!item.has("replay")){if(!selected.isEmpty())throw new IllegalArgumentException("Selected case has no authored recording");continue;}
      eligible.put(item.path("id").asText(),item);
    }
    List<TeamTrialPlan.Pair> schedule=mode.equals("live")?TeamTrialPlan.pairs(eligible.keySet(),repetitions,18027):eligible.keySet().stream().map(id->new TeamTrialPlan.Pair(id,1,List.of("single","team"))).toList();
    report.put("planned_executions",schedule.size()*2).put("schedule_seed",18027);
    var planned=report.putArray("schedule");for(var pair:schedule){var node=planned.addObject().put("id",pair.id()).put("repetition",pair.repetition());node.set("modes",json.valueToTree(pair.modes()));}
    checkpoint(output,report,budget,skipped.size(),false);
    for(var pair:schedule){var item=eligible.get(pair.id());
      if(budget!=null&&!budget.canStartPair()){for(String agentMode:pair.modes())skipped.add(pair.id()+":"+pair.repetition()+":"+agentMode);continue;}
      // Reserve both halves before a pair; no unpaired comparison is silently introduced.
      for(String agentMode:pair.modes()){
        if(budget!=null&&!budget.canStartCase()){skipped.add(pair.id()+":"+pair.repetition()+":"+agentMode);continue;}
        var row=evaluate(suite,item,agentMode,mode,live);row.put("repetition",pair.repetition());if(budget!=null)budget.record(row);rows.add(row);
        checkpoint(output,report,budget,skipped.size(),false);
        System.out.println("TEAM_EVAL_PROGRESS "+rows.size()+"/"+schedule.size()*2+" "+pair.id()+" repeat="+pair.repetition()+" "+agentMode+" status="+row.path("status").asText()+" pass="+row.path("mechanical_pass").asBoolean()+" tokens="+row.path("tokens").asLong());
      }
    }
    checkpoint(output,report,budget,skipped.size(),true);
    if(mode.equals("replay")){assertEquals(selected.isEmpty()?eligible.size()*2:selected.size()*2,rows.size());for(var row:rows)assertTrue(row.path("matches_authored_expectation").asBoolean(),row.toString());}
  }
  void checkpoint(Path output,ObjectNode report,EvaluationSpendBudget budget,int skipped,boolean complete) throws Exception {
    report.put("updated_at",Instant.now().toString()).put("execution_finished",complete);report.set("comparison",comparison((ArrayNode)report.path("cases")));if(budget!=null)report.set("cost",budget.report(json,skipped));
    Files.createDirectories(output.toAbsolutePath().getParent());Path temporary=output.resolveSibling(output.getFileName()+".tmp");json.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(),report);Files.move(temporary,output,StandardCopyOption.REPLACE_EXISTING);
  }
  ObjectNode comparison(ArrayNode rows){
    var out=json.createObjectNode().put("bootstrap_resamples",1000).put("seed",18010).put("method","Average repetitions within task before percentile bootstrap; paired differences use only matched task/repetition IDs, clustered by task.");
    for(String metric:List.of("exact_config","extra_changes","tool_calls","tokens","latency_ms","budget_exhausted")){
      var item=out.putObject(metric);Map<String,List<Double>> singleSamples=new LinkedHashMap<>(),teamSamples=new LinkedHashMap<>();Map<String,Double> singleTrials=new LinkedHashMap<>(),teamTrials=new LinkedHashMap<>();
      for(var row:rows){var value=row.path(metric);if(!value.isBoolean()&&!value.isNumber())continue;if(metric.equals("tokens")&&!row.path("usage_complete").asBoolean())continue;boolean isSingle=row.path("agent_mode").asText().equals("single");double number=value.isBoolean()?value.asBoolean()?1d:0d:value.asDouble();String id=row.path("id").asText();(isSingle?singleSamples:teamSamples).computeIfAbsent(id,k->new ArrayList<>()).add(number);(isSingle?singleTrials:teamTrials).put(id+":"+row.path("repetition").asInt(1),number);}
      var single=TeamTrialPlan.taskMeans(singleSamples);var team=TeamTrialPlan.taskMeans(teamSamples);
      item.set("single",TeamBootstrap.interval(json,single.values().stream().mapToDouble(Double::doubleValue).toArray(),18010));item.set("team",TeamBootstrap.interval(json,team.values().stream().mapToDouble(Double::doubleValue).toArray(),18010));
      Map<String,List<Double>> paired=new LinkedHashMap<>();for(var entry:singleTrials.entrySet())if(teamTrials.containsKey(entry.getKey())){String id=entry.getKey().split(":")[0];paired.computeIfAbsent(id,k->new ArrayList<>()).add(teamTrials.get(entry.getKey())-entry.getValue());}item.set("paired_team_minus_single",TeamBootstrap.interval(json,TeamTrialPlan.taskMeans(paired).values().stream().mapToDouble(Double::doubleValue).toArray(),18010));
    }return out;
  }
}
