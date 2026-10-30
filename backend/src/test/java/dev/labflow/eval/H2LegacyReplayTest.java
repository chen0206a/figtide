package dev.labflow.eval;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.labflow.*;
import dev.labflow.agent.AgentAuditService;
import dev.labflow.service.*;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Executes the original suite unchanged; the historical MySQL-only test keeps its assumptions. */
@SpringBootTest(classes=LabFlowApplication.class,properties={"LABFLOW_AGENT_BASE_URL=http://127.0.0.1:1","LABFLOW_AGENT_MODEL=","labflow.test-support=false"})
@ContextConfiguration(initializers=TestDatasourceInitializer.class)
class H2LegacyReplayTest {
  @Autowired ObjectMapper json;@Autowired WorkspaceService workspace;@Autowired FigureToolService figures;@Autowired AgentAuditService audit;@Autowired JdbcTemplate db;@Autowired PlatformTransactionManager transactions;
  @BeforeAll static void h2Only(){Assumptions.assumeFalse(TestDatasourceInitializer.isMysql(),"Original AgentEvaluationTest covers MySQL");}
  @Test void originalSuiteV15ActuallyReplaysAllThirtyCasesOnH2() throws Exception {
    var suite=json.readTree(getClass().getResourceAsStream("/agent-eval/suite-v1.json"));int projects=db.queryForObject("SELECT COUNT(*) FROM projects",Integer.class),runs=db.queryForObject("SELECT COUNT(*) FROM agent_runs",Integer.class);
    var runner=new EvaluationRunner(json,workspace,figures,audit,db,new TransactionTemplate(transactions));
    var report=runner.run(suite,"replay",Set.of(),null,Path.of("target/agent-eval/legacy-h2-replay"),null);
    assertEquals(30,report.at("/summary/total").asInt());assertEquals(30,report.at("/summary/mechanical_pass").asInt());assertEquals(0,report.at("/summary/failed").asInt());
    assertEquals("31729aa788efff3561439e6e9b463a6e1c0dcb7f9b24e2bf571d83ac5dad66b0",report.path("suite_hash").asText());
    assertEquals(projects,db.queryForObject("SELECT COUNT(*) FROM projects",Integer.class));assertEquals(runs,db.queryForObject("SELECT COUNT(*) FROM agent_runs",Integer.class));
  }
}
