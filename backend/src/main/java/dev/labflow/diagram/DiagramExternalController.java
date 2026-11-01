package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static dev.labflow.diagram.DiagramValidator.*;

@RestController @RequestMapping("/api/projects/{p}/diagrams/{id}")
public class DiagramExternalController {
  private final DiagramService diagrams;private final DiagramCatalog catalog;private final ObjectMapper json;
  public DiagramExternalController(DiagramService diagrams,DiagramCatalog catalog,ObjectMapper json){this.diagrams=diagrams;this.catalog=catalog;this.json=json;}
  @GetMapping("/brief") Object brief(@PathVariable long p,@PathVariable long id){
    var record=diagrams.get(p,id);var doc=(JsonNode)record.get("doc");var out=json.createObjectNode().put("protocol_version",1).put("diagram_id",id).put("revision",((Number)record.get("revision")).intValue()).put("brief",doc.at("/meta/brief").asText());out.set("facts",doc.at("/meta/facts").deepCopy());out.set("fact_sources",doc.at("/meta/fact_sources").isArray()?doc.at("/meta/fact_sources").deepCopy():json.createArrayNode());out.set("canvas",doc.path("canvas").deepCopy());
    var spec=out.putObject("spec");for(String field:List.of("zones","nodes","edges")){var rows=spec.putArray(field);for(var node:doc.path(field)){var copy=(ObjectNode)node.deepCopy();copy.remove(List.of("x","y","w","h","style_ref"));rows.add(copy);}}
    var style=catalog.effective(doc);style.put("palette",doc.at("/style/palette").asText("okabe-ito"));style.set("role_outlines",json.valueToTree(catalog.paletteAudit(doc).get("outlines")));var widths=style.putObject("line_widths_pt");double line=style.path("line_width_pt").asDouble(),sketch=style.path("sketch").asBoolean()?1.3:1;widths.put("outline",line*sketch).put("connection",1.25*line*sketch).put("zone",.75*line).put("membrane",.5*line);out.set("style",style);out.put("icon_attribution",catalog.icons().attribution(doc));out.put("artwork_note","外部SVG作为整体图层，内部文字不能单独编辑；不要补造缺失的科学事实。");
    StringBuilder md=new StringBuilder("# FigTide 机制图简报\n\n");md.append(out.path("brief").asText().isBlank()?"尚未填写科学简报，请先向用户确认。":out.path("brief").asText()).append("\n\n## 用户事实\n");if(out.path("facts").isEmpty())md.append("尚无已确认事实列表；图中标签不等于已核实的科学证据。\n");for(var fact:out.path("facts"))md.append("- ").append(fact.asText()).append('\n');md.append("\n## 成品规格\n").append(doc.at("/canvas/width_mm").asDouble()).append(" × ").append(doc.at("/canvas/height_mm").asDouble()).append(" mm\n\n## 语义结构和风格参数\n```json\n").append(out.toPrettyString()).append("\n```\n\n外部绘制后调用import_diagram_svg；导入新增图层与版本，不覆盖已有图层。\n");
    return Map.of("json",out,"markdown",md.toString());
  }
  @PostMapping("/import-svg") @Transactional Object importSvg(@PathVariable long p,@PathVariable long id,@RequestBody JsonNode in){
    fields(in,"base_revision svg name","base_revision svg");var current=diagrams.get(p,id);var revision=in.path("base_revision");require(revision.isIntegralNumber()&&revision.canConvertToInt()&&revision.asInt()>0,"base_revision无效");if(revision.asInt()!=((Number)current.get("revision")).intValue())throw new ApiException(409,"机制图已被更新，请重新读取后再导入");
    String svg=SvgSanitizer.sanitize(text(in.path("svg"),MAX_BYTES));require(svg.matches("(?s).*<(path|rect|circle|ellipse|polygon|polyline|line|text|use)( |/|>).*"),"净化后的SVG没有可用矢量内容");var doc=(ObjectNode)((JsonNode)current.get("doc")).deepCopy();var layers=doc.has("artworks")?(ArrayNode)doc.path("artworks"):doc.putArray("artworks");require(layers.size()<30,"外部图层最多30个");var ids=new HashSet<String>();for(String field:List.of("nodes","zones","edges","annotations","artworks"))for(var item:doc.path(field))ids.add(item.path("id").asText());int n=1;while(ids.contains("artwork"+n))n++;
    String name=in.has("name")?text(in.path("name"),120):"外部SVG图层";require(!name.isBlank(),"图层名称不能为空");layers.addObject().put("id","artwork"+n).put("name",name).put("x",0).put("y",0).put("w",doc.at("/canvas/width_mm").asDouble()).put("h",doc.at("/canvas/height_mm").asDouble()).put("locked",false).put("hidden",false).put("svg",svg);return diagrams.save(p,id,revision.asInt(),doc);
  }
}
