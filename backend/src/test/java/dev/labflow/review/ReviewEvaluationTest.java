package dev.labflow.review;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.AuditSanitizer;
import dev.labflow.service.FigureOperations;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class ReviewEvaluationTest {
  @Test void evaluateFortyAuthoredChartsAndWriteMeasuredRuleMetrics() throws Exception {
    var json=new ObjectMapper();var review=new ReviewService(new JournalRules(json),json);
    var suite=json.readTree(getClass().getResourceAsStream("/agent-eval/review-suite-v1.json"));assertTrue(suite.path("synthetic").asBoolean());assertEquals(40,suite.path("cases").size());
    var report=json.createObjectNode().put("suite_version",suite.path("suite_version").asText()).put("suite_hash",AuditSanitizer.hash(suite)).put("paid_model_calls",0).put("geometry_scope",suite.path("geometry_note").asText());
    var rows=report.putArray("cases");Map<String,int[]> counts=new TreeMap<>();int repairable=0,repaired=0;Set<String> unique=new HashSet<>();
    for(var item:suite.path("cases")){
      assertTrue(unique.add(item.path("id").asText()));var facts=RenderFacts.validate(item.path("render_facts"));RenderFacts.validate(item.path("after_fix_render_facts"));
      List<ReviewContext.OtherChart> others=new ArrayList<>();for(var other:item.path("other_charts"))others.add(new ReviewContext.OtherChart(other.path("name").asText(),other.path("config")));
      var result=review.review(item.path("config"),facts,item.path("target"),item.path("source_meta"),others);
      Set<String> expected=new TreeSet<>(),actual=new TreeSet<>();item.path("expected_rules").forEach(value->expected.add(value.asText()));result.path("issues").forEach(issue->actual.add(issue.path("rule").asText()));assertTrue(expected.size()>=1&&expected.size()<=3);
      for(int n=1;n<=10;n++){String rule="R"+n;var count=counts.computeIfAbsent(rule,k->new int[3]);if(expected.contains(rule)&&actual.contains(rule))count[0]++;else if(actual.contains(rule))count[1]++;else if(expected.contains(rule))count[2]++;}
      var operations=json.createArrayNode();Set<String> fixable=new HashSet<>();for(var issue:result.path("issues"))if(issue.path("fixable").asBoolean()){fixable.add(issue.path("id").asText());for(var op:issue.path("fix"))operations.add(op);}
      JsonNode fixed=operations.isEmpty()?item.path("config"):FigureOperations.apply(item.path("config"),operations);
      var after=review.review(fixed,item.path("after_fix_render_facts"),item.path("target"),item.path("source_meta"),others);Set<String> remaining=new HashSet<>();after.path("issues").forEach(issue->remaining.add(issue.path("id").asText()));
      int cleared=0;for(String id:fixable)if(!remaining.contains(id))cleared++;repairable+=fixable.size();repaired+=cleared;
      var row=rows.addObject().put("id",item.path("id").asText()).put("fixable",fixable.size()).put("fixed_issues_cleared",cleared);row.set("expected_rules",json.valueToTree(expected));row.set("actual_rules",json.valueToTree(actual));row.set("remaining_issue_ids",json.valueToTree(remaining));
    }
    int tp=0,fp=0,fn=0;var perRule=report.putObject("per_rule");for(var entry:counts.entrySet()){var c=entry.getValue();tp+=c[0];fp+=c[1];fn+=c[2];perRule.putObject(entry.getKey()).put("true_positive",c[0]).put("false_positive",c[1]).put("false_negative",c[2]).put("precision",c[0]+c[1]==0?1:(double)c[0]/(c[0]+c[1])).put("recall",c[0]+c[2]==0?1:(double)c[0]/(c[0]+c[2]));}
    report.putObject("summary").put("charts",40).put("true_positive",tp).put("false_positive",fp).put("false_negative",fn).put("precision",(double)tp/(tp+fp)).put("recall",(double)tp/(tp+fn)).put("fixable_issues",repairable).put("fixed_issues_cleared",repaired).put("repair_pass_rate",repairable==0?1:(double)repaired/repairable);
    Path output=Path.of("target/agent-eval/review/report.json");Files.createDirectories(output.getParent());json.writerWithDefaultPrettyPrinter().writeValue(output.toFile(),report);
    assertEquals(0,fp,"Measured false positives; see "+output);assertEquals(0,fn,"Measured false negatives; see "+output);assertTrue(repairable>0);assertEquals(repairable,repaired,"Re-review must actually clear each offered repair in the authored post-fix geometry");
  }
}
