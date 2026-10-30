package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
public class R10ProjectColors implements ReviewRule {
  public String id(){return "R10";}
  public List<ReviewIssue> check(ReviewContext c){
    List<ReviewIssue> out=new ArrayList<>();
    for(var s:c.series()){
      String name=s.path("name").asText();if(name.isBlank())continue;
      Set<String> different=new TreeSet<>();
      for(var other:c.otherCharts())for(var candidate:other.config().path("series"))
        if(candidate.path("name").asText().equals(name)&&!candidate.path("color").asText().equalsIgnoreCase(s.path("color").asText()))different.add(other.name());
      if(!different.isEmpty())out.add(issue(id(),s.path("id").asText(),"项目内同名序列配色不一致","与图表「"+String.join("」「",different)+"」的同名序列颜色不同，请确认是否需要统一。",List.of(),"series",s.path("id").asText()));
    }return out;
  }
}
