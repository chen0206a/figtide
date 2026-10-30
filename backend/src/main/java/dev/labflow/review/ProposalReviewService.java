package dev.labflow.review;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.AgentAuditRepository;
import dev.labflow.service.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Joins the existing decision transaction. No budget, model, run-state or chart-save logic. */
@Service
public class ProposalReviewService {
  private final AgentAuditRepository db;private final AgentAuditService audit;private final ReviewEndpointService reviews;
  private final FigureToolService figures;private final ObjectMapper json;
  public ProposalReviewService(AgentAuditRepository db,AgentAuditService audit,ReviewEndpointService reviews,FigureToolService figures,ObjectMapper json){this.db=db;this.audit=audit;this.reviews=reviews;this.figures=figures;this.json=json;}
  private static ApiException stale(){return new ApiException(409,"提案不再有效，请重新生成");}
  private static boolean overlap(String a,String b){return a.equals(b)||a.startsWith(b+"/")||b.startsWith(a+"/");}
  @Transactional
  public ObjectNode review(long project,String id,JsonNode baseline,JsonNode proposal,JsonNode request){
    return review(project,id,baseline,proposal,request,null);
  }
  @Transactional
  public ObjectNode review(long project,String id,JsonNode baseline,JsonNode proposal,JsonNode request,Map<String,Object> memory){
    RenderFacts.fields(request,Set.of("render_facts","target"),Set.of());
    var geometry=RenderFacts.validate(request.path("render_facts"));RenderFacts.target(request.path("target"));
    var row=db.lock(project,id);
    if(!"proposed".equals(row.get("status"))||!"pending".equals(row.get("outcome"))||db.hasActiveChild(project,id))throw new ApiException(409,"只有尚未决定、未在续改的提案可以审稿");
    String proposalHash=AuditSanitizer.hash(proposal.path("config"));if(!proposalHash.equals(row.get("proposal_hash")))throw stale();
    var context=json.createObjectNode().put("proposal_hash",proposalHash);
    context.set("render_facts",geometry==null?json.nullNode():geometry);
    context.set("target",request.path("target").isObject()?request.path("target"):json.createObjectNode());
    String key=AuditSanitizer.hash(context);var stored=ReviewJson.read(json,row.get("review_json"));
    if(key.equals(stored.path("key").asText()))return (ObjectNode)stored.path("result").deepCopy();
    Long chart=row.get("chart_id") instanceof Number n?n.longValue():null;
    var report=memory==null?reviews.reviewConfig(project,proposal.path("config"),geometry,context.path("target"),chart):reviews.reviewMemory(project,proposal.path("config"),geometry,context.path("target"),chart,memory);
    var userChanges=FigureOperations.changes(baseline,proposal.path("config"));
    for(var issue:report.path("issues"))if(issue.path("fixable").asBoolean()){
      var source=(ObjectNode)proposal.path("config").deepCopy();if(memory!=null)source.put("datasetVersionId",((Number)memory.get("id")).longValue());
      var changes=FigureOperations.changes(source,FigureOperations.apply(source,issue.path("fix")));
      boolean conflicts=false;for(var changed:changes)for(var user:userChanges)conflicts|=overlap(changed.path("path").asText(),user.path("path").asText());
      if(conflicts){var advice=(ObjectNode)issue;advice.put("fixable",false).put("detail",issue.path("detail").asText()+" 与你这次的要求冲突，未自动修改。");advice.set("fix",json.createArrayNode());}
    }
    String reviewHash=AuditSanitizer.hash(json.createObjectNode().put("key",key).set("result",report));report.put("review_hash",reviewHash);
    var record=json.createObjectNode().put("key",key).put("proposal_hash",proposalHash);record.set("result",report);
    if(db.storeReview(project,id,record.toString())!=1)throw stale();
    return report;
  }
  private SortedSet<String> ids(JsonNode node){
    if(!node.isArray()||node.size()>100)throw ApiException.bad("审稿修复 ID 列表无效");
    SortedSet<String> ids=new TreeSet<>();for(var id:node){if(!id.isTextual()||id.asText().isBlank()||id.asText().length()>128||!ids.add(id.asText()))throw ApiException.bad("审稿修复 ID 无效或重复");}return ids;
  }
  @Transactional
  public ObjectNode decide(long project,String id,ObjectNode request,boolean eligible,String expectedHash,JsonNode proposal){
    if(!request.path("outcome").asText().equals("accepted"))throw ApiException.bad("只有接受提案时可以选择审稿修复");
    var selected=ids(request.path("accepted_fixes"));var row=db.lock(project,id);
    var stored=ReviewJson.read(json,row.get("review_json"));var report=stored.path("result");
    if(!report.isObject())throw new ApiException(409,"请先审稿再选择修复");
    if(request.has("review_hash")&&(!request.path("review_hash").isTextual()||!request.path("review_hash").asText().equals(report.path("review_hash").asText())))throw new ApiException(409,"审稿报告已变化，请重新预览");
    var accepted=ReviewJson.read(json,row.get("accepted_fixes_json"));
    if("accepted".equals(row.get("outcome"))){if(!selected.equals(ids(accepted.path("ids"))))throw new ApiException(409,"该提案已确认了不同的审稿修复");}
    else if(!"pending".equals(row.get("outcome"))||!eligible||proposal==null)throw stale();
    var operations=json.createArrayNode();Set<String> found=new HashSet<>();
    for(var issue:report.path("issues"))if(selected.contains(issue.path("id").asText())){
      if(!issue.path("fixable").asBoolean())throw new ApiException(409,"所选问题不可自动修复，请重新预览");
      found.add(issue.path("id").asText());for(var operation:issue.path("fix"))operations.add(operation);
    }
    if(!found.equals(selected))throw new ApiException(409,"所选审稿修复已失效");
    ObjectNode config=null;String finalHash=accepted.path("config_hash").asText();
    if(proposal!=null){
      config=operations.isEmpty()?(ObjectNode)proposal.path("config").deepCopy():FigureOperations.apply(proposal.path("config"),operations);
      var envelope=json.createObjectNode().put("protocol_version",1).put("base_revision",((Number)row.get("base_revision")).intValue());envelope.set("config",config);
      if(row.get("chart_id") instanceof Number chart)envelope.put("chart_id",chart.longValue());
      try{if(!Boolean.TRUE.equals(figures.lint(project,envelope).get("ok")))throw stale();}catch(ApiException e){throw stale();}
      finalHash=AuditSanitizer.hash(config);
    }
    var original=request.deepCopy();original.remove(List.of("accepted_fixes","review_hash"));
    var result=audit.decide(project,id,original,eligible,expectedHash);
    if("pending".equals(row.get("outcome"))){
      var record=json.createObjectNode().put("config_hash",finalHash);record.set("ids",json.valueToTree(selected));
      if(accepted.has("processing_commit"))record.set("processing_commit",accepted.path("processing_commit"));
      if(db.storeAcceptedFixes(project,id,record.toString())!=1)throw stale();
    }
    result.set("accepted_fixes",json.valueToTree(selected));result.put("final_config_hash",finalHash);
    if(config!=null)result.set("config",config);
    return result;
  }
}
