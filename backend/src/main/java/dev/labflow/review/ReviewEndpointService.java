package dev.labflow.review;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.service.WorkspaceService;
import dev.labflow.service.FigureToolService;
import dev.labflow.service.ConfigValidator;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewEndpointService {
  private final WorkspaceService workspace; private final ReviewService review; private final ObjectMapper json; private final FigureToolService figures;
  public ReviewEndpointService(WorkspaceService workspace,ReviewService review,ObjectMapper json,FigureToolService figures){this.workspace=workspace;this.review=review;this.json=json;this.figures=figures;}
  private void validate(long project,JsonNode config){
    ConfigValidator.validate(config);
    workspace.data(project,config.path("datasetVersionId").asLong());
    var envelope=json.createObjectNode().put("protocol_version",1);envelope.set("config",config);
    var lint=figures.lint(project,envelope);
    if(!Boolean.TRUE.equals(lint.get("ok")))throw ApiException.bad("图表未通过现有 lint 校验");
  }
  @Transactional(readOnly=true)
  public ObjectNode request(long project,JsonNode request){
    RenderFacts.fields(request,Set.of("protocol_version","config","render_facts","target","chart_id"),Set.of("protocol_version","config"));
    if(!request.path("protocol_version").isIntegralNumber()||!request.path("protocol_version").canConvertToInt()||request.path("protocol_version").asInt()!=1)throw ApiException.bad("不支持的审稿协议");
    Long chart=null;if(request.hasNonNull("chart_id")){
      var id=request.path("chart_id");if(!id.isIntegralNumber()||!id.canConvertToLong()||id.asLong()<=0)throw ApiException.bad("图表标识无效");chart=id.asLong();
    }
    return reviewConfig(project,request.path("config"),request.path("render_facts"),request.path("target"),chart);
  }
  @Transactional(readOnly=true)
  public ObjectNode reviewConfig(long project,JsonNode config,JsonNode facts,JsonNode target,Long chart){
    return reviewResolved(project,config,facts,target,chart,null);
  }
  @Transactional(readOnly=true)
  public ObjectNode reviewMemory(long project,JsonNode config,JsonNode facts,JsonNode target,Long chart,Map<String,Object> memory){
    var numeric=(ObjectNode)config.deepCopy();numeric.put("datasetVersionId",((Number)memory.get("id")).longValue());
    return reviewResolved(project,numeric,facts,target,chart,memory);
  }
  private ObjectNode reviewResolved(long project,JsonNode config,JsonNode facts,JsonNode target,Long chart,Map<String,Object> memory){
    workspace.project(project);
    if(!config.isObject()||config.toString().length()>200000)throw ApiException.bad("需要合法图表配置");
    if(memory==null)validate(project,config);else figures.lintMemory(project,config,memory);
    if(chart!=null)workspace.chart(project,chart);
    var geometry=RenderFacts.validate(facts);RenderFacts.target(target);
    if(geometry!=null&&(geometry.path("canvas").path("width").asDouble()!=config.path("style").path("width").asDouble()
        ||geometry.path("canvas").path("height").asDouble()!=config.path("style").path("height").asDouble()))throw ApiException.bad("渲染信息与图表画布尺寸不一致");
    var data=json.valueToTree(memory==null?workspace.data(project,config.path("datasetVersionId").asLong()):memory);
    var meta=data.path("source_meta").isObject()?(ObjectNode)data.path("source_meta").deepCopy():json.createObjectNode();
    // Only counts reach the deterministic rule; group labels, samples and raw values never reach its report.
    Set<Integer> counts=new TreeSet<>(); boolean verified=true,used=false;
    String method=meta.path("rules").path("error").asText();
    for(var series:config.path("series"))if(series.path("visible").asBoolean()){
      String error=series.path("error").asText();boolean band=series.path("band").path("enabled").asBoolean();
      if(error.isBlank()&&!band)continue;used=true;boolean matched=false;
      for(var statistic:meta.path("statistics")){
        var columns=statistic.path("columns");
        boolean same=series.path("y").asText().equals(columns.path("mean").asText())
            && (error.isBlank()||error.equals(columns.path(method).asText()))
            && (!band||(series.path("band").path("lower").asText().equals(columns.path("lower").asText())
                &&series.path("band").path("upper").asText().equals(columns.path("upper").asText())));
        if(same){matched=true;for(var row:data.path("rows")){
          var n=row.path(columns.path("n").asText());if(n.isIntegralNumber()&&n.asInt()>=0)counts.add(n.asInt());
        }}
      }
      verified&=matched;
    }
    if(used&&verified&&Set.of("sd","sem").contains(method))meta.put("review_error_method",method);
    meta.set("review_group_n",json.valueToTree(counts));
    List<ReviewContext.OtherChart> others=new ArrayList<>();
    for(var row:workspace.charts(project)){
      long id=((Number)row.get("id")).longValue();if(chart!=null&&id==chart)continue;
      var other=json.valueToTree(workspace.chart(project,id));
      if(!other.path("config").equals(config))others.add(new ReviewContext.OtherChart(other.path("name").asText(),other.path("config")));
    }
    var result=review.review(config,geometry,target==null?json.createObjectNode():target,meta,others);
    // Each offered fix must also pass the same dataset-aware save/lint validation.
    for(var issue:result.path("issues"))if(issue.path("fixable").asBoolean())try{
      var fixed=dev.labflow.service.FigureOperations.apply(config,issue.path("fix"));if(memory==null)validate(project,fixed);else figures.lintMemory(project,fixed,memory);
    }catch(ApiException e){((ObjectNode)issue).put("fixable",false).set("fix",json.createArrayNode());}
    return result;
  }
}
