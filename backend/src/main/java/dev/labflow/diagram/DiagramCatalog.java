package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import dev.labflow.review.JournalRules;
import java.util.*;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import static dev.labflow.diagram.DiagramValidator.*;

/** Classpath resources are the single source for styles and built-in template skeletons. */
@Component
public class DiagramCatalog {
  private final List<JsonNode> styles;
  private final DiagramSkills skills;
  private final DiagramIcons icons;
  private final List<JsonNode> templates;
  private final List<JsonNode> glyphs;
  private final JournalRules journals;
  private final List<JsonNode> palettes;
  public DiagramCatalog(ObjectMapper json,JournalRules journals) {
    try(var in=getClass().getResourceAsStream("/diagram/palettes.json")){palettes=new ArrayList<>();for(var p:json.readTree(in))palettes.add(p);}catch(java.io.IOException e){throw new IllegalStateException(e);}
    this.journals=journals;this.skills=new DiagramSkills(json);this.icons=new DiagramIcons(json);var order=List.of("nature-flat","soft-illustration","line-minimal","conference-framework","isometric","sketch");styles=load(json,"styles").stream().sorted(Comparator.comparingInt(s->order.indexOf(s.path("id").asText()))).toList();templates=load(json,"templates");
    try(var in=getClass().getResourceAsStream("/diagram/glyphs.json")){var entries=json.readTree(in);require(entries.isArray(),"图元目录无效");var list=new ArrayList<JsonNode>();Set<String> glyphIds=new HashSet<>();for(var glyph:entries){fields(glyph,"id name category","id name category");require(glyphIds.add(choice(glyph.get("id"),GLYPHS)),"图元ID重复");text(glyph.get("name"),120);choice(glyph.get("category"),Set.of("biology","ml","experiment","markers"));list.add(glyph);}require(glyphIds.equals(GLYPHS),"图元目录不完整");glyphs=List.copyOf(list);}catch(java.io.IOException e){throw new IllegalStateException("图元目录不可读",e);}
    var ids=new HashSet<String>();
    for(var s:styles) {
      fields(s,"id name zone_colors accent_colors text_color line_color font_family font_size_pt line_width_pt radius_mm arrow fill shadow sketch iso","id name zone_colors accent_colors text_color line_color font_family font_size_pt line_width_pt radius_mm arrow fill shadow sketch iso");
      require(ids.add(choice(s.get("id"),PRESETS)),"风格ID重复");text(s.get("name"),120);
      var props=(ObjectNode)s.deepCopy();props.remove(List.of("id","name"));overrides(props);
    }
    require(ids.equals(PRESETS),"风格目录不完整");
    ids.clear();for(var t:templates) {
      fields(t,"id name pattern documents","id name pattern documents");require(ids.add(text(t.get("id"),120)),"模板ID重复");
      text(t.get("name"),120);choice(t.get("pattern"),Set.of("conceptual","framework","pipeline","architecture","taxonomy","teaser","mechanism","workflow","comparison"));
      fields(t.get("documents"),"en zh","en zh");for(String lang:List.of("en","zh")){validate(t.at("/documents/"+lang));require(t.at("/documents/"+lang+"/label_language").asText().equals(lang),"模板语言无效");}
    }
    skills.validateReferences(this);
  }
  public DiagramIcons icons(){return icons;}
  public DiagramSkills skills(){return skills;}
  private List<JsonNode> load(ObjectMapper json,String folder) {
    try {var resources=new PathMatchingResourcePatternResolver().getResources("classpath*:diagram/"+folder+"/*.json");Arrays.sort(resources,Comparator.comparing(r->Objects.requireNonNull(r.getFilename())));var result=new ArrayList<JsonNode>();for(var r:resources)try(var in=r.getInputStream()){result.add(json.readTree(in));}return List.copyOf(result);}
    catch(Exception e){throw new IllegalStateException("机制图目录不可读："+folder,e);}
  }
  public JsonNode style(String id) { for(var s:styles)if(s.path("id").asText().equals(id))return s.deepCopy();throw ApiException.bad("机制图：未知风格"); }
  public List<JsonNode> styles() { return styles.stream().<JsonNode>map(JsonNode::deepCopy).toList(); }
  public List<JsonNode> templates() { return templates.stream().<JsonNode>map(JsonNode::deepCopy).toList(); }
  public JsonNode template(String id,String language) { for(var t:templates)if(t.path("id").asText().equals(id))return t.at("/documents/"+language).deepCopy();throw ApiException.bad("机制图：未知模板"); }
  public ObjectNode effective(JsonNode doc) { var out=(ObjectNode)style(doc.at("/style/preset").asText());out.setAll((ObjectNode)doc.at("/style/overrides"));return out; }
  public Map<String,Object> paletteAudit(JsonNode doc){if(doc.at("/style/role_colors").isObject()){var colors=new LinkedHashMap<String,String>();for(String role:DiagramPaletteAudit.ROLES)if(DiagramPaletteAudit.usedRoles(doc).contains(role))colors.put(role,doc.at("/style/role_colors").path(role).asText());return DiagramPaletteAudit.auditOutlines("custom",doc.at("/style/preset").asText(),colors);}return DiagramPaletteAudit.audit(palettes.stream().filter(p->p.path("id").asText().equals(doc.at("/style/palette").asText("okabe-ito"))).findFirst().orElse(palettes.getFirst()),doc.at("/style/preset").asText(),DiagramPaletteAudit.usedRoles(doc));}
  public List<JsonNode> palettes(){return palettes.stream().<JsonNode>map(JsonNode::deepCopy).toList();}
  public List<Map<String,Object>> paletteAudits(){var result=new ArrayList<Map<String,Object>>();for(var p:palettes)for(var s:styles)result.add(DiagramPaletteAudit.audit(p,s.path("id").asText(),new HashSet<>(DiagramPaletteAudit.ROLES)));return result;}
  public Map<String,Object> all() { return Map.of("schema_version",1,"palette_audits",paletteAudits(),"palettes",palettes.stream().<JsonNode>map(JsonNode::deepCopy).toList(),"styles",styles(),"templates",templates(),"skills",skills.all(),"icons",icons.all(),"journals",journals.all(),"glyphs",glyphs.stream().<JsonNode>map(JsonNode::deepCopy).toList()); }
}
