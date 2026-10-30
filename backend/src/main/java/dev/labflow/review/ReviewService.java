package dev.labflow.review;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.review.rules.*;
import dev.labflow.service.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Deterministic, no database or model I/O. Caller supplies project-local immutable context. */
@Service
public class ReviewService {
  private final JournalRules journals;
  private final ObjectMapper json;
  private final List<ReviewRule> rules=List.of(new R1FontSize(),new R2LineWidth(),new R3ColorVision(),
      new R4ColorCount(),new R5AxisTitles(),new R6ErrorMeaning(),new R7LegendOverlap(),new R8TextOverlap(),
      new R9AxisMarking(),new R10ProjectColors());
  public ReviewService(JournalRules journals,ObjectMapper json){this.journals=journals;this.json=json;}
  public ObjectNode review(JsonNode config,JsonNode facts,JsonNode target,JsonNode meta,List<ReviewContext.OtherChart> others){
    ConfigValidator.validate(config);
    String journal=target.path("journal").asText(config.path("publication").path("journal").asText("default"));
    var rule=journals.get(journal);
    double width=config.path("publication").path("enabled").asBoolean()
        ? config.path("publication").path("widthMm").asDouble()
        : target.path("width_mm").asDouble(rule.path("single_column_mm").isNumber()?rule.path("single_column_mm").asDouble():88);
    if(!Double.isFinite(width)||width<40||width>300)throw ApiException.bad("成品宽度无效");
    var ctx=new ReviewContext(config,facts,rule,width,meta==null?json.createObjectNode():meta,others);
    List<ReviewIssue> issues=new ArrayList<>();List<String> passed=new ArrayList<>();var skipped=json.createArrayNode();
    for(var check:rules){
      if(facts==null&&Set.of("R7","R8").contains(check.id())){
        skipped.addObject().put("rule",check.id()).put("status","skipped").put("reason","需要编辑器中的渲染信息");continue;
      }
      var found=check.check(ctx);if(found.isEmpty())passed.add(check.id());
      for(var issue:found){
        if(issue.fixable())try{
          var fixed=FigureOperations.apply(config,json.valueToTree(issue.fix()));
          ConfigValidator.validate(fixed);
          if(FigureOperations.changes(config,fixed).isEmpty())issue=issue.advice(" 建议的修复已在使用，请手动检查其他编码。");
        }catch(ApiException e){issue=issue.advice(" 现有绘图工具无法在当前配置范围内完成修复，请手动调整。");}
        issues.add(issue);
      }
    }
    issues.sort(Comparator.comparingInt((ReviewIssue i)->switch(i.severity()){case "error"->0;case "warning"->1;default->2;})
        .thenComparingInt(i->Integer.parseInt(i.rule().substring(1))).thenComparing(ReviewIssue::id));
    var result=json.createObjectNode().put("protocol_version",1).put("rules_version","review-v1").put("journal",journal);
    result.set("issues",json.valueToTree(issues));result.set("passed",json.valueToTree(passed));result.set("skipped",skipped);
    return result;
  }
}
