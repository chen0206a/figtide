package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import java.util.regex.Pattern;
import static dev.labflow.review.ReviewIssue.*;
public class R6ErrorMeaning implements ReviewRule {
  public String id(){return "R6";}
  public List<ReviewIssue> check(ReviewContext c){
    boolean errors=c.series().stream().anyMatch(s->!s.path("error").asText().isBlank() || s.path("band").path("enabled").asBoolean());
    if(!errors)return List.of();
    String method=c.sourceMeta().path("review_error_method").asText();
    String title=c.config().path("style").path("title").asText();
    if(c.sourceMeta().path("kind").asText().equals("data_processing")&&Set.of("sd","sem").contains(method)){
      String label=method.toUpperCase(Locale.ROOT);
      boolean stated=Pattern.compile("(?i)(?<![a-z])"+label+"(?![a-z])").matcher(title).find()
          || title.contains(method.equals("sd")?"标准差":"标准误");
      Set<Integer> counts=new TreeSet<>();for(var count:c.sourceMeta().path("review_group_n"))counts.add(count.asInt());
      var match=Pattern.compile("(?i)(?<![a-z])n\\s*[=:：＝]\\s*(\\d+)").matcher(title);
      boolean n=counts.size()==1&&match.find()&&new java.math.BigInteger(match.group(1)).equals(java.math.BigInteger.valueOf(counts.iterator().next()));
      if(stated&&n)return List.of();
      // The current schema has no caption field. Do not silently overwrite the user's title.
      return List.of(issue(id(),"derived","请说明误差口径和分组样本量", "处理规则记录为 "+label+"。建议在论文图注注明 mean ± "+label+"，n 为各组各指标有效观测数"+(counts.isEmpty()?"（从派生数据的 n 列读取）":"（本图对应有效 n："+counts+"）")+"，可能不同。当前配置没有图注字段，请在论文中补充。",List.of(),"title","title"));
    }
    return List.of(issue(id(),"unknown","原始误差列的统计口径未知","请确认误差代表 SD、SEM、CI 还是其他定义，并说明 n；不会根据列名猜测统计含义。",List.of(),"title","title"));
  }
}
