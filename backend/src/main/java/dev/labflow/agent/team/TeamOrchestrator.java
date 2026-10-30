package dev.labflow.agent.team;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.api.ApiException;
import java.util.*;

/** Fixed role order. Models may propose work, but cannot select transitions or execute writes. */
public final class TeamOrchestrator {
  public interface Port {
    ModelProvider.Reply complete(String role,ArrayNode messages,ArrayNode tools) throws Exception;
    void phase(String role,String phase);
    void end(String role,String status,String summary);
    void tool(String role,String name,JsonNode arguments,JsonNode result);
    JsonNode geometry(ObjectNode proposal,Map<String,Object> memory) throws Exception;
  }
  public record Output(ObjectNode proposal,String text,String deepReview,JsonNode reviewRequest,Map<String,Object> memory){}
  private final ObjectMapper json;private final TeamDraftService drafts;private final Port port;
  private final long project;private final String id;private final ObjectNode snapshot;private final JsonNode profile;private final ArrayNode definitions;
  private ArrayNode operations;private ObjectNode processing,candidate;private Map<String,Object> memory;
  private boolean processingProposed;
  private boolean unboundedEvaluation;
  private String request="";
  private JsonNode plannedTasks;
  public TeamOrchestrator(ObjectMapper json,TeamDraftService drafts,Port port,long project,String id,ObjectNode snapshot,JsonNode profile,ArrayNode definitions,ArrayNode inherited,ObjectNode inheritedProcessing,Map<String,Object> inheritedMemory){
    this.json=json;this.drafts=drafts;this.port=port;this.project=project;this.id=id;this.snapshot=snapshot;this.profile=profile;this.definitions=definitions;operations=inherited==null?json.createArrayNode():inherited.deepCopy();processing=inheritedProcessing;memory=inheritedMemory;
  }
  private ArrayNode tools(String role){
    var out=json.createArrayNode();
    for(var tool:definitions){String name=tool.at("/function/name").asText();boolean include=switch(role){case "coordinator"->Set.of("get_figure_spec","get_dataset_profile").contains(name);case "data"->name.equals("get_dataset_profile");case "plotter"->true;default->false;};if(include)out.add(tool);}
    if(role.equals("data"))out.addAll(drafts.processingTools());
    if(role.equals("coordinator")){var fn=out.addObject().put("type","function").putObject("function");fn.put("name","get_current_config").put("description","读取当前可信图表配置，不含原始行");fn.putObject("parameters").put("type","object").put("additionalProperties",false).putObject("properties");}
    return out;
  }
  private JsonNode fields(){return memory==null?profile:drafts.metadata(memory);}
  private ArrayNode roleAssignments(JsonNode tasks){
    var roles=json.createArrayNode();for(var task:tasks)roles.addObject().put("role",task.path("role").asText());return roles;
  }
  private ObjectNode context(String prompt,JsonNode tasks,boolean full){
    var config=operations.isEmpty()?(ObjectNode)snapshot.path("config").deepCopy():dev.labflow.service.FigureOperations.apply(snapshot.path("config"),operations);if(memory!=null)config.put("datasetVersionId","$derived");
    var out=json.createObjectNode().put("request",prompt);out.set("tasks",tasks);out.set("fields",fields());out.set("config",full?config:summary(config));if(processing!=null)out.set("existing_processing",processing);return out;
  }
  private ObjectNode summary(JsonNode config){var out=json.createObjectNode();for(String key:List.of("type","x","group","axes","legend","publication"))out.set(key,config.path(key));var series=out.putArray("series");for(var s:config.path("series")){var item=series.addObject();for(String key:List.of("id","name","y","error","band","color"))item.set(key,s.path(key));}out.set("title",config.at("/style/title"));return out;}
  private String stage(String role,JsonNode context) throws Exception {
    port.phase(role,switch(role){case "coordinator"->"planning";case "data"->"data";case "plotter"->"plotting";default->"reviewing";});
    var allowed=tools(role);Set<String> names=new HashSet<>();for(var t:allowed)names.add(t.at("/function/name").asText());
    var messages=json.createArrayNode();messages.addObject().put("role","system").put("content",TeamPrompts.text(role));messages.addObject().put("role","user").put("content",context.toString());
    for(int round=0;unboundedEvaluation||round<4;round++){
      var reply=port.complete(role,messages,allowed);if(!Set.of("stop","tool_calls").contains(reply.finishReason()))throw new IllegalStateException("角色输出未完整结束");
      var message=reply.message();var calls=message.path("tool_calls");messages.add(message.deepCopy());
      if(calls.isMissingNode()||calls.isNull()||(calls.isArray()&&calls.isEmpty())){port.end(role,"complete","阶段已完成");return message.path("content").asText("");}
      if(!calls.isArray()||calls.isEmpty()||calls.size()>8)throw new IllegalStateException("角色工具调用无效");
      Set<String> ids=new HashSet<>();var tentative=operations.deepCopy();var results=new ArrayList<JsonNode>();
      for(var call:calls){String name=call.at("/function/name").asText(),callId=call.path("id").asText();
        if(!names.contains(name)||!"function".equals(call.path("type").asText())||!call.path("id").isTextual()||callId.isBlank()||callId.length()>200||!ids.add(callId)||!call.at("/function/arguments").isTextual()||call.at("/function/arguments").asText().length()>8000)throw new IllegalStateException("角色调用了未授权工具或参数无效");
        var args=json.readTree(call.at("/function/arguments").asText());if(args==null||!args.isObject())throw ApiException.bad("角色工具参数无效");JsonNode result;
        switch(name){
          case "get_dataset_profile"->{dev.labflow.review.RenderFacts.fields(args,Set.of(),Set.of());result=role.equals("data")?profile:fields();}
          case "get_current_config"->{dev.labflow.review.RenderFacts.fields(args,Set.of(),Set.of());result=context("",json.createArrayNode(),true).path("config");}
          case "get_figure_spec"->{dev.labflow.review.RenderFacts.fields(args,Set.of("type"),Set.of());if(args.has("type")&&!args.path("type").isTextual())throw ApiException.bad("图型无效");result=dev.labflow.service.FigureSpecs.describe(args.has("type")?args.path("type").asText():null);}
          case "propose_processing"->{
            if(processingProposed)throw ApiException.bad("一次运行只允许一份处理规则");
            try{
              var proposedMemory=drafts.memory(project,snapshot.at("/config/datasetVersionId").asLong(),args);
              var proposedProcessing=drafts.processing(project,id,snapshot,args,proposedMemory);
              result=drafts.metadata(proposedMemory);
              memory=proposedMemory;processing=proposedProcessing;processingProposed=true;
            }catch(ApiException e){
              // A rejected in-memory proposal does not consume the one successful proposal slot.
              // Conflict/access/server errors remain terminal; never echo exception bodies to the model.
              if(e.status!=400)throw e;
              result=drafts.processingValidationFailure();
            }
          }
          case "lint_figure"->{dev.labflow.review.RenderFacts.fields(args,Set.of(),Set.of());result=json.createObjectNode().put("ok",true);}
          default->{tentative.addObject().put("tool",name).set("arguments",args);result=json.createObjectNode().put("ok",true).put("queued_operations",tentative.size());}
        }
        results.add(result);
      }
      // Read-only and lint-only rounds must neither preview an empty batch nor replay prior edits.
      if(role.equals("plotter")&&tentative.size()>operations.size()){
        candidate=drafts.preview(project,snapshot,tentative,memory);operations=tentative;
      }
      for(int i=0;i<calls.size();i++){var call=calls.get(i);var result=results.get(i);String name=call.at("/function/name").asText();port.tool(role,name,json.readTree(call.at("/function/arguments").asText()),result);messages.addObject().put("role","tool").put("tool_call_id",call.path("id").asText()).put("content",result.toString());}
    }
    throw new TeamBudget.Limit("已达到角色模型步数上限");
  }
  public Output execute(String prompt,boolean reviewOnly,JsonNode initialReviewRequest) throws Exception {
    return execute(prompt,reviewOnly,initialReviewRequest,false);
  }
  public Output execute(String prompt,boolean reviewOnly,JsonNode initialReviewRequest,boolean unboundedEvaluation) throws Exception {
    this.unboundedEvaluation=unboundedEvaluation;
    this.request=prompt;this.plannedTasks=json.createArrayNode();
    if(reviewOnly){
      var report=drafts.report(project,snapshot,snapshot.path("config"),initialReviewRequest.path("render_facts"),initialReviewRequest.path("target"),null);
      String text=review(snapshot.path("config"),report,initialReviewRequest);return new Output(null,text,text,initialReviewRequest,null);
    }
    String planText=stage("coordinator",context(prompt,json.createArrayNode(),false));var plan=json.readTree(planText);
    dev.labflow.review.RenderFacts.fields(plan,Set.of("action","message","tasks"),Set.of("action","message","tasks"));
    if(!Set.of("plan","clarify","refuse").contains(plan.path("action").asText())||!plan.path("message").isTextual()||plan.path("message").asText().length()>1000||!plan.path("tasks").isArray()||plan.path("tasks").size()>4)throw ApiException.bad("协作计划格式无效");
    if(!plan.path("action").asText().equals("plan"))return new Output(null,plan.path("message").asText(),"",null,null);
    plannedTasks=plan.path("tasks").deepCopy();
    boolean data=false,plot=false;for(var task:plan.path("tasks")){
      dev.labflow.review.RenderFacts.fields(task,Set.of("role","goal"),Set.of("role","goal"));String role=task.path("role").asText();
      if(!Set.of("data","plotter","reviewer").contains(role)||!task.path("goal").isTextual()||task.path("goal").asText().isBlank()||task.path("goal").asText().length()>500)throw ApiException.bad("协作子任务无效");data|=role.equals("data");plot|=role.equals("plotter");
    }
    if(!plot)throw ApiException.bad("协作计划缺少绘图阶段");
    var assignments=roleAssignments(plan.path("tasks"));
    if(data){var sourceContext=context(prompt,assignments,false);sourceContext.set("fields",profile);stage("data",sourceContext);if(!processingProposed)throw ApiException.bad("数据阶段没有提交处理规则");}
    String explanation=stage("plotter",context(prompt,assignments,true));
    if(operations.isEmpty())return new Output(null,explanation,"",null,null);
    candidate=drafts.preview(project,snapshot,operations,memory);candidate.set("operations",operations);
    if(processing!=null){candidate.set("processing",processing);candidate.set("preview_dataset",json.valueToTree(memory));}
    var request=port.geometry(candidate,memory);var report=drafts.report(project,snapshot,candidate.path("config"),request.path("render_facts"),request.path("target"),memory);
    String deep=review(candidate.path("config"),report,request);
    String notice=TeamLabelNotice.forMappingChange(snapshot.path("config"),candidate.path("config"));
    if(!notice.isEmpty()){explanation=explanation.isBlank()?notice:explanation+"\n\n"+notice;deep=deep.isBlank()?notice:deep+"\n\n"+notice;}
    candidate.put("deep_review",deep);
    return new Output(candidate,explanation,deep,request,memory);
  }
  private String review(JsonNode config,JsonNode report,JsonNode request) throws Exception {
    var context=json.createObjectNode();context.set("config_summary",summary(config));
    context.put("request",this.request);context.set("tasks",roleAssignments(plannedTasks));context.set("coordinator_plan",plannedTasks);
    context.set("original_config_summary",summary(snapshot.path("config")));
    var allChanges=dev.labflow.service.FigureOperations.changes(snapshot.path("config"),config);
    context.put("change_count",allChanges.size());var changes=context.putArray("change_summary");
    for(var change:allChanges){
      if(changes.size()==40)break;
      var item=changes.addObject().put("path",change.path("path").asText());
      for(String key:List.of("before","after")){
        var value=change.path(key);item.set(key,value.toString().length()<=500?value:AuditSanitizer.hidden(value));
      }
    }
    context.put("changes_truncated",allChanges.size()>changes.size());
    var issues=context.putArray("deterministic_issues");for(var issue:report.path("issues")){if(issues.size()>=8)break;var item=issues.addObject();for(String key:List.of("rule","title","detail")){String value=issue.path(key).asText();item.put(key,value.substring(0,Math.min(300,value.length())));}}
    var geometry=context.putObject("geometry_summary");var facts=request.path("render_facts");for(String key:List.of("canvas","plot","legend"))if(facts.has(key))geometry.set(key,facts.path(key));for(String key:List.of("texts","points","bands"))geometry.put(key+"_count",facts.path(key).size());
    try{return stage("reviewer",context);}catch(TeamBudget.Limit|InterruptedException|java.util.concurrent.TimeoutException|java.net.http.HttpTimeoutException e){throw e;}catch(Exception e){if(e.getCause() instanceof java.net.http.HttpTimeoutException)throw new java.util.concurrent.TimeoutException();port.end("reviewer","failed","深度审稿未完成：模型服务调用失败");return "深度审稿未完成：模型服务调用失败；确定性审稿仍可使用。";}
  }
}
