package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import static dev.labflow.diagram.DiagramValidator.*;

/** Versioned, classpath-only plans. No model, workspace or filesystem capability. */
public final class DiagramSkills {
  private final Map<String,JsonNode> entries=new TreeMap<>();
  private final Map<String,String> plans=new TreeMap<>();
  private final Map<String,JsonNode> checks=new TreeMap<>();
  public DiagramSkills(ObjectMapper json){
    try{
      var resolver=new PathMatchingResourcePatternResolver();
      for(var resource:resolver.getResources("classpath*:diagram/skills/*/skill.json"))try(var in=resource.getInputStream()){
        var skill=json.readTree(in);
        fields(skill,"id version name description patterns templates recommended_styles allowed_nodes allowed_edges icon_tags checks","id version name description patterns templates recommended_styles allowed_nodes allowed_edges icon_tags checks");
        String id=text(skill.get("id"),64);require(id.matches("[a-z][a-z0-9-]{0,63}"),"skill ID无效");
        require(text(skill.get("version"),32).matches("[0-9]+\\.[0-9]+\\.[0-9]+"),"skill版本无效");
        require(entries.put(id,skill)==null,"skill ID重复");
        try(var planning=resource.createRelative("planning.md").getInputStream();var params=resource.createRelative("checks.json").getInputStream();var source=resource.createRelative("SOURCES.md").getInputStream()){
          String plan=new String(planning.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);require(!plan.isBlank()&&source.readAllBytes().length>0,"skill来源或规划为空");plans.put(id,plan);
          var c=json.readTree(params);fields(c,"require_zones max_depth max_nodes","require_zones max_depth max_nodes");require(c.path("require_zones").isBoolean(),"分区检查无效");number(c.get("max_depth"),1,40);number(c.get("max_nodes"),1,120);checks.put(id,c);
        }
      }
      require(entries.size()==6,"必须提供六个skill");
    }catch(java.io.IOException e){throw new IllegalStateException("skill资源不可读",e);}
  }
  public void validateReferences(DiagramCatalog catalog){
    var templates=new HashSet<String>();catalog.templates().forEach(t->templates.add(t.path("id").asText()));
    for(var skill:entries.values())for(String field:List.of("templates","recommended_styles","allowed_nodes","allowed_edges")){
      var list=skill.path(field);require(list.isArray()&&!list.isEmpty(),"skill引用不能为空");
      Set<String> allowed=switch(field){case "templates"->templates;case "recommended_styles"->PRESETS;case "allowed_nodes"->NODE_KINDS;default->EDGE_KINDS;};
      for(var value:list)choice(value,allowed);
    }
  }
  public List<JsonNode> all(){return entries.values().stream().<JsonNode>map(JsonNode::deepCopy).toList();}
  public JsonNode get(String id){var value=entries.get(id);require(value!=null,"未知skill");return value.deepCopy();}
  public String planning(String id){get(id);return plans.get(id);}
  public JsonNode checks(String id){get(id);return checks.get(id).deepCopy();}
}
