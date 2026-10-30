package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
public class R2LineWidth implements ReviewRule {
  public String id(){return "R2";}
  public List<ReviewIssue> check(ReviewContext c){
    if(!Set.of("line","roc","pr","ecdf","box","violin").contains(c.config().path("type").asText()))return List.of();
    List<ReviewIssue> out=new ArrayList<>();
    for(var s:c.series())if(c.points(s.path("width").asDouble())+1e-6<c.minLine())
      out.add(issue(id(),s.path("id").asText(),"序列线宽太细",String.format(Locale.ROOT,"成品线宽 %.2f pt，低于 %.2f pt。",c.points(s.path("width").asDouble()),c.minLine()),List.of(operation("set_series","seriesId",s.path("id").asText(),"width",Math.ceil(c.pixels(c.minLine())*100)/100)),"series",s.path("id").asText()));
    return out;
  }
}
