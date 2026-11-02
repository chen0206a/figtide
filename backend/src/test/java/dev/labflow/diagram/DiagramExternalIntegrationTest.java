package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.*;
import dev.labflow.service.*;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@LabflowIntegrationTest @AutoConfigureMockMvc @org.springframework.transaction.annotation.Transactional
class DiagramExternalIntegrationTest {
  @Autowired ObjectMapper json;@Autowired DiagramService diagrams;@Autowired DiagramCatalog catalog;@Autowired WorkspaceService workspace;@Autowired BackupService backups;@Autowired MockMvc mvc;
  long p,d;ObjectNode original;
  long id(Object o){return json.valueToTree(o).path("id").asLong();}
  @BeforeEach void setup(){p=id(workspace.createProject("External SVG synthetic","No workspace data"));original=(ObjectNode)catalog.template("workflow","en");((ObjectNode)original.path("meta")).put("brief","Sample to sequencing").putArray("facts").add("Sample precedes sequencing");d=id(diagrams.create(p,"External synthetic",original));}
  JsonNode importSvg(String svg)throws Exception{return json.readTree(mvc.perform(post("/api/projects/"+p+"/diagrams/"+d+"/import-svg").contentType("application/json").content(json.createObjectNode().put("base_revision",1).put("svg",svg).toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));}
  ObjectNode apply(JsonNode doc,String tool,JsonNode arguments){var ops=json.createArrayNode();var op=ops.addObject().put("tool",tool);op.set("arguments",arguments);return DiagramOperations.apply(doc,ops);}
  @Test void briefIsSemanticReadOnlyAndIncludesPhysicalStyle()throws Exception{
    var out=json.readTree(mvc.perform(get("/api/projects/"+p+"/diagrams/"+d+"/brief")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));assertEquals("Sample to sequencing",out.at("/json/brief").asText());assertEquals(1,out.at("/json/facts").size());assertTrue(out.path("markdown").asText().contains("## 用户事实"));assertTrue(out.at("/json/style").has("font_family"));assertEquals(1.25,out.at("/json/style/line_widths_pt/connection").asDouble());for(var n:out.at("/json/spec/nodes"))assertFalse(n.has("x"));assertEquals(1,diagrams.versions(p,d).size());
  }
  @Test void sanitizedLayerPreservesNativeElementsHistoryAndBackup()throws Exception{
    var saved=importSvg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 60' onload='alert(1)'><script>alert(2)</script><rect width='50' height='30' fill='#0072B2'/><text x='5' y='20'>Synthetic</text><image href='https://evil.invalid/a.png'/></svg>");var doc=(ObjectNode)saved.path("doc");assertEquals(2,saved.path("revision").asInt());assertEquals(original.path("nodes"),doc.path("nodes"));assertEquals(1,doc.path("artworks").size());String svg=doc.at("/artworks/0/svg").asText();assertFalse(svg.contains("script"));assertFalse(svg.contains("onload"));assertFalse(svg.contains("image"));assertTrue(svg.contains("Synthetic"));
    long restored=id(backups.restore(backups.export(p),"External restored synthetic"));long newId=((Number)diagrams.list(restored).getFirst().get("id")).longValue();assertEquals(doc,diagrams.get(restored,newId).get("doc"));assertEquals(2,diagrams.versions(restored,newId).size());
    var lock=json.createObjectNode().put("id","artwork1").put("locked",true);var locked=apply(doc,"update_artwork",lock);assertThrows(RuntimeException.class,()->apply(locked,"update_artwork",json.createObjectNode().put("id","artwork1").put("x",1)));assertThrows(RuntimeException.class,()->apply(locked,"remove_artwork",json.createObjectNode().put("id","artwork1")));var unlocked=apply(locked,"update_artwork",lock.put("locked",false).put("w",80));assertEquals(80,unlocked.at("/artworks/0/w").asInt());assertTrue(apply(unlocked,"remove_artwork",json.createObjectNode().put("id","artwork1")).path("artworks").isEmpty());
    diagrams.restore(p,d,2,1);assertEquals(original,diagrams.get(p,d).get("doc"));assertEquals(3,diagrams.versions(p,d).size());
  }
  @Test void importRejectsXmlAttacksOwnershipStaleRevisionAndUnsafeSavedDocuments()throws Exception{
    String url="/api/projects/"+p+"/diagrams/"+d+"/import-svg";var in=json.createObjectNode().put("base_revision",1).put("svg","<!DOCTYPE svg [<!ENTITY a SYSTEM 'file:///private'>]><svg>&a;</svg>");mvc.perform(post(url).contentType("application/json").content(in.toString())).andExpect(status().isBadRequest());
    in.put("svg","<svg><rect width='10' height='10'/></svg>").put("base_revision",2);mvc.perform(post(url).contentType("application/json").content(in.toString())).andExpect(status().isConflict());in.put("base_revision",1).put("unknown",true);mvc.perform(post(url).contentType("application/json").content(in.toString())).andExpect(status().isBadRequest());in.remove("unknown");
    long other=id(workspace.createProject("Other external synthetic","Ownership"));mvc.perform(post("/api/projects/"+other+"/diagrams/"+d+"/import-svg").contentType("application/json").content(in.toString())).andExpect(status().isNotFound());mvc.perform(get("/api/projects/"+other+"/diagrams/"+d+"/brief")).andExpect(status().isNotFound());assertEquals(1,diagrams.versions(p,d).size());
    var unsafe=original.deepCopy();unsafe.putArray("artworks").addObject().put("id","artwork1").put("name","Unsafe").put("x",0).put("y",0).put("w",10).put("h",10).put("locked",false).put("hidden",false).put("svg","<svg><script>alert(1)</script><rect/></svg>");assertThrows(RuntimeException.class,()->diagrams.save(p,d,1,unsafe));
  }
}
