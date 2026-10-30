package dev.labflow.diagram;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.review.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DiagramCatalogTest {
  final ObjectMapper json=new ObjectMapper();
  final DiagramCatalog catalog=new DiagramCatalog(json,new JournalRules(json));
  @Test void sixCompletePresetsAreSafeUnderAllThreeDeficiencies() {
    assertEquals(6,catalog.styles().size());
    for(var s:catalog.styles())for(String field:new String[]{"zone_colors","accent_colors"}) {
      var colors=s.path(field);assertTrue(colors.size()<= (field.equals("zone_colors")?6:3));
      for(int i=0;i<colors.size();i++)for(int j=0;j<i;j++)for(int deficiency=0;deficiency<3;deficiency++)assertTrue(
          ColorVision.deltaE(ColorVision.lab(colors.get(i).asText(),deficiency),ColorVision.lab(colors.get(j).asText(),deficiency))>=ColorVision.MIN_DELTA_E,s.path("id")+" "+field+" "+deficiency);
    }
    assertTrue(catalog.style("sketch").path("sketch").asBoolean());assertTrue(catalog.style("isometric").path("iso").asBoolean());assertEquals("outline",catalog.style("line-minimal").path("fill").asText());
  }
  @Test void overridesDoNotChangeCatalogOrStructure() {
    var doc=DiagramValidatorTest.doc();var nodes=doc.path("nodes").deepCopy();((ObjectNode)doc.at("/style/overrides")).put("font_size_pt",8);
    assertEquals(8,catalog.effective(doc).path("font_size_pt").asDouble());assertEquals(7,catalog.style("nature-flat").path("font_size_pt").asDouble());
    ((ObjectNode)doc.path("style")).put("preset","sketch");assertTrue(catalog.effective(doc).path("sketch").asBoolean());assertEquals(nodes,doc.path("nodes"));
    ((ObjectNode)catalog.style("nature-flat")).put("font_size_pt",72);assertEquals(7,catalog.style("nature-flat").path("font_size_pt").asDouble());
  }
  @Test void paletteWarningsReportUnmodifiedColorsAtTheExistingThreshold(){
    assertEquals(20,ColorVision.MIN_DELTA_E);
    var data=json.valueToTree(catalog.all());assertEquals(6,data.path("palettes").size());assertEquals(6,catalog.paletteAudits().size());
    for(var p:data.path("palettes")){var audit=data.path("palette_audits").findValues("id");boolean safe=true;var keys=java.util.List.of("a","b","c","d","n");int failures=0;for(int i=0;i<5;i++)for(int j=0;j<i;j++)if(ColorVision.minimum(p.path(keys.get(i)).asText(),p.path(keys.get(j)).asText())<20){safe=false;failures++;}
      final String id=p.path("id").asText();var actual=catalog.paletteAudits().stream().filter(a->a.get("id").equals(id)).findFirst().orElseThrow();assertEquals(safe,actual.get("safe"));assertEquals(failures,((java.util.List<?>)actual.get("failing_pairs")).size());}
    var doc=DiagramValidatorTest.doc();DiagramValidator.validate(doc);((ObjectNode)doc.path("style")).put("palette","npg");DiagramValidator.validate(doc);((ObjectNode)doc.path("style")).put("palette","invalid");assertThrows(RuntimeException.class,()->DiagramValidator.validate(doc));
  }
  @Test void allTwelveSelfAuthoredTemplatesCoverEveryPatternInBothLanguages() {
    assertEquals(12,catalog.templates().size());var patterns=new java.util.HashSet<String>();
    for(var template:catalog.templates()){patterns.add(template.path("pattern").asText());for(String language:java.util.List.of("en","zh")){var doc=template.at("/documents/"+language);DiagramValidator.validate(doc);assertEquals(language,doc.path("label_language").asText());}}
    assertEquals(java.util.Set.of("conceptual","framework","pipeline","architecture","taxonomy","teaser","mechanism","workflow","comparison"),patterns);
  }
}
