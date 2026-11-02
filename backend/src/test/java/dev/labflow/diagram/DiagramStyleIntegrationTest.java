package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.*;
import dev.labflow.service.*;
import dev.labflow.review.ColorVision;
import dev.labflow.review.diagram.DiagramReviewService;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@LabflowIntegrationTest @AutoConfigureMockMvc @org.springframework.transaction.annotation.Transactional
class DiagramStyleIntegrationTest {
  @Autowired ObjectMapper json;@Autowired WorkspaceService workspace;@Autowired StyleTemplateService styles;@Autowired DiagramCatalog catalog;@Autowired DiagramReviewService reviews;@Autowired BackupService backups;@Autowired MockMvc mvc;
  ObjectNode profile(){var result=json.createObjectNode().put("schema_version",1).put("kind","diagram");var style=(ObjectNode)catalog.template("workflow","en").path("style").deepCopy();var colors=style.putObject("role_colors");String[] palette={"#0072B2","#009E73","#777777","#CC79A7","#56B4E9","#D55E00"};for(int i=0;i<DiagramPaletteAudit.ROLES.size();i++)colors.put(DiagramPaletteAudit.ROLES.get(i),palette[i]);result.set("style",style);return result;}
  @Test void parametersOnlyTemplatesRoundTripWithoutChangingChartTemplateLists(){
    long p=json.valueToTree(workspace.createProject("Reference style synthetic","Generated test parameters, no images")).path("id").asLong();var profile=profile();var saved=json.valueToTree(styles.save(p,"Synthetic reference",profile));assertEquals(profile,saved.path("profile"));assertEquals(1,styles.diagrams(p).size());assertTrue(styles.list().stream().noneMatch(r->((Number)r.get("id")).longValue()==saved.path("id").asLong()));
    long restored=json.valueToTree(backups.restore(backups.export(p),"Restored synthetic style")).path("id").asLong();assertEquals(1,styles.diagrams(restored).size());assertEquals(profile,styles.diagrams(restored).getFirst().get("profile"));
    var malicious=profile.deepCopy().put("image","data:image/png;base64,AA==");assertThrows(RuntimeException.class,()->StyleTemplateService.profile(malicious));var script=profile.deepCopy();((ObjectNode)script.at("/style/role_colors")).put("actor","url(http://evil.invalid)");assertThrows(RuntimeException.class,()->StyleTemplateService.profile(script));
  }
  @Test void previewIsReadOnlyAndAuditsExactUsedOutlineColors()throws Exception{
    long p=json.valueToTree(workspace.createProject("Style preview synthetic","No reference files uploaded")).path("id").asLong();var doc=(ObjectNode)catalog.template("mechanism","en");var input=json.createObjectNode();input.set("doc",doc);input.set("profile",profile());
    var response=mvc.perform(post("/api/projects/"+p+"/diagram-style-templates/preview").contentType("application/json").content(input.toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);var preview=json.readTree(response).path("doc");assertTrue(styles.diagrams(p).isEmpty());assertFalse(doc.path("style").has("role_colors"));
    var audit=json.valueToTree(catalog.paletteAudit(preview));assertEquals("#0072B2",audit.at("/outlines/actor").asText());assertEquals(10,audit.path("threshold").asInt());for(var pair:audit.path("failing_pairs"))assertEquals(ColorVision.minimum(pair.path("colors").get(0).asText(),pair.path("colors").get(1).asText()),pair.path("minimum_delta_e").asDouble());
    input.put("image","private-original.png");mvc.perform(post("/api/projects/"+p+"/diagram-style-templates/preview").contentType("application/json").content(input.toString())).andExpect(status().isBadRequest());
  }
}
