package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
/** Presence only. Scientific meaning and unit judgments are reserved for 18-B. */
public class R5AxisTitles implements ReviewRule {
  public String id(){return "R5";}
  public List<ReviewIssue> check(ReviewContext c){
    List<ReviewIssue> issues=new ArrayList<>();
    for(String axis:List.of("x","y"))if(ReviewContext.axisTitle(c.config(),axis).isBlank())
      issues.add(issue(id(),"empty-"+axis,"坐标轴标题为空",axis.toUpperCase()+" 轴没有显式标题，请补充物理量及单位；本地检查不推断单位。",List.of(),"axis",axis));
    return issues;
  }
}
