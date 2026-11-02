package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.LabflowIntegrationTest;
import dev.labflow.agent.*;
import dev.labflow.service.WorkspaceService;
import dev.labflow.api.ApiException;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import static org.junit.jupiter.api.Assertions.*;

@LabflowIntegrationTest @org.springframework.transaction.annotation.Transactional
class DiagramAgentLedgerTest {
  @Autowired ObjectMapper json;@Autowired AgentAuditService audit;@Autowired WorkspaceService workspace;@Autowired DiagramService diagrams;@Autowired DiagramCatalog catalog;
  @Test void diagramBindingUsesTheSameReservationSettlementAndOwnershipRules(){
    long p=json.valueToTree(workspace.createProject("Diagram ledger synthetic","No model calls")).path("id").asLong();
    var doc=catalog.template("workflow","en");long id=((Number)diagrams.create(p,"Ledger",doc).get("id")).longValue();
    String session=UUID.randomUUID().toString(),run=UUID.randomUUID().toString();
    var snapshot=json.createObjectNode().put("diagram_id",id).put("base_revision",1);snapshot.set("config",doc);
    var initial=json.createObjectNode().put("mode","diagram").put("run_id",run).put("session_id",session).put("new_session",true).put("max_tokens",3000).put("max_steps",6).put("timeout_seconds",60).put("session_budget",60000).put("prompt_version","diagram-assistant-v1").put("skill_id","workflow").put("skill_version","1.0.0").put("catalog_hash",AuditSanitizer.hash(doc)).put("request_hash",AuditSanitizer.hash(snapshot));
    var info=new ModelProvider.Info(true,"fixture","http://127.0.0.1:1","");var source=json.createObjectNode().put("sha256",AuditSanitizer.hash(doc));
    assertEquals(3000,audit.begin(p,snapshot,initial,info,source));assertEquals(3000,audit.session(p,session).path("reserved_budget").asInt());
    assertTrue(audit.detail(p,run).path("dataset_version_id").isNull());assertEquals(id,audit.detail(p,run).path("diagram_id").asLong());assertEquals("workflow",audit.detail(p,run).path("skill_id").asText());
    var done=initial.deepCopy().put("status","answered").put("model","fixture").put("steps",1).put("tokens",100).put("budget_used",150).put("latency_ms",1);done.putArray("trace");audit.finish(p,done,60,40,"",true);audit.finish(p,done,60,40,"",true);
    assertEquals(150,audit.session(p,session).path("used_budget").asInt());assertEquals(0,audit.session(p,session).path("reserved_budget").asInt());
    long second=((Number)diagrams.create(p,"Other",doc).get("id")).longValue();snapshot.put("diagram_id",second);initial.put("new_session",false).put("run_id",UUID.randomUUID().toString());assertEquals(409,assertThrows(ApiException.class,()->audit.begin(p,snapshot,initial,info,source)).status);
    assertEquals(150,audit.session(p,session).path("used_budget").asInt());
  }
}
