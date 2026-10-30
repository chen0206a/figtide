package dev.labflow.agent.team;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.processing.ProcessingRules;
import dev.labflow.review.*;
import dev.labflow.service.*;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class TeamDraftService {
  private final ProcessingService processing;private final FigureToolService figures;private final ReviewEndpointService reviews;private final ObjectMapper json;
  public TeamDraftService(ProcessingService processing,FigureToolService figures,ReviewEndpointService reviews,ObjectMapper json){this.processing=processing;this.figures=figures;this.reviews=reviews;this.json=json;}
  public ProcessingRules rules(JsonNode args){
    RenderFacts.fields(args,Set.of("schema_version","mode","groupBy","metrics","filters","sort","missingGroup","error","observationUnit","replicate","x","group","display"),Set.of("schema_version","mode","groupBy","metrics","filters","sort","missingGroup","error","observationUnit","replicate","x","group","display"));
    try{var rules=json.treeToValue(args,ProcessingRules.class);rules.validate();return rules;}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw ApiException.bad("处理规则格式无效");}
  }
  public Map<String,Object> memory(long project,long source,JsonNode rules){return processing.memoryPreview(project,source,rules(rules));}
  public ObjectNode processing(long project,String run,ObjectNode snapshot,JsonNode rules,Map<String,Object> memory){
    return json.createObjectNode().put("source_dataset_version_id",snapshot.at("/config/datasetVersionId").asLong()).put("name","协作派生数据 "+run.substring(0,8)).put("preview_hash",memory.get("sha256").toString()).set("rules",rules.deepCopy());
  }
  public ObjectNode preview(long project,ObjectNode snapshot,ArrayNode operations,Map<String,Object> memory){
    if(memory==null){var body=snapshot.deepCopy();body.set("operations",operations);return json.valueToTree(figures.preview(project,body));}
    var baseline=(ObjectNode)snapshot.path("config").deepCopy();baseline.put("datasetVersionId","$derived");
    return json.valueToTree(figures.memoryPreview(project,snapshot,baseline,operations,memory));
  }
  public ObjectNode report(long project,ObjectNode snapshot,JsonNode config,JsonNode facts,JsonNode target,Map<String,Object> memory){
    Long chart=snapshot.path("chart_id").isIntegralNumber()?snapshot.path("chart_id").asLong():null;
    return memory==null?reviews.reviewConfig(project,config,facts,target,chart):reviews.reviewMemory(project,config,facts,target,chart,memory);
  }
  public ObjectNode metadata(Map<String,Object> memory){
    var data=json.valueToTree(memory);var out=json.createObjectNode();out.set("fields",data.path("fields"));out.set("row_count",data.path("row_count"));out.put("preview_hash",memory.get("sha256").toString());return out;
  }
  public ArrayNode processingTools(){
    var out=json.createArrayNode();var f=out.addObject().put("type","function").putObject("function");f.put("name","propose_processing").put("description","提交一份完整ProcessingRules，仅内存预览，用户确认后才创建派生数据。aggregate按groupBy统计，常见派生名为指标__mean/__sd/__sem，最终字段以成功返回的元数据为准；sort只过滤/排序并保留逐行字段，不汇总。不得编造观测单位或误差含义，不返回原始行。");
    var schema=f.putObject("parameters").put("type","object").put("additionalProperties",false);var props=schema.putObject("properties");var required=schema.putArray("required");
    for(String key:List.of("schema_version","mode","groupBy","metrics","filters","sort","missingGroup","error","observationUnit","replicate","x","group","display")){
      required.add(key);var property=props.putObject(key);
      if(key.equals("schema_version")){property.put("type","integer").put("const",1);}
      else if(Set.of("groupBy","metrics","filters","sort").contains(key)){
        property.put("type","array").put("maxItems",key.equals("filters")?8:key.equals("metrics")?5:4);var item=property.putObject("items");
        if(Set.of("groupBy","metrics").contains(key)){property.put("uniqueItems",true);item.put("type","string").put("minLength",1).put("maxLength",120);}
        else{item.put("type","object").put("additionalProperties",false);var inner=item.putObject("properties");var req=item.putArray("required");for(String name:key.equals("filters")?List.of("field","operator","value"):List.of("field","direction")){
          var value=inner.putObject(name).put("type","string");req.add(name);
          if(name.equals("field"))value.put("minLength",1).put("maxLength",120);
          else if(name.equals("operator"))values(value,"eq","gte","lte","missing");
          else if(name.equals("direction"))values(value,"asc","desc");
          else value.put("maxLength",500);
        }}
      }else property.put("type","string").put("maxLength",120);
      switch(key){
        case "mode"->{values(property,"aggregate","sort");property.put("description","aggregate用于分组统计；sort用于仅过滤/排序，保留逐行数据。不存在passthrough模式。");}
        case "groupBy"->property.put("description","aggregate的分组字段，来自原始字段摘要；不分组时[]。");
        case "metrics"->property.put("description","aggregate的数值指标字段，至少一个；sort可为[]。");
        case "filters"->property.put("description","显式过滤条件；没有过滤时[]。missing的value填空字符串。");
        case "sort"->property.put("description","排序字段和asc/desc；不排序时[]。使用源字段或实际生成的派生字段。");
        case "missingGroup"->{values(property,"include","exclude");property.put("description","include保留缺失分组，exclude排除缺失分组；不允许keep。");}
        case "error"->{values(property,"sd","sem","none");property.put("description","选择用户明确要求的SD或SEM用于误差区间；无需误差用none，不能猜误差含义。sort不生成统计误差。");}
        case "observationUnit"->property.put("description","aggregate必填非空，忠实保留用户说明的每行观测单位；sort未涉及统计时可用空字符串。不可编造独立性或翻译改写已明确的单位。");
        case "replicate"->property.put("description","已明确的重复标识字段，未提供时空字符串；不可凭字段名假设独立重复。");
        case "x"->property.put("description","明确的X字段；aggregate时必须属于groupBy，且band要求数值X。未指定时空字符串。");
        case "group"->property.put("description","明确的图形分组字段；aggregate时必须属于groupBy且不能与x相同。未指定时空字符串。");
        case "display"->{values(property,"bars","band");property.put("description","误差的显示形式：bars误差棒，band区间带；不填图型line或自然语言说明。");}
        default->{}
      }
    }
    return out;
  }
  private void values(ObjectNode property,String... options){var allowed=property.putArray("enum");for(String option:options)allowed.add(option);}

  /** Fixed feedback only: backend exception text may contain private data or arbitrary model input. */
  public ObjectNode processingValidationFailure(){
    var out=json.createObjectNode().put("ok",false).put("error","invalid_processing_rules")
        .put("message","规则或数据字段校验未通过，本次处理规则未被接受，未创建数据。请核对schema、字段摘要及用户明确的统计口径后更正参数；不能补造缺失信息。");
    out.set("expected_schema",processingTools().get(0).at("/function/parameters"));return out;
  }
}
