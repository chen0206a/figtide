package dev.labflow.review.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.diagram.*;
import dev.labflow.review.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Deterministic diagram review using the existing journal and colour-vision implementations. */
@Service
public class DiagramReviewService {
  public static final int MAX_CROSSINGS=6;
  public static final double MIN_ARROW_GAP_MM=1.5,MIN_SHARED_SEGMENT_MM=2,EPS=.15;
  private final ObjectMapper json;private final DiagramCatalog catalog;private final JournalRules journals;
  public DiagramReviewService(ObjectMapper json,DiagramCatalog catalog,JournalRules journals){this.json=json;this.catalog=catalog;this.journals=journals;}
  private ReviewIssue issue(String rule,String key,String severity,String title,String detail,List<Map<String,Object>> fix,String kind,int index){return new ReviewIssue(rule+":"+key,rule,severity,title,detail,!fix.isEmpty(),fix,Map.of("kind",kind,"ref",index));}
  private static List<Map<String,Object>> op(String tool,Object... args){return List.of(ReviewIssue.operation(tool,args));}
  private static double n(JsonNode v,String key){return v.path(key).asDouble();}
  private static boolean contains(JsonNode outer,JsonNode inner){return n(inner,"x")>=n(outer,"x")-EPS&&n(inner,"y")>=n(outer,"y")-EPS&&n(inner,"x")+n(inner,"w")<=n(outer,"x")+n(outer,"w")+EPS&&n(inner,"y")+n(inner,"h")<=n(outer,"y")+n(outer,"h")+EPS;}
  private static boolean overlap(JsonNode a,JsonNode b){return Math.min(n(a,"x")+n(a,"w"),n(b,"x")+n(b,"w"))-Math.max(n(a,"x"),n(b,"x"))>EPS&&Math.min(n(a,"y")+n(a,"h"),n(b,"y")+n(b,"h"))-Math.max(n(a,"y"),n(b,"y"))>EPS;}
  private ObjectNode box(double x,double y,double w,double h){return json.createObjectNode().put("x",x).put("y",y).put("w",w).put("h",h);}
  private static double cross(JsonNode a,JsonNode b,JsonNode c){return (b.get(0).asDouble()-a.get(0).asDouble())*(c.get(1).asDouble()-a.get(1).asDouble())-(b.get(1).asDouble()-a.get(1).asDouble())*(c.get(0).asDouble()-a.get(0).asDouble());}
  private static boolean crosses(JsonNode a,JsonNode b,JsonNode c,JsonNode d){return cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;}
  private static boolean shared(JsonNode a,JsonNode b,JsonNode c,JsonNode d){if(Math.abs(cross(a,b,c))>1e-6||Math.abs(cross(a,b,d))>1e-6)return false;int axis=Math.abs(a.get(0).asDouble()-b.get(0).asDouble())>=Math.abs(a.get(1).asDouble()-b.get(1).asDouble())?0:1;return Math.min(Math.max(a.get(axis).asDouble(),b.get(axis).asDouble()),Math.max(c.get(axis).asDouble(),d.get(axis).asDouble()))-Math.max(Math.min(a.get(axis).asDouble(),b.get(axis).asDouble()),Math.min(c.get(axis).asDouble(),d.get(axis).asDouble()))>MIN_SHARED_SEGMENT_MM;}
  private static boolean hits(JsonNode a,JsonNode b,JsonNode rect){double lo=0,hi=1;for(int axis=0;axis<2;axis++){double start=a.get(axis).asDouble(),delta=b.get(axis).asDouble()-start,min=n(rect,axis==0?"x":"y")+.05,max=min+n(rect,axis==0?"w":"h")-.1;if(max<=min)return false;if(Math.abs(delta)<1e-10){if(start<=min||start>=max)return false;}else{double t1=(min-start)/delta,t2=(max-start)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}}return hi>lo&&hi>0&&lo<1;}
  private List<Map<String,Object>> reroute(JsonNode doc,int index){var edge=doc.path("edges").get(index);return edge.path("route").asText().equals("orthogonal")?List.of():op("update_edge","id",edge.path("id").asText(),"route","orthogonal");}
  public ObjectNode review(JsonNode doc,JsonNode rawFacts,JsonNode target){
    DiagramValidator.validate(doc);RenderFacts.target(target);JsonNode facts=DiagramRenderFacts.validate(rawFacts,doc);String journal=target.path("journal").asText("default");var rule=journals.get(journal);var style=catalog.effective(doc);
    double scale=target.path("width_mm").isNumber()?target.path("width_mm").asDouble()/doc.at("/canvas/width_mm").asDouble():1;
    double minFont=rule.path("min_font_pt").isNumber()?rule.path("min_font_pt").asDouble():6,minLine=rule.path("min_line_pt").isNumber()?rule.path("min_line_pt").asDouble():.5;
    List<ReviewIssue> issues=new ArrayList<>();var skipped=json.createArrayNode();double font=style.path("font_size_pt").asDouble();if(facts!=null)for(var text:facts.path("texts"))font=Math.min(font,text.path("font_pt").asDouble());
    if(font*scale<minFont-1e-3)issues.add(issue("D1","font","error","成品文字字号太小","成品最小字号为 "+String.format(Locale.ROOT,"%.2f",font*scale)+" pt，要求至少 "+minFont+" pt。",minFont/scale<=72?op("set_style","overrides",Map.of("font_size_pt",minFont/scale)):List.of(),"canvas",0));
    if(style.path("line_width_pt").asDouble()*scale<minLine-1e-6)issues.add(issue("D2","line","error","成品线宽太细","成品线宽要求至少 "+minLine+" pt。",minLine/scale<=12?op("set_style","overrides",Map.of("line_width_pt",minLine/scale)):List.of(),"canvas",0));
    boolean paletteBad=false;for(String field:List.of("zone_colors","accent_colors")){var colors=style.path(field);for(int i=0;i<colors.size();i++)for(int j=0;j<i;j++)if(!colors.get(i).equals(colors.get(j))&&ColorVision.minimum(colors.get(i).asText(),colors.get(j).asText())<ColorVision.MIN_DELTA_E)paletteBad=true;}
    if(paletteBad){var safe=catalog.style("nature-flat");issues.add(issue("D3","palette","warning","部分配色在色觉缺陷下难区分","分区/角色编码色需要在三种色觉缺陷下保持可分辨；请同时保留标签与形状编码。",op("set_style","overrides",Map.of("zone_colors",safe.path("zone_colors"),"accent_colors",doc.at("/style/preset").asText().equals("line-minimal")||doc.at("/style/preset").asText().equals("sketch")?json.createArrayNode().add(safe.path("accent_colors").get(0)):safe.path("accent_colors"))),"canvas",0));}
    if(facts==null){for(String id:List.of("D4","D5"))skipped.addObject().put("rule",id).put("status","skipped").put("reason","需要同一渲染器采集的完整几何信息");}
    else {
      var canvas=box(0,0,doc.at("/canvas/width_mm").asDouble(),doc.at("/canvas/height_mm").asDouble());var texts=facts.path("texts");
      for(int i=0;i<texts.size();i++){var text=texts.get(i);var bounds=text.path("box");if(n(bounds,"w")==0||n(bounds,"h")==0)continue;
        if(!contains(canvas,bounds)||!contains(text.path("container"),bounds)){List<Map<String,Object>> fix=List.of();int index=text.path("owner_index").asInt();String kind=text.path("owner_kind").asText();if(kind.equals("node")){var node=doc.path("nodes").get(index);double w=n(node,"w")+Math.max(0,n(bounds,"w")-n(text.path("container"),"w"))+2,h=n(node,"h")+Math.max(0,n(bounds,"h")-n(text.path("container"),"h"))*3+2;fix=op("update_node","id",node.path("id").asText(),"w",w,"h",h);}
          issues.add(issue("D4","clip-"+i,"error","文字超出预留区域或画布","请放大节点或调整位置；外侧标签按其预留文字区检查。",fix,kind.equals("node")?"node":"canvas",kind.equals("node")?index:0));}
        for(int j=0;j<i;j++)if(overlap(bounds,texts.get(j).path("box")))issues.add(issue("D4","overlap-"+j+"-"+i,"warning","文字之间重叠","请移动元素或调整标签位置，避免标签互相遮挡。",List.of(),text.path("owner_kind").asText().equals("node")?"node":"canvas",text.path("owner_kind").asText().equals("node")?text.path("owner_index").asInt():0));
      }
      int crossings=0;var edges=facts.path("edges");
      for(int i=0;i<edges.size();i++){var e=edges.get(i);int index=e.path("index").asInt();var edge=doc.path("edges").get(index);boolean obstructed=false;for(var node:facts.path("nodes")){String id=doc.path("nodes").get(node.path("index").asInt()).path("id").asText();if(id.equals(edge.path("from").asText())||id.equals(edge.path("to").asText()))continue;for(int p=1;p<e.path("points").size();p++)if(hits(e.path("points").get(p-1),e.path("points").get(p),node.path("box")))obstructed=true;}
        if(obstructed)issues.add(issue("D5","node-"+index,"warning","连线穿过无关节点","可尝试直角走线；预览后仍需检查是否消除歧义。",reroute(doc,index),"edge",index));
        for(int j=0;j<i;j++){var other=edges.get(j);boolean shares=false;for(int a=1;a<e.path("points").size();a++)for(int b=1;b<other.path("points").size();b++){var p=e.path("points");var q=other.path("points");shares|=shared(p.get(a-1),p.get(a),q.get(b-1),q.get(b));if(crosses(p.get(a-1),p.get(a),q.get(b-1),q.get(b)))crossings++;}
          if(shares)issues.add(issue("D5","shared-"+j+"-"+i,"warning","两条连线有重叠段","共享走线超过 "+MIN_SHARED_SEGMENT_MM+" mm，需明确各自路径。",reroute(doc,index),"edge",index));
          if(Math.hypot(n(e.path("arrow"),"x")-n(other.path("arrow"),"x"),n(e.path("arrow"),"y")-n(other.path("arrow"),"y"))<MIN_ARROW_GAP_MM)issues.add(issue("D5","arrows-"+j+"-"+i,"warning","箭头挤在一起","箭头间距小于 "+MIN_ARROW_GAP_MM+" mm，请调整走线或节点。",List.of(),"edge",index));
        }
      }
      if(crossings>MAX_CROSSINGS)issues.add(issue("D5","crossings","warning","连线交叉过多","检测到 "+crossings+" 次交叉，阈值为 "+MAX_CROSSINGS+"；请分组或调整路径。",List.of(),"canvas",0));
    }
    Set<String> kinds=new HashSet<>();for(var e:doc.path("edges"))kinds.add(e.path("kind").asText());if(kinds.size()>=2&&doc.at("/legend/mode").asText().equals("off"))issues.add(issue("D6","legend","warning","多种连线缺少图例","当前至少有两种连线语义，建议启用自动图例。",op("set_legend","mode","auto"),"canvas",0));
    String template=doc.at("/meta/template").asText();boolean flow=false;for(var t:catalog.templates())if(t.path("id").asText().equals(template)&&Set.of("pipeline","workflow","architecture","framework").contains(t.path("pattern").asText()))flow=true;
    if(flow)for(int i=0;i<doc.path("nodes").size();i++){var node=doc.path("nodes").get(i);if(node.path("role").asText().equals("note")||node.path("kind").asText().equals("text"))continue;boolean linked=false;for(var e:doc.path("edges"))linked|=e.path("from").equals(node.path("id"))||e.path("to").equals(node.path("id"));if(!linked)issues.add(issue("D7","isolated-"+i,"warning","流程中有孤立节点","请确认该节点应连接到哪一步；审稿不会猜测或添加关系。",List.of(),"node",i));}
    List<ReviewIssue> checked=new ArrayList<>();for(var issue:issues){if(issue.fixable())try{if(DiagramOperations.changes(doc,DiagramOperations.apply(doc,json.valueToTree(issue.fix()))).isEmpty())issue=issue.advice(" 当前修复没有变化，请手动检查。");}catch(dev.labflow.api.ApiException e){issue=issue.advice(" 当前区域无法安全放大或调整，请手动修改。");}checked.add(issue);}
    checked.sort(Comparator.comparingInt((ReviewIssue i)->i.severity().equals("error")?0:1).thenComparingInt(i->Integer.parseInt(i.rule().substring(1))).thenComparing(ReviewIssue::id));var passed=json.createArrayNode();for(int i=1;i<=7;i++){String id="D"+i;if(facts==null&&(i==4||i==5))continue;if(checked.stream().noneMatch(issue->issue.rule().equals(id)))passed.add(id);}
    for(String id:List.of("D8","D9"))skipped.addObject().put("rule",id).put("status","skipped").put("reason",id.equals("D8")?"AI来源追溯在19-B启用":"外部图标署名在19-C启用");
    var result=json.createObjectNode().put("protocol_version",1).put("rules_version","diagram-review-v1").put("journal",journal);result.set("issues",json.valueToTree(checked));result.set("passed",passed);result.set("skipped",skipped);return result;
  }
}
