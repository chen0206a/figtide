package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
public class R9AxisMarking implements ReviewRule {
  public String id(){return "R9";}
  public List<ReviewIssue> check(ReviewContext c){
    List<ReviewIssue> out=new ArrayList<>();
    for(String axis:List.of("x","y")){
      String title=ReviewContext.axisTitle(c.config(),axis).toLowerCase(Locale.ROOT);
      if(c.config().path("axes").path(axis).path("log").asBoolean()&&!title.contains("log")&&!title.contains("对数"))
        out.add(issue(id(),"log-"+axis,"对数坐标轴未标示",axis.toUpperCase()+" 轴启用了对数刻度，请在轴标题明确说明。",List.of(),"axis",axis));
    }return out;
  }
}
