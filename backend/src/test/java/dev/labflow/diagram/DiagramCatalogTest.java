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
    assertEquals(8,catalog.effective(doc).path("font_size_pt").asDouble());assertEquals(6.5,catalog.style("nature-flat").path("font_size_pt").asDouble());
    ((ObjectNode)doc.path("style")).put("preset","sketch");assertTrue(catalog.effective(doc).path("sketch").asBoolean());assertEquals(nodes,doc.path("nodes"));
    ((ObjectNode)catalog.style("nature-flat")).put("font_size_pt",72);assertEquals(6.5,catalog.style("nature-flat").path("font_size_pt").asDouble());
  }
}
