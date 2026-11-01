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
    fields(request,"outcome reason proposal_hash accepted_fixes review_hash","outcome proposal_hash");
    var original=(ObjectNode)request.deepCopy();original.remove(List.of("accepted_fixes","review_hash"));
    if(!request.path("outcome").asText().equals("accepted")){require(!request.has("accepted_fixes")&&!request.has("review_hash"),"拒绝提案不能选择修复");return audit.decide(project,id,original,false,expectedHash);}
    var row=db.lock(project,id);require("diagram".equals(row.get("mode")),"运行类型不一致");
    var selected=new TreeSet<String>();var ids=request.path("accepted_fixes");require(ids.isArray()&&ids.size()<=100,"请选择审稿修复列表");for(var value:ids)require(value.isTextual()&&selected.add(text(value,128)),"修复ID重复或无效");
    var stored=ReviewJson.read(json,row.get("review_json")).path("result");require(stored.isObject(),"请先完成提案审稿");
    if(!request.path("review_hash").asText().equals(stored.path("review_hash").asText()))throw new ApiException(409,"审稿结果已变化，请重新预览");
    var accepted=ReviewJson.read(json,row.get("accepted_fixes_json"));if("accepted".equals(row.get("outcome"))&&!json.valueToTree(selected).equals(accepted.path("ids")))throw new ApiException(409,"已确认了不同的修复");
    if(proposal==null||!expectedHash.equals(row.get("proposal_hash")))throw new ApiException(409,"历史提案只能追溯，请重新生成");
    var operations=json.createArrayNode();var found=new HashSet<String>();for(var issue:stored.path("issues"))if(selected.contains(issue.path("id").asText())){require(issue.path("fixable").asBoolean(),"所选问题不能自动修复");found.add(issue.path("id").asText());for(var op:issue.path("fix"))operations.add(op);}
    require(found.equals(selected),"修复ID不在当前报告中");var doc=DiagramOperations.apply(proposal.path("config"),operations);var result=audit.decide(project,id,original,eligible,expectedHash);
    if("pending".equals(row.get("outcome"))){var record=json.createObjectNode().put("config_hash",AuditSanitizer.hash(doc));record.set("ids",json.valueToTree(selected));if(db.storeAcceptedFixes(project,id,record.toString())!=1)throw new ApiException(409,"提案决策已变化");}
    result.set("doc",doc);result.set("accepted_fixes",json.valueToTree(selected));result.put("final_config_hash",AuditSanitizer.hash(doc));return result;
  }
  @Transactional public void storeReview(long project,String id,ObjectNode report){
    report.put("review_hash",AuditSanitizer.hash(report));var record=json.createObjectNode();record.set("result",report);
    if(db.storeReview(project,id,record.toString())!=1)throw new ApiException(409,"提案已变化，无法绑定审稿");
  }
}
