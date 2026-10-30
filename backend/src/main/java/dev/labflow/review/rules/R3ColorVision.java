package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;
public class R3ColorVision implements ReviewRule {
  public String id(){return "R3";}
  public List<ReviewIssue> check(ReviewContext c){
    if(Set.of("heatmap","confusion").contains(c.config().path("type").asText()))return List.of();
    var series=c.series(); double min=Double.POSITIVE_INFINITY;
    for(int i=0;i<series.size();i++)for(int j=i+1;j<series.size();j++)
      min=Math.min(min,ColorVision.minimum(series.get(i).path("color").asText(),series.get(j).path("color").asText()));
    if(min>=ColorVision.MIN_DELTA_E)return List.of();
    List<Map<String,Object>> fix=new ArrayList<>();
    if(series.size()<=8)for(int i=0;i<series.size();i++)
      fix.add(operation("set_series","seriesId",series.get(i).path("id").asText(),"color",ColorVision.OKABE_ITO[i]));
    return List.of(issue(id(),"palette","色觉模拟下颜色接近",String.format(Locale.ROOT,"红/绿/蓝色盲严重度 1.0 模拟的最小 CIEDE2000 色差 %.2f < 20。建议同时使用线型或点形；Okabe–Ito 也不保证任意两色均达到阈值。",min),fix,"series",series.getFirst().path("id").asText()));
  }
}
