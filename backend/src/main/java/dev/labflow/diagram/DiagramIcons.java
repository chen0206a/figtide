package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;
import static dev.labflow.diagram.DiagramValidator.*;

/** Metadata and immutable classpath SVG only. No user paths or remote fetches. */
@Component
public class DiagramIcons {
  private final Map<String,JsonNode> entries=new LinkedHashMap<>();
  public DiagramIcons(ObjectMapper json){try(var in=getClass().getResourceAsStream("/diagram/icons/manifest.json")){for(var item:json.readTree(in)){
    String id=text(item.path("id"),64);require(BuiltinIconIds.IDS.contains(id)&&entries.put(id,item)==null,"图标清单ID无效或重复");require(Set.of("CC0-1.0","CC-BY-4.0").contains(item.path("license").asText()),"图标许可证不允许");require(!item.at("/name/zh").asText().isBlank()&&!item.at("/name/en").asText().isBlank()&&!item.path("author").asText().isBlank(),"图标来源或名称缺失");}
    require(entries.keySet().equals(BuiltinIconIds.IDS),"图标清单与验证器不同步");
  }catch(java.io.IOException e){throw new IllegalStateException("图标清单不可读",e);}}
  public List<JsonNode> all(){return entries.values().stream().<JsonNode>map(JsonNode::deepCopy).toList();}
  public String svg(String id){require(entries.containsKey(id),"未知图标");try(var in=getClass().getResourceAsStream("/diagram/icons/"+id+".svg")){return new String(in.readAllBytes(),StandardCharsets.UTF_8);}catch(java.io.IOException e){throw new IllegalStateException("内置图标不可读",e);}}
  public String attribution(JsonNode doc){var used=new TreeSet<String>();for(var node:doc.path("nodes"))if(node.path("icon").isTextual())used.add(node.path("icon").asText());var out=new StringBuilder();for(String id:used){var item=entries.get(id);if(item==null||!item.path("license").asText().equals("CC-BY-4.0"))continue;out.append(item.at("/name/en").asText()).append(" — ").append(item.path("author").asText()).append("; via Bioicons; CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); ").append(item.path("source_url").asText()).append("; modified: SVG sanitized, viewBox fitted, and palette recoloured.\n");}return out.toString();}
}
