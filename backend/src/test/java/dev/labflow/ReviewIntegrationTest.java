package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.processing.ProcessingRules;
import dev.labflow.repository.WorkspaceRepository;
import dev.labflow.service.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@LabflowIntegrationTest @AutoConfigureMockMvc
@org.springframework.transaction.annotation.Transactional
class ReviewIntegrationTest {
  @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired WorkspaceService workspace;
  @Autowired WorkspaceRepository db; @Autowired ProcessingService processing;
  @Autowired BackupService backups;
  long project,dataset,chart;ObjectNode config;
  long id(Object v){return json.valueToTree(v).path("id").asLong();}
  @BeforeEach void setup() throws Exception {
    project=id(workspace.createProject("Review integration", "synthetic test only"));
    dataset=id(workspace.upload(project,null,"PRIVATE_FILENAME.csv","epoch,accuracy,error,private\n1,0.7,0.01,PRIVATE_SAMPLE\n1,0.9,0.02,PRIVATE_SAMPLE\n2,0.8,0.01,PRIVATE_SAMPLE\n2,0.9,0.02,PRIVATE_SAMPLE".getBytes(StandardCharsets.UTF_8)));
    config=(ObjectNode)json.readTree(getClass().getResourceAsStream("/config-v1.json"));config.put("datasetVersionId",dataset);
    chart=id(workspace.saveChart(project,null,"Current chart",null,config));
  }
  ObjectNode request(){var r=json.createObjectNode().put("protocol_version",1).put("chart_id",chart);r.set("config",config);return r;}
  JsonNode call(ObjectNode request) throws Exception {
    return json.readTree(mvc.perform(post("/api/projects/"+project+"/figure-tools/review").contentType("application/json").content(request.toString()))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
  }
  @Test void reviewIsReadOnlyStableAndPrivateAndSkipsMissingGeometry() throws Exception {
    var before=workspace.chart(project,chart);var bytes=(byte[])workspace.original(project,dataset).get("original_file");
    var a=call(request());assertEquals(a,call(request()));assertEquals(2,a.path("skipped").size());
    for(String secret:List.of("PRIVATE_FILENAME","PRIVATE_SAMPLE","sampleRows","rows","filename"))assertFalse(a.toString().contains(secret),secret);
    assertEquals(before,workspace.chart(project,chart));assertEquals(1,workspace.versions(project,chart).size());assertArrayEquals(bytes,(byte[])workspace.original(project,dataset).get("original_file"));
  }
  @Test void reviewRejectsUnknownFactsTooManyPointsAndCrossProjectData() throws Exception {
    var request=request();request.put("save",true);
    mvc.perform(post("/api/projects/"+project+"/figure-tools/review").contentType("application/json").content(request.toString())).andExpect(status().isBadRequest());
    request=request();var facts=request.putObject("render_facts");facts.put("version",1);facts.putObject("canvas").put("width",760).put("height",500);
    facts.putObject("plot").put("x",0).put("y",0).put("width",760).put("height",500);facts.putArray("texts");facts.putArray("bands");
    var points=facts.putArray("points");for(int i=0;i<3001;i++)points.addObject().put("trace",i/200).put("x",1).put("y",1);
    mvc.perform(post("/api/projects/"+project+"/figure-tools/review").contentType("application/json").content(request.toString())).andExpect(status().isBadRequest());
    points.removeAll();facts.putObject("legend").put("x",0).put("y",0).put("width",1).put("height",1).put("text","private");
    mvc.perform(post("/api/projects/"+project+"/figure-tools/review").contentType("application/json").content(request.toString())).andExpect(status().isBadRequest());
    long other=id(workspace.createProject("Other review", "synthetic"));
    try{mvc.perform(post("/api/projects/"+other+"/figure-tools/review").contentType("application/json").content(request().toString())).andExpect(status().isNotFound());}
    finally{db.update("DELETE FROM projects WHERE id=?",other);}
  }
  @Test void sameChartIsExcludedAndOnlyLatestOtherVersionCounts() throws Exception {
    var other=config.deepCopy();((ObjectNode)other.path("series").get(0)).put("color","#000000");
    long otherId=id(workspace.saveChart(project,null,"Different chart",null,other));
    var report=call(request());assertTrue(report.path("issues").toString().contains("Different chart"));
    workspace.saveChart(project,otherId,"Different chart",1,config);
    assertFalse(call(request()).path("issues").toString().contains("R10"));
    ((ObjectNode)config.path("series").get(0)).put("name","Only this draft");
    assertFalse(call(request()).path("issues").toString().contains("R10"));
  }
  @Test void derivedErrorUsesActualMappingAndGroupCountsNotColumnGuessing() throws Exception {
    var rules=new ProcessingRules(1,"aggregate",List.of("epoch"),List.of("accuracy"),List.of(),List.of(),"include","sem","synthetic observation","","epoch","","bars");
    var derived=json.valueToTree(processing.commit(project,dataset,"derived-review",rules));var columns=derived.at("/source_meta/statistics/0/columns");
    config.put("datasetVersionId",derived.path("id").asLong());var s=(ObjectNode)config.path("series").get(0);s.put("y",columns.path("mean").asText()).put("error",columns.path("sem").asText());
    var result=call(request());assertTrue(result.path("issues").toString().contains("有效 n：[2]"));
    ((ObjectNode)config.path("style")).put("title","mean ± SEM, n=2");assertFalse(call(request()).path("issues").toString().contains("R6"));
    s.put("error",columns.path("sd").asText());assertTrue(call(request()).path("issues").toString().contains("R6:unknown"));
  }
  @Test void journalConfigurationRoundTripsThroughExistingProjectBackup() throws Exception {
    config.putObject("publication").put("enabled",true).put("widthMm",89).put("fontPt",6.5).put("dpi",300).put("journal","nature");
    workspace.saveChart(project,chart,"Current chart",1,config);
    var restored=json.valueToTree(backups.restore(backups.export(project),"Restored synthetic review"));
    long restoredProject=restored.path("project_id").asLong();
    if(restoredProject==0)restoredProject=restored.path("id").asLong();
    var charts=workspace.charts(restoredProject);assertEquals(1,charts.size());
    var result=json.valueToTree(workspace.chart(restoredProject,((Number)charts.getFirst().get("id")).longValue())).path("config");
    assertEquals(config.path("publication"),result.path("publication"));
    var expected=config.deepCopy();expected.put("datasetVersionId",result.path("datasetVersionId").asLong());assertEquals(json.readTree(expected.toString()),json.readTree(result.toString()));
  }
}
