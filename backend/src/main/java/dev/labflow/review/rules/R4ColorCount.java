package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
public class R4ColorCount implements ReviewRule {
  public String id(){return "R4";}
  public List<ReviewIssue> check(ReviewContext c){
    return c.config().path("series").size()>8?List.of(issue(id(),"count","序列过多", "超过 8 个序列，建议分面或合并；未自动改动数据或序列。",List.of(),"legend","legend")):List.of();
  }
}
