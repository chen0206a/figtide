package dev.labflow.diagram;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.labflow.review.JournalRules;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DiagramSkillsTest {
  @Test void allReferencesVersionsSourcesAndIndependentPlanningAreVerified()throws Exception{
    var json=new ObjectMapper();var catalog=new DiagramCatalog(json,new JournalRules(json));var skills=catalog.skills();
    assertEquals(6,skills.all().size());skills.validateReferences(catalog);
    String upstream;try(var in=getClass().getResourceAsStream("/diagram-upstream/schematic-figure-principles.md")){upstream=new String(in.readAllBytes(),StandardCharsets.UTF_8);}
    Set<String> excerpts=new HashSet<>();for(int i=0;i+40<=upstream.length();i++)excerpts.add(upstream.substring(i,i+40));
    for(var skill:skills.all()){
      String id=skill.path("id").asText(),plan=skills.planning(id);assertTrue(plan.contains("不指定位置"));assertTrue(plan.contains("用户明确确认"));
      assertTrue(skill.path("version").asText().matches("[0-9]+\\.[0-9]+\\.[0-9]+"));
      try(var in=getClass().getResourceAsStream("/diagram/skills/"+id+"/SOURCES.md")){String source=new String(in.readAllBytes(),StandardCharsets.UTF_8);assertTrue(source.contains("09d8b6e98d04b91de6e8b6632b3356b9fc237417"));assertTrue(source.contains("MIT"));}
      for(int i=0;i+40<=plan.length();i++)assertFalse(excerpts.contains(plan.substring(i,i+40)),"连续40字符重复："+id);
      assertTrue(skills.checks(id).path("max_nodes").asInt()<=120);
    }
    var copy=skills.get("workflow");((com.fasterxml.jackson.databind.node.ObjectNode)copy).put("version","99.0.0");assertEquals("1.0.1",skills.get("workflow").path("version").asText());
  }
}
