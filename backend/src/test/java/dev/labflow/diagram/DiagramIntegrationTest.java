package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.LabflowIntegrationTest;
import dev.labflow.repository.WorkspaceRepository;
import dev.labflow.service.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@LabflowIntegrationTest @AutoConfigureMockMvc @org.springframework.transaction.annotation.Transactional
class DiagramIntegrationTest {
  @Autowired DiagramService diagrams; @Autowired WorkspaceService workspace; @Autowired ObjectMapper json;
  @Autowired BackupService backups; @Autowired WorkspaceRepository db; @Autowired MockMvc mvc;
  long project;ObjectNode doc;
  long id(Object o){return json.valueToTree(o).path("id").asLong();}
  @BeforeEach void setup(){project=id(workspace.createProject("Diagram synthetic", "No real workspace or models"));doc=DiagramValidatorTest.doc();}
  @Test void immutableHistoryConflictRestoreArchiveAndOwnership() {
    long diagram=id(diagrams.create(project,"Synthetic",doc));assertEquals(1,diagrams.get(project,diagram).get("revision"));
    var changed=doc.deepCopy();((ObjectNode)changed.at("/nodes/0")).put("label","Changed");diagrams.save(project,diagram,1,changed);
    var conflict=assertThrows(dev.labflow.api.ApiException.class,()->diagrams.save(project,diagram,1,doc));assertEquals(409,conflict.status);
    diagrams.restore(project,diagram,2,1);assertEquals(doc,diagrams.get(project,diagram).get("doc"));assertEquals(3,diagrams.versions(project,diagram).size());
    diagrams.archive(project,diagram,3,true);assertEquals(true,diagrams.get(project,diagram).get("archived"));assertEquals(4,diagrams.versions(project,diagram).size());
    long other=id(workspace.createProject("Other synthetic", "test only"));
    assertEquals(404,assertThrows(dev.labflow.api.ApiException.class,()->diagrams.get(other,diagram)).status);
    assertEquals(404,assertThrows(dev.labflow.api.ApiException.class,()->diagrams.restore(other,diagram,4,1)).status);
    assertEquals(404,assertThrows(dev.labflow.api.ApiException.class,()->diagrams.save(other,diagram,4,doc)).status);
  }
  @Test void restBoundaryRejectsUnknownFieldsAndStaleRevision() throws Exception {
    var input=json.createObjectNode().put("name","HTTP synthetic");input.set("doc",doc);
    var created=json.readTree(mvc.perform(post("/api/projects/"+project+"/diagrams").contentType("application/json").content(input.toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    long d=created.path("id").asLong();input=json.createObjectNode().put("base_revision",0);input.set("doc",doc);
    mvc.perform(put("/api/projects/"+project+"/diagrams/"+d).contentType("application/json").content(input.toString())).andExpect(status().isConflict());
    input.put("base_revision",1).put("automatic",true);
    mvc.perform(put("/api/projects/"+project+"/diagrams/"+d).contentType("application/json").content(input.toString())).andExpect(status().isBadRequest());
    mvc.perform(get("/api/projects/"+project+"/diagrams/"+d+"/versions")).andExpect(status().isOk());
    assertEquals(1,diagrams.versions(project,d).size());
  }
  @Test void templateCreationUsesTheSameValidatorAndExistingOriginProtection() throws Exception {
    var in=json.createObjectNode().put("name","Template synthetic").put("template","mechanism").put("style","nature-flat").put("label_language","zh");
    var created=json.readTree(mvc.perform(post("/api/projects/"+project+"/diagrams").contentType("application/json").content(in.toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    assertEquals("zh",created.at("/doc/label_language").asText());assertEquals(1,created.path("revision").asInt());
    mvc.perform(post("/api/projects/"+project+"/diagrams").header("Origin","https://attacker.example").contentType("application/json").content(in.toString())).andExpect(status().isForbidden());
    in.set("doc",doc);mvc.perform(post("/api/projects/"+project+"/diagrams").contentType("application/json").content(in.toString())).andExpect(status().isBadRequest());
  }
  @Test void projectBackupRoundTripRemapsIdsAndKeepsDocumentsAndHistory() {
    long d=id(diagrams.create(project,"Synthetic",doc));diagrams.save(project,d,1,doc);diagrams.archive(project,d,2,true);
    var restored=backups.restore(backups.export(project),"Restored diagrams synthetic");long p=id(restored);
    long newId=((Number)diagrams.list(p).getFirst().get("id")).longValue();assertNotEquals(d,newId);
    assertEquals(doc,diagrams.get(p,newId).get("doc"));assertEquals(true,diagrams.get(p,newId).get("archived"));assertEquals(3,diagrams.versions(p,newId).size());
    assertEquals(diagrams.versions(project,d).stream().map(v->v.get("doc")).toList(),diagrams.versions(p,newId).stream().map(v->v.get("doc")).toList());
  }
  @Test void toolPreviewIsReadOnlyWithOwnershipAndRevisionChecks()throws Exception{
    long d=id(diagrams.create(project,"Preview synthetic",doc));var input=json.createObjectNode().put("protocol_version",1).put("diagram_id",d).put("base_revision",1);input.set("doc",doc);input.putArray("operations").addObject().put("tool","set_style").putObject("arguments").put("preset","sketch");
    var out=json.readTree(mvc.perform(post("/api/projects/"+project+"/diagram-tools/preview").contentType("application/json").content(input.toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));assertEquals("sketch",out.at("/doc/style/preset").asText());assertFalse(out.path("changes").isEmpty());assertEquals(doc,diagrams.get(project,d).get("doc"));assertEquals(1,diagrams.versions(project,d).size());
    long other=id(workspace.createProject("Other preview synthetic","test only"));mvc.perform(post("/api/projects/"+other+"/diagram-tools/preview").contentType("application/json").content(input.toString())).andExpect(status().isNotFound());
    input.put("base_revision",0);mvc.perform(post("/api/projects/"+project+"/diagram-tools/preview").contentType("application/json").content(input.toString())).andExpect(status().isConflict());
    input.put("base_revision",1).put("save",true);mvc.perform(post("/api/projects/"+project+"/diagram-tools/preview").contentType("application/json").content(input.toString())).andExpect(status().isBadRequest());
  }
  byte[] archive(ObjectNode root) throws Exception {
    byte[] manifest=json.writeValueAsBytes(root);var bytes=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(bytes)){
      zip.putNextEntry(new ZipEntry("manifest.json"));zip.write(manifest);zip.closeEntry();zip.putNextEntry(new ZipEntry("sha256.txt"));zip.write(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(manifest)).getBytes(StandardCharsets.US_ASCII));zip.closeEntry();}return bytes.toByteArray();
  }
  ObjectNode manifest(byte[] bytes) throws Exception {try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes))){zip.getNextEntry();return (ObjectNode)json.readTree(zip.readAllBytes());}}
  @Test void legacyBackupWorksButPartialNewTablesAndBadReferencesRollback() throws Exception {
    var root=manifest(backups.export(project));var tables=(ObjectNode)root.path("tables");tables.remove(List.of("diagrams","diagram_versions"));
    long p=id(backups.restore(archive(root),"Restored legacy synthetic"));assertTrue(diagrams.list(p).isEmpty());
    tables.putArray("diagrams");var partial=root;assertThrows(dev.labflow.api.ApiException.class,()->backups.restore(archive(partial),"Reject partial"));
    long d=id(diagrams.create(project,"Synthetic",doc));root=manifest(backups.export(project));((ObjectNode)root.at("/tables/diagram_versions/0")).put("diagram_id",999999999L);
    var bad=root;int before=workspace.projects().size();assertThrows(dev.labflow.api.ApiException.class,()->backups.restore(archive(bad),"Reject reference"));assertEquals(before,workspace.projects().size());assertEquals(1,diagrams.versions(project,d).size());
  }

  @Test void reviewIsReadOnlyStrictAndChecksRevisionAndOwnership()throws Exception{
    long id=id(diagrams.create(project,"Review synthetic",doc));var in=json.createObjectNode().put("protocol_version",1).put("diagram_id",id).put("base_revision",1);in.set("doc",doc);
    var endpoint="/api/projects/"+project+"/diagram-tools/review";
    var result=json.readTree(mvc.perform(post(endpoint).contentType("application/json").content(in.toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    assertEquals(1,result.path("protocol_version").asInt());assertTrue(result.path("skipped").toString().contains("D4"));assertEquals(doc,diagrams.get(project,id).get("doc"));assertEquals(1,diagrams.versions(project,id).size());
    in.put("base_revision",0);mvc.perform(post(endpoint).contentType("application/json").content(in.toString())).andExpect(status().isConflict());in.put("base_revision",1);
    long other=id(workspace.createProject("Review other project","Ownership check"));mvc.perform(post("/api/projects/"+other+"/diagram-tools/review").contentType("application/json").content(in.toString())).andExpect(status().isNotFound());
    in.put("unknown","PRIVATE_LABEL");mvc.perform(post(endpoint).contentType("application/json").content(in.toString())).andExpect(status().isBadRequest());in.remove("unknown");in.putObject("render_facts").put("label","PRIVATE_LABEL");mvc.perform(post(endpoint).contentType("application/json").content(in.toString())).andExpect(status().isBadRequest());
  }
}
