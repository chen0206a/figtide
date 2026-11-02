package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.AgentAuditRepository;
import dev.labflow.review.ReviewJson;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static dev.labflow.diagram.DiagramValidator.*;

/** Decision joins the original ledger transaction; applying a diagram never calls save. */
@Service
public class DiagramProposalService {
  private final ObjectMapper json;private final AgentAuditRepository db;private final AgentAuditService audit;
  public DiagramProposalService(ObjectMapper json,AgentAuditRepository db,AgentAuditService audit){this.json=json;this.db=db;this.audit=audit;}
  @Transactional public ObjectNode decide(long project,String id,JsonNode request,boolean eligible,String expectedHash,JsonNode proposal){
    fields(request,"outcome reason proposal_hash accepted_fixes review_hash accepted_facts label_choices","outcome proposal_hash");
    var original=(ObjectNode)request.deepCopy();original.remove(List.of("accepted_fixes","review_hash","accepted_facts","label_choices"));
    if(!request.path("outcome").asText().equals("accepted")){require(!request.has("accepted_fixes")&&!request.has("review_hash")&&!request.has("accepted_facts")&&!request.has("label_choices"),"拒绝提案不能选择修复或标签");return audit.decide(project,id,original,false,expectedHash);}
    var row=db.lock(project,id);require("diagram".equals(row.get("mode")),"运行类型不一致");
    var selected=new TreeSet<String>();var ids=request.path("accepted_fixes");require(ids.isArray()&&ids.size()<=100,"请选择审稿修复列表");for(var value:ids)require(value.isTextual()&&selected.add(text(value,128)),"修复ID重复或无效");
    var stored=ReviewJson.read(json,row.get("review_json")).path("result");require(stored.isObject(),"请先完成提案审稿");
    if(!request.path("review_hash").asText().equals(stored.path("review_hash").asText()))throw new ApiException(409,"审稿结果已变化，请重新预览");
    var accepted=ReviewJson.read(json,row.get("accepted_fixes_json"));if("accepted".equals(row.get("outcome"))&&!json.valueToTree(selected).equals(accepted.path("ids")))throw new ApiException(409,"已确认了不同的修复");
    if(proposal==null||!expectedHash.equals(row.get("proposal_hash")))throw new ApiException(409,"历史提案只能追溯，请重新生成");
    var factInput=request.has("accepted_facts")?request.path("accepted_facts"):proposal.path("selected_facts");
    var factIds=proposal.has("facts")?json.valueToTree(DiagramFactSelection.indices(factInput,proposal.path("facts").size(),true)):json.createArrayNode();
    if("accepted".equals(row.get("outcome"))&&accepted.has("facts")&&!factIds.equals(accepted.path("facts")))throw new ApiException(409,"已确认了不同的事实选择");
    var filtered=DiagramFactSelection.select(proposal,factInput);
    var labels=labelChoices(request.path("label_choices"),proposal,filtered,stored);
    if("accepted".equals(row.get("outcome"))&&accepted.has("labels")&&!labels.equals(accepted.path("labels")))throw new ApiException(409,"已确认了不同的标签选择");
    var operations=json.createArrayNode();var found=new HashSet<String>();for(var issue:stored.path("issues"))if(selected.contains(issue.path("id").asText())){require(issue.path("fixable").asBoolean(),"所选问题不能自动修复");found.add(issue.path("id").asText());for(var op:issue.path("fix"))if(DiagramFactSelection.applicable(filtered,op))operations.add(op);}
    for(var label:labels)if(label.path("action").asText().equals("source")){var op=operations.addObject().put("tool","update_node");op.putObject("arguments").put("id",label.path("node_id").asText()).put("label",label.path("label").asText());}
    require(found.equals(selected),"修复ID不在当前报告中");var doc=DiagramOperations.apply(filtered,operations);var result=audit.decide(project,id,original,eligible,expectedHash);
    if("pending".equals(row.get("outcome"))){var record=json.createObjectNode().put("config_hash",AuditSanitizer.hash(doc));record.set("ids",json.valueToTree(selected));record.set("facts",factIds);record.set("labels",labels);if(db.storeAcceptedFixes(project,id,record.toString())!=1)throw new ApiException(409,"提案决策已变化");}
    result.set("doc",doc);result.set("accepted_fixes",json.valueToTree(selected));result.put("final_config_hash",AuditSanitizer.hash(doc));return result;
  }
  private ArrayNode labelChoices(JsonNode input,JsonNode proposal,JsonNode filtered,JsonNode report){
    var out=json.createArrayNode();if(input.isMissingNode())return out;require(input.isArray()&&input.size()<=100,"标签选择无效");
    var allowed=new HashSet<String>();for(var issue:report.path("issues"))if(issue.path("rule").asText().equals("D8")&&issue.at("/anchor/kind").asText().equals("node")){var node=proposal.path("config").path("nodes").path(issue.at("/anchor/ref").asInt());if(node.has("id"))for(var current:filtered.path("nodes"))if(current.path("id").equals(node.path("id"))&&current.path("label").equals(node.path("label")))allowed.add(node.path("id").asText());}
    var sorted=new TreeMap<String,JsonNode>();for(var choice:input){fields(choice,"node_id action label","node_id action");String id=text(choice.path("node_id"),64),action=text(choice.path("action"),16);require(allowed.contains(id)&&Set.of("keep","source").contains(action)&&!sorted.containsKey(id),"标签选择不在当前D8报告中或重复");boolean present=false;for(var node:filtered.path("nodes"))present|=node.path("id").asText().equals(id);require(present,"节点已被事实筛选排除");
      if(action.equals("keep"))require(!choice.has("label"),"保留标签不能改写文字");else{
        String label=text(choice.path("label"),200);require(!label.isBlank(),"请选择原文中的用词");var indices=new TreeSet<Integer>();for(var binding:proposal.path("fact_bindings"))if(binding.path("field").asText().equals("nodes")&&binding.path("id").asText().equals(id))for(var i:binding.path("facts"))indices.add(i.asInt());
        var quotes=new ArrayList<String>();if(!indices.isEmpty()&&proposal.has("facts")){for(int i:indices){String quote=proposal.path("facts").path(i).path("quote").asText();for(var f:filtered.at("/meta/fact_sources"))if(f.path("quote").asText().equals(quote))quotes.add(quote);}}else for(var f:filtered.at("/meta/fact_sources"))quotes.add(f.path("quote").asText());
        if(quotes.isEmpty())quotes.add(filtered.at("/meta/source_text").asText());require(quotes.stream().anyMatch(q->q.contains(label)),"替换用词必须逐字来自关联原文");
      }sorted.put(id,choice.deepCopy());
    }for(var choice:sorted.values())out.add(choice);return out;
  }
  @Transactional public void storeReview(long project,String id,ObjectNode report){
    report.put("review_hash",AuditSanitizer.hash(report));var record=json.createObjectNode();record.set("result",report);
    if(db.storeReview(project,id,record.toString())!=1)throw new ApiException(409,"提案已变化，无法绑定审稿");
  }
}
