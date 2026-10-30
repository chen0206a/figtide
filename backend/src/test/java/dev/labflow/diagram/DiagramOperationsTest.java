package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

class DiagramOperationsTest {
  final ObjectMapper json=new ObjectMapper();
  JsonNode read(String text)throws Exception{return json.readTree(text);}
  @Test void allTwelveOperationsArePureValidatedAndProduceStableFieldDifferences()throws Exception{
    var before=DiagramValidatorTest.doc();var frozen=before.deepCopy();var operations=read("""
      [
        {"tool":"add_zone","arguments":{"id":"z2","kind":"panel","label":"New panel","x":5,"y":101,"w":170,"h":8}},
        {"tool":"update_zone","arguments":{"id":"z1","x":6}},
        {"tool":"add_node","arguments":{"id":"n4","kind":"glyph","glyph":"protein","label":"Protein","role":"process","x":10,"y":90,"w":20,"h":10}},
        {"tool":"update_node","arguments":{"id":"n4","label":"Updated"}},
        {"tool":"add_edge","arguments":{"id":"e3","from":"n3","to":"n4","kind":"activate"}},
        {"tool":"update_edge","arguments":{"id":"e3","kind":"inhibit","route":"orthogonal"}},
        {"tool":"add_annotation","arguments":{"id":"a1","kind":"note","target":"n4","text":"Synthetic"}},
        {"tool":"set_style","arguments":{"preset":"sketch","overrides":{"font_size_pt":8}}},
        {"tool":"set_style","arguments":{"overrides":{"line_width_pt":0.6}}},
        {"tool":"set_canvas","arguments":{"width_mm":190}},
        {"tool":"set_legend","arguments":{"mode":"off"}},
        {"tool":"remove_edge","arguments":{"id":"e3"}},
        {"tool":"remove_node","arguments":{"id":"n4"}}
      ]""");
    var after=DiagramOperations.apply(before,operations);assertEquals(frozen,before);DiagramValidator.validate(after);
    assertEquals(16,after.at("/nodes/0/x").asDouble());assertEquals(3,after.path("nodes").size());assertTrue(after.path("annotations").isEmpty());
    assertEquals(8,after.at("/style/overrides/font_size_pt").asDouble());assertEquals(.6,after.at("/style/overrides/line_width_pt").asDouble());
    var changes=DiagramOperations.changes(before,after);assertTrue(changes.stream().anyMatch(c->c.get("path").equals("/style/preset")));assertEquals(changes,DiagramOperations.changes(before,after));
    assertEquals(after,DiagramOperations.apply(before,operations));assertEquals(12,DiagramOperations.catalog().path("tools").size());
  }
  @Test void deletionCascadesReferencesAndFailedBatchesNeverMutateInput()throws Exception{
    var before=DiagramValidatorTest.doc();before.withArray("annotations").addObject().put("id","a1").put("kind","note").put("target","n1").put("text","Synthetic");
    var result=DiagramOperations.apply(before,read("[{\"tool\":\"remove_node\",\"arguments\":{\"id\":\"n1\"}}]"));assertEquals(1,result.path("edges").size());assertTrue(result.path("annotations").isEmpty());
    var frozen=before.deepCopy();assertThrows(dev.labflow.api.ApiException.class,()->DiagramOperations.apply(before,read("[{\"tool\":\"set_style\",\"arguments\":{\"preset\":\"sketch\"}},{\"tool\":\"update_node\",\"arguments\":{\"id\":\"missing\",\"x\":10}}]")));assertEquals(frozen,before);
  }
  @Test void nullClearsOverridesAndEquivalentNumbersAreNotReportedAsChanges()throws Exception{
    var d=DiagramValidatorTest.doc();((ObjectNode)d.at("/style/overrides")).put("font_size_pt",8);
    var out=DiagramOperations.apply(d,read("[{\"tool\":\"set_style\",\"arguments\":{\"overrides\":null}}]"));assertTrue(out.at("/style/overrides").isEmpty());
    var original=DiagramValidatorTest.doc();var same=original.deepCopy();((ObjectNode)same.path("canvas")).put("width_mm",180.0);assertTrue(DiagramOperations.changes(original,same).isEmpty());
    var catalog=DiagramOperations.catalog();((ObjectNode)catalog.at("/tools/0/input_schema")).put("additionalProperties",true);assertFalse(DiagramOperations.catalog().at("/tools/0/input_schema/additionalProperties").asBoolean());
  }
  @ParameterizedTest @ValueSource(strings={
      "[{\"tool\":\"save_version\",\"arguments\":{}}]",
      "[{\"tool\":\"set_style\",\"arguments\":{\"preset\":\"sketch\"},\"execute\":true}]",
      "[{\"tool\":\"update_node\",\"arguments\":{\"id\":\"n1\"}}]",
      "[{\"tool\":\"update_node\",\"arguments\":{\"id\":\"n1\",\"html\":\"payload\"}}]",
      "[{\"tool\":\"update_node\",\"arguments\":{\"id\":\"n1\",\"kind\":\"artwork\"}}]",
      "[{\"tool\":\"update_node\",\"arguments\":{\"id\":\"n1\",\"kind\":\"glyph\",\"glyph\":\"missing\"}}]",
      "[{\"tool\":\"update_node\",\"arguments\":{\"id\":\"n1\",\"x\":190}}]",
      "[{\"tool\":\"update_node\",\"arguments\":{\"id\":\"n1\",\"label_pos\":\"unknown\"}}]",
      "[{\"tool\":\"update_node\",\"arguments\":{\"id\":\"n1\",\"badges\":[\"phospho\",\"phospho\"]}}]",
      "[{\"tool\":\"add_edge\",\"arguments\":{\"id\":\"e3\",\"from\":\"n1\",\"to\":\"missing\",\"kind\":\"flow\"}}]",
      "[{\"tool\":\"set_style\",\"arguments\":{\"overrides\":{\"font_size_pt\":\"8\"}}}]",
      "[{\"tool\":\"set_style\",\"arguments\":{\"overrides\":{\"script\":\"payload\"}}}]",
      "[{\"tool\":\"set_canvas\",\"arguments\":{\"width_mm\":5}}]",
      "[{\"tool\":\"set_legend\",\"arguments\":{\"mode\":\"unknown\"}}]",
      "[{\"tool\":\"add_annotation\",\"arguments\":{\"id\":\"a1\",\"kind\":\"note\",\"target\":\"missing\",\"text\":\"Synthetic\"}}]"
  }) void rejectsUnknownInvalidOrUnsafeOperations(String payload)throws Exception{assertThrows(dev.labflow.api.ApiException.class,()->DiagramOperations.apply(DiagramValidatorTest.doc(),read(payload)));}
  @Test void rejectsOversizedBatchesAndPayloads()throws Exception{
    var operations=json.createArrayNode();for(int i=0;i<401;i++)operations.addObject().put("tool","set_legend").putObject("arguments").put("mode","off");assertThrows(dev.labflow.api.ApiException.class,()->DiagramOperations.apply(DiagramValidatorTest.doc(),operations));
    var huge=json.createArrayNode();huge.addObject().put("tool","update_node").putObject("arguments").put("id","n1").put("label","x".repeat(DiagramValidator.MAX_BYTES));assertThrows(dev.labflow.api.ApiException.class,()->DiagramOperations.apply(DiagramValidatorTest.doc(),huge));
  }
}
