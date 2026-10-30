package dev.labflow.review;

import static org.junit.jupiter.api.Assertions.*;
import dev.labflow.LabflowIntegrationTest;
import dev.labflow.TestDatasourceInitializer;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** Rebuild the actual V8 run-table DDL under a unique test-only name, then apply the actual V9. */
@LabflowIntegrationTest
class ReviewMigrationTest {
  @Autowired DataSource source;
  @Test void v8RunRecordUpgradesWithSingleDefaultAndNullableReviewColumns() throws Exception {
    String table="review18_"+UUID.randomUUID().toString().replace("-","");
    String dir=TestDatasourceInitializer.isMysql()?"db/migration/":"db/migration-h2/";
    try(var connection=source.getConnection();var statement=connection.createStatement()){
      assertTrue(connection.getCatalog().equalsIgnoreCase("labflow_test"),"仅测试库可运行此 DDL 探针");
      long project;
      try(var insert=connection.prepareStatement("INSERT INTO projects(name,description) VALUES('Review migration synthetic','test only')",Statement.RETURN_GENERATED_KEYS)){
        insert.executeUpdate();try(var keys=insert.getGeneratedKeys()){assertTrue(keys.next());project=keys.getLong(1);}
      }
      try{
        for(int version=5;version<=8;version++)apply(statement,dir,version,table,true);
        String run=UUID.randomUUID().toString();
        try(var insert=connection.prepareStatement("INSERT INTO "+table+"(run_id,project_id,instance_id,base_revision,dataset_version_id,source_sha256,snapshot_hash,model,endpoint,prompt_version,catalog_hash,status,outcome,max_steps,max_tokens,timeout_seconds,trace_json,created_at) VALUES(?,?,?,0,1,?,?, 'synthetic','local','test',?,'proposed','pending',6,32000,60,'[]',CURRENT_TIMESTAMP(3))")){
          insert.setString(1,run);insert.setLong(2,project);insert.setString(3,UUID.randomUUID().toString());for(int i=4;i<=6;i++)insert.setString(i,"0".repeat(64));insert.executeUpdate();
        }
        try(var rs=statement.executeQuery("SELECT * FROM "+table+" WHERE 1=0")){
          List<String> columns=new ArrayList<>();for(int i=1;i<=rs.getMetaData().getColumnCount();i++)columns.add(rs.getMetaData().getColumnName(i).toLowerCase());assertFalse(columns.contains("mode"));
        }
        apply(statement,dir,9,table,false);
        try(var rs=statement.executeQuery("SELECT run_id,mode,review_json,accepted_fixes_json,status FROM "+table)){
          assertTrue(rs.next());assertEquals(run,rs.getString(1));assertEquals("single",rs.getString(2));assertNull(rs.getObject(3));assertNull(rs.getObject(4));assertEquals("proposed",rs.getString(5));assertFalse(rs.next());
        }
        statement.executeUpdate("UPDATE "+table+" SET review_json='{\"rules_version\":\"review-v1\"}',accepted_fixes_json='[]'");
        try(var rs=statement.executeQuery("SELECT review_json,accepted_fixes_json FROM "+table)){
          assertTrue(rs.next());assertTrue(rs.getString(1).contains("review-v1"));assertEquals("[]",rs.getString(2));
        }
      }finally{
        statement.execute("DROP TABLE IF EXISTS "+table);
        try(var delete=connection.prepareStatement("DELETE FROM projects WHERE id=?")){delete.setLong(1,project);delete.executeUpdate();}
      }
    }
  }
  private void apply(Statement statement,String dir,int version,String table,boolean runOnly) throws Exception {
    var resolver=new PathMatchingResourcePatternResolver();var resources=resolver.getResources("classpath:"+dir+"V"+version+"__*.sql");assertEquals(1,resources.length);
    String sql;try(var in=resources[0].getInputStream()){sql=new String(in.readAllBytes(),StandardCharsets.UTF_8);}
    sql=sql.replaceAll("(?m)^\\s*--.*$","");
    for(String raw:sql.split(";")){
      String s=raw.strip();if(s.isEmpty()||(runOnly&&!s.matches("(?is)^(CREATE|ALTER) TABLE agent_runs\\b.*")))continue;
      s=s.replaceAll("\\bagent_runs\\b",table).replaceAll("\\b(agent_project_created|agent_project_chart|agent_parent|agent_session)\\b",table+"_$1");
      statement.execute(s);
    }
  }
}
