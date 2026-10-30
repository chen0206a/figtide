package dev.labflow.review.rules;
import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
public class R8TextOverlap implements ReviewRule {
  public String id(){return "R8";}
  public static boolean overlaps(JsonNode a,JsonNode b){
    return a.path("x").asDouble()<b.path("x").asDouble()+b.path("width").asDouble()
        && b.path("x").asDouble()<a.path("x").asDouble()+a.path("width").asDouble()
        && a.path("y").asDouble()<b.path("y").asDouble()+b.path("height").asDouble()
        && b.path("y").asDouble()<a.path("y").asDouble()+a.path("height").asDouble();
  }
  public List<ReviewIssue> check(ReviewContext c){
    if(c.facts()==null)return List.of(); List<ReviewIssue> out=new ArrayList<>();var texts=c.facts().path("texts");
    double w=c.facts().path("canvas").path("width").asDouble(),h=c.facts().path("canvas").path("height").asDouble();
    for(int i=0;i<texts.size();i++){
      var a=texts.get(i).path("box");String label=texts.get(i).path("role").asText()+" #"+(i+1);
      if(a.path("x").asDouble()<0||a.path("y").asDouble()<0||a.path("x").asDouble()+a.path("width").asDouble()>w+.5||a.path("y").asDouble()+a.path("height").asDouble()>h+.5)
        out.add(issue(id(),"outside-"+i,"文字超出画布",label+" 的边界框超出画布。",List.of(),"text",i));
      for(int j=i+1;j<texts.size()&&out.size()<100;j++)if(overlaps(a,texts.get(j).path("box")))
        out.add(issue(id(),i+"-"+j,"文字边界框重叠",label+" 与 "+texts.get(j).path("role").asText()+" #"+(j+1)+" 重叠，请检查排版。",List.of(),"text",i));
    }return out;
  }
}
