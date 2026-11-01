package dev.labflow.eval;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.*;
import dev.labflow.agent.*;
import dev.labflow.diagram.*;
import dev.labflow.service.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;

@LabflowIntegrationTest
class DiagramEvaluationTest {
  @Autowired ObjectMapper json;@Autowired WorkspaceService workspace;@Autowired FigureToolService figures;@Autowired AgentAuditService audit;@Autowired DiagramCatalog catalog;@Autowired DiagramService diagrams;@Autowired DiagramAgentEngine engine;@Autowired DiagramProposalService proposals;
  JsonNode resource(String name)throws Exception{try(var in=getClass().getResourceAsStream("/diagram-eval/"+name)){return json.readTree(in);}}
  JsonNode waitFor(AgentRunService service,long project,String id,String phase)throws Exception{for(int i=0;i<650;i++){var row=json.valueToTree(service.get(project,id));if(row.path("phase").asText().equals(phase)||!Set.of("queued","running").contains(row.path("status").asText()))return row;Thread.sleep(20);}throw new AssertionError("mechanism protocol timed out");}
  AgentRunService harness(ModelProvider provider){var service=new AgentRunService(provider,figures,workspace,json,audit);ReflectionTestUtils.setField(service,"diagramAgent",engine);ReflectionTestUtils.setField(service,"diagramProposals",proposals);return service;}
  EvaluationSpendBudget liveBudget;
  ObjectNode evaluate(JsonNode task,ModelProvider provider)throws Exception{
    long project=json.valueToTree(workspace.createProject("Diagram evaluation synthetic","Isolated test database; no real workspace")).path("id").asLong();
    var doc=(ObjectNode)catalog.template("workflow","en");for(String field:List.of("zones","nodes","edges","annotations"))doc.putArray(field);((ObjectNode)doc.path("meta")).putNull("template");
    long diagram=((Number)diagrams.create(project,"Synthetic protocol",doc).get("id")).longValue();var request=json.createObjectNode().put("mode","diagram").put("protocol_version",1).put("diagram_id",diagram).put("base_revision",1).put("skill_id",task.path("skill_id").asText()).put("diagram_stage","brief").put("share_metadata",true).put("prompt",task.path("description").asText()).put("max_tokens",60000).put("timeout_seconds",120);request.set("doc",doc);
    var service=harness(provider);var started=new LinkedHashSet<String>();var billed=new HashSet<String>();try{
      if(liveBudget!=null&&!liveBudget.canStartCase())throw new IllegalStateException("费用预留不足，未启动简报");
      String id=json.valueToTree(service.start(project,request)).path("run_id").asText();started.add(id);var brief=waitFor(service,project,id,"awaiting_facts");assertEquals("answered",brief.path("status").asText(),brief.toString());
      if(liveBudget!=null){liveBudget.record(json.valueToTree(service.detail(project,id)));billed.add(id);if(!liveBudget.canStartCase())throw new IllegalStateException("费用预留不足，未启动结构");}
      request.put("diagram_stage","structure").put("facts_confirmed",true).put("source_prompt",task.path("description").asText()).put("brief",brief.at("/diagram/brief").asText()).put("session_id",brief.path("session_id").asText());request.set("facts",brief.at("/diagram/facts"));
      id=json.valueToTree(service.start(project,request)).path("run_id").asText();started.add(id);var pending=waitFor(service,project,id,"awaiting_render");assertEquals("awaiting_render",pending.path("phase").asText(),pending.toString());var geometry=json.createObjectNode();geometry.set("doc",pending.at("/proposal/doc"));geometry.putNull("render_facts");service.review(project,id,geometry);
      var done=waitFor(service,project,id,"proposed");assertEquals("proposed",done.path("status").asText(),done.toString());assertEquals(1,diagrams.get(project,diagram).get("revision"));
      var result=judge(task,done.at("/proposal/doc"),done.path("review"));result.put("steps",done.path("steps").asInt()+brief.path("steps").asInt()).put("tokens",done.path("tokens").asLong()+brief.path("tokens").asLong()).put("latency_ms",done.path("latency_ms").asLong()+brief.path("latency_ms").asLong()).put("usage_complete",true).put("render_facts_collected",false);return result;
    }finally{service.close();if(liveBudget!=null)for(String id:started)if(!billed.contains(id)){try{liveBudget.record(json.valueToTree(service.detail(project,id)));}catch(RuntimeException missing){liveBudget.record(json.createObjectNode().put("usage_complete",false));}}}
  }
  ObjectNode judge(JsonNode task,JsonNode doc,JsonNode review){
    var labels=new HashMap<String,String>();var zones=new HashMap<String,String>();for(var z:doc.path("zones"))zones.put(z.path("id").asText(),z.path("label").asText());
    for(var n:doc.path("nodes"))labels.put(n.path("id").asText(),n.path("label").asText());
    int recalled=0,correct=0,activation=0,activationCorrect=0,inhibition=0,inhibitionCorrect=0,fabricated=0,errors=0,zoneMatches=0;
    for(var expected:task.at("/gold/entities"))if(labels.containsValue(expected.asText()))recalled++;
    for(var expected:task.at("/gold/edges")){
      boolean found=false;for(var edge:doc.path("edges"))found|=Objects.equals(labels.get(edge.path("from").asText()),expected.path("from").asText())&&Objects.equals(labels.get(edge.path("to").asText()),expected.path("to").asText())&&edge.path("kind").equals(expected.path("kind"));
      if(found)correct++;if(expected.path("kind").asText().equals("activate")){activation++;if(found)activationCorrect++;}if(expected.path("kind").asText().equals("inhibit")){inhibition++;if(found)inhibitionCorrect++;}
    }
    for(var issue:review.path("issues")){if(issue.path("rule").asText().equals("D8"))fabricated++;if(issue.path("severity").asText().equals("error"))errors++;}
    for(var node:doc.path("nodes")){var expected=task.at("/gold/zones").get(node.path("label").asText());if(expected!=null&&Objects.equals(expected.isNull()?null:expected.asText(),zones.get(node.path("zone").asText())))zoneMatches++;}
    var out=json.createObjectNode().put("case_id",task.path("id").asText()).put("entity_recall",(double)recalled/task.at("/gold/entities").size()).put("edge_type_accuracy",(double)correct/task.at("/gold/edges").size()).put("activation_total",activation).put("activation_correct",activationCorrect).put("inhibition_total",inhibition).put("inhibition_correct",inhibitionCorrect).put("fabricated_labels",fabricated).put("review_errors",errors).put("zone_matches",zoneMatches);
    out.set("review_skipped",review.path("skipped"));var forbidden=out.putArray("forbidden_found");for(var value:task.at("/gold/forbidden"))if(doc.toString().contains(value.asText()))forbidden.add(value);return out;
  }
  final class Scripted implements ModelProvider {
    final JsonNode task,fixture;int calls;
    Scripted(JsonNode task,JsonNode fixture){this.task=task;this.fixture=fixture;}
    public Info info(){return new Info(true,"hand-authored-protocol","http://127.0.0.1:1","");}
    public Reply complete(ArrayNode messages,ArrayNode tools,int max,Duration timeout){
      var message=json.createObjectNode().put("role","assistant");String finish="stop";
      if(calls++==0){var brief=json.createObjectNode().put("brief","Synthetic scientific schematic");brief.putArray("facts").addObject().put("text",task.path("description").asText()).put("quote",task.path("description").asText());message.put("content",brief.toString());}
      else if(calls==2){var list=message.putArray("tool_calls");int i=0;for(var op:fixture.path("operations")){var fn=list.addObject().put("id","call"+i++).put("type","function").putObject("function");fn.put("name",op.path("tool").asText()).put("arguments",op.path("arguments").toString());}finish="tool_calls";}
      else if(calls==3)message.put("content","请核对结构与审稿意见后确认。");else throw new AssertionError("Unexpected protocol retry");
      return new Reply(message,0,0,"hand-authored-protocol",finish);
    }
  }
  @Test void thirtySixSyntheticCasesAndTwelveHandAuthoredProtocols()throws Exception{
    var suite=resource("suite-v1.json");assertEquals(36,suite.path("cases").size());Map<String,JsonNode> cases=new HashMap<>();var counts=new HashMap<String,Integer>();for(var task:suite.path("cases")){assertTrue(task.path("synthetic").asBoolean());cases.put(task.path("id").asText(),task);counts.merge(task.path("skill_id").asText(),1,Integer::sum);}assertEquals(6,counts.size());assertTrue(counts.values().stream().allMatch(x->x==6));
    var fixtures=resource("protocol-v1.json");assertEquals(12,fixtures.path("fixtures").size());var rows=json.createArrayNode();
    for(var fixture:fixtures.path("fixtures")){assertTrue(fixture.path("recording").asText().contains("not model samples"));var task=cases.get(fixture.path("case_id").asText());var row=evaluate(task,new Scripted(task,fixture));assertEquals(1,row.path("entity_recall").asDouble());assertEquals(1,row.path("edge_type_accuracy").asDouble());assertEquals(3,row.path("zone_matches").asInt());assertEquals(0,row.path("fabricated_labels").asInt());assertTrue(row.path("forbidden_found").isEmpty());rows.add(row);}
    writeReport("replay",rows);
  }
  void writeReport(String mode,ArrayNode rows)throws Exception{
    var report=json.createObjectNode().put("mode",mode).put("recording",mode.equals("replay")?"hand-authored synthetic protocol; NOT model samples":"explicit live provider responses").put("render_facts_collected",false).put("limitation","D4/D5 are explicitly skipped in headless evaluation; UI E2E measures rendered geometry. Replay measures protocol correctness, not model quality. Reports remain local.");report.set("cases",rows);report.set("entity_recall_ci",TeamBootstrap.interval(json,java.util.stream.StreamSupport.stream(rows.spliterator(),false).filter(r->r.path("entity_recall").isNumber()).mapToDouble(r->r.path("entity_recall").asDouble()).toArray(),18010));
    if(liveBudget!=null)report.set("cost_budget",liveBudget.report(json,36-rows.size()));
    for(String metric:List.of("edge_type_accuracy","fabricated_labels","review_errors","steps","tokens","latency_ms"))report.set(metric+"_ci",TeamBootstrap.interval(json,java.util.stream.StreamSupport.stream(rows.spliterator(),false).filter(r->r.path(metric).isNumber()).mapToDouble(r->r.path(metric).asDouble()).toArray(),18010));
    for(String kind:List.of("activation","inhibition"))report.set(kind+"_accuracy_ci",TeamBootstrap.interval(json,java.util.stream.StreamSupport.stream(rows.spliterator(),false).filter(r->r.path(kind+"_total").asInt()>0).mapToDouble(r->r.path(kind+"_correct").asDouble()/r.path(kind+"_total").asDouble()).toArray(),18010));
    Path dir=Path.of("../.runtime/diagram-eval");Files.createDirectories(dir);Files.writeString(dir.resolve(mode+"-"+System.currentTimeMillis()+".json"),json.writerWithDefaultPrettyPrinter().writeValueAsString(report));
  }
  @Test void liveOnlyWhenOwnerExplicitlyInvokesIt()throws Exception{
    Assumptions.assumeTrue(Boolean.getBoolean("labflow.diagram.eval.live"),"真实模型评测仅由主人显式运行");
    var budget=EvaluationSpendBudget.configured();liveBudget=budget;var provider=new CompatibleModelProvider(json,System.getenv().getOrDefault("LABFLOW_AGENT_BASE_URL","https://api.deepseek.com"),System.getenv().getOrDefault("LABFLOW_AGENT_MODEL",""),System.getenv().getOrDefault("LABFLOW_AGENT_API_KEY",""));assertTrue(provider.info().available());var rows=json.createArrayNode();
    for(var task:resource("suite-v1.json").path("cases")){if(!budget.canStartPair())break;ObjectNode row;try{row=evaluate(task,provider);}catch(Exception|AssertionError error){row=json.createObjectNode().put("case_id",task.path("id").asText()).put("usage_complete",false).put("status","incomplete");}rows.add(row);writeReport("live",rows);}
  }
}
