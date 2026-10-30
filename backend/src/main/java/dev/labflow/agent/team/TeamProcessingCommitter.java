package dev.labflow.agent.team;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.AuditSanitizer;
import dev.labflow.api.ApiException;
import dev.labflow.repository.AgentAuditRepository;
import dev.labflow.review.*;
import dev.labflow.service.ProcessingService;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** A separate committed transaction intentionally survives a later final-lint failure. */
@Service
public class TeamProcessingCommitter {
  private final AgentAuditRepository db;private final ProcessingService processing;private final TeamDraftService drafts;private final ObjectMapper json;
  public TeamProcessingCommitter(AgentAuditRepository db,ProcessingService processing,TeamDraftService drafts,ObjectMapper json){this.db=db;this.processing=processing;this.drafts=drafts;this.json=json;}
  @Transactional(propagation=Propagation.REQUIRES_NEW)
  public long create(long project,String id,JsonNode proposal,JsonNode request){
    RenderFacts.fields(request,Set.of("outcome","proposal_hash","accepted_fixes","review_hash"),Set.of("outcome","proposal_hash","accepted_fixes"));
    var row=db.lock(project,id);String hash=AuditSanitizer.hash(proposal.path("config"));
    if(!"accepted".equals(request.path("outcome").asText())||!hash.equals(row.get("proposal_hash"))||!hash.equals(request.path("proposal_hash").asText())||!"proposed".equals(row.get("status"))||!Set.of("pending","accepted").contains(row.get("outcome"))||db.hasActiveChild(project,id))throw new ApiException(409,"提案状态已变化，请重新生成");
    var report=ReviewJson.read(json,row.get("review_json")).path("result");
    if(!report.isObject())throw new ApiException(409,"请先完成提案审稿");
    if(request.has("review_hash")&&!request.path("review_hash").asText().equals(report.path("review_hash").asText()))throw new ApiException(409,"审稿报告已变化，请重新预览");
    var ids=request.path("accepted_fixes");if(!ids.isArray()||ids.size()>100)throw ApiException.bad("审稿修复列表无效");Set<String> selected=new HashSet<>();
    for(var value:ids){if(!value.isTextual()||!selected.add(value.asText()))throw ApiException.bad("审稿修复 ID 无效或重复");boolean found=false;for(var issue:report.path("issues"))if(issue.path("id").equals(value)&&issue.path("fixable").asBoolean())found=true;if(!found)throw new ApiException(409,"所选审稿修复已失效");}
    var record=ReviewJson.read(json,row.get("accepted_fixes_json"));
    if("accepted".equals(row.get("outcome"))){Set<String> prior=new HashSet<>();for(var value:record.path("ids"))prior.add(value.asText());if(!prior.equals(selected))throw new ApiException(409,"该提案已确认不同修复");}
    if(record.at("/processing_commit/dataset_version_id").isIntegralNumber())return record.at("/processing_commit/dataset_version_id").asLong();
    if(row.get("chart_id") instanceof Number chart&&db.chartRevision(project,chart.longValue())!=((Number)row.get("base_revision")).intValue())throw new ApiException(409,"源图表已更新，请重新生成");
    var block=proposal.path("processing");long source=block.path("source_dataset_version_id").asLong();
    if(source!=((Number)row.get("dataset_version_id")).longValue())throw new ApiException(409,"处理来源已变化");
    var memory=drafts.memory(project,source,block.path("rules"));if(!block.path("preview_hash").asText().equals(memory.get("sha256")))throw new ApiException(409,"派生数据预览已变化");
    var data=processing.commit(project,source,block.path("name").asText(),drafts.rules(block.path("rules")));long dataset=((Number)data.get("id")).longValue();
    var next=record.isObject()?(ObjectNode)record.deepCopy():json.createObjectNode();next.putObject("processing_commit").put("dataset_version_id",dataset).put("source_dataset_version_id",source).put("preview_hash",block.path("preview_hash").asText()).put("final_lint","pending");
    if(db.processingCommit(project,id,next.toString())!=1)throw new ApiException(409,"处理记录已变化");return dataset;
  }
  @Transactional(propagation=Propagation.REQUIRES_NEW)
  public JsonNode mark(long project,String id,String state){var row=db.lock(project,id);var record=(ObjectNode)ReviewJson.read(json,row.get("accepted_fixes_json"));((ObjectNode)record.path("processing_commit")).put("final_lint",state);if(db.processingCommit(project,id,record.toString())!=1)throw new ApiException(409,"处理记录已变化");return record.path("processing_commit").deepCopy();}
}
