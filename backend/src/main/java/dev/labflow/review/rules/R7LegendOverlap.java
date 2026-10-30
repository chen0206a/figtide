package dev.labflow.review.rules;
import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
public class R7LegendOverlap implements ReviewRule {
  public String id(){return "R7";}
  private static int count(JsonNode facts,double x,double y,double w,double h){
    int count=0;for(var p:facts.path("points"))if(p.path("x").asDouble()>=x&&p.path("x").asDouble()<=x+w&&p.path("y").asDouble()>=y&&p.path("y").asDouble()<=y+h)count++;
    return count;
  }
  public List<ReviewIssue> check(ReviewContext c){
    if(c.facts()==null||!c.config().path("legend").path("show").asBoolean()||!c.facts().has("legend"))return List.of();
    var l=c.facts().path("legend"); double w=l.path("width").asDouble(),h=l.path("height").asDouble();
    int overlap=count(c.facts(),l.path("x").asDouble(),l.path("y").asDouble(),w,h);if(overlap==0)return List.of();
    var p=c.facts().path("plot"); double x=p.path("x").asDouble(),y=p.path("y").asDouble(),pw=p.path("width").asDouble(),ph=p.path("height").asDouble();
    String best="";int minimum=Integer.MAX_VALUE;
    if(w<=pw&&h<=ph)for(String position:List.of("top-left","top-right","bottom-left","bottom-right")){
      double cx=position.endsWith("left")?x:x+pw-w,cy=position.startsWith("top")?y:y+ph-h;
      int n=count(c.facts(),cx,cy,w,h);if(n<minimum){minimum=n;best=position;}
    }
    var fix=minimum==0?List.of(operation("set_legend","position",best)):List.<Map<String,Object>>of();
    return List.of(issue(id(),"legend","图例遮挡数据点", "图例边界框与 "+overlap+" 个抽样点重叠。"+(minimum==0?"建议移至无重叠的角落。":"四角均有重叠或图例过大，请手动调整。"),fix,"legend","legend"));
  }
}
