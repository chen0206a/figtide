package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import dev.labflow.api.ApiException;
import dev.labflow.repository.WorkspaceRepository;
import java.sql.Clob;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DiagramService {
  private final WorkspaceRepository db;
  private final ObjectMapper json;
  public DiagramService(WorkspaceRepository db,ObjectMapper json) { this.db=db;this.json=json; }
  public void project(long p) { db.one("SELECT id FROM projects WHERE id=?",p); }
  public List<Map<String,Object>> list(long p) { project(p);return db.query("SELECT d.*,d.revision AS version_count FROM diagrams d WHERE project_id=? ORDER BY updated_at DESC,id DESC",p); }
  public static String string(Object value) {
    try { return value instanceof Clob c?c.getSubString(1,Math.toIntExact(c.length())):value.toString(); }
    catch(Exception e) { throw new IllegalStateException("机制图文档读取失败",e); }
  }
  private Map<String,Object> unpack(Map<String,Object> row) {
    var out=new LinkedHashMap<>(row);try { out.put("doc",json.readTree(string(out.remove("doc_json"))));return out; }
    catch(Exception e) { throw new IllegalStateException("机制图文档无效",e); }
  }
  public Map<String,Object> get(long p,long id) { return unpack(db.one("SELECT d.*,v.doc_json,d.revision AS version_count FROM diagrams d JOIN diagram_versions v ON v.diagram_id=d.id AND v.version=d.revision WHERE d.id=? AND d.project_id=?",id,p)); }
  public List<Map<String,Object>> versions(long p,long id) { get(p,id);return db.query("SELECT version,schema_version,doc_json,created_at FROM diagram_versions WHERE diagram_id=? ORDER BY version DESC",id).stream().map(this::unpack).toList(); }
  @Transactional public Map<String,Object> create(long p,String name,JsonNode doc) {
    project(p);DiagramValidator.require(name!=null&&!name.isBlank()&&name.trim().length()<=120,"名称须为1–120字");DiagramValidator.validate(doc);
    long id=db.insert("INSERT INTO diagrams(project_id,name,created_at,updated_at) VALUES(?,?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",p,name.trim());
    return save(p,id,0,doc);
  }
  @Transactional public Map<String,Object> save(long p,long id,int revision,JsonNode doc) {
    db.one("SELECT id FROM diagrams WHERE id=? AND project_id=?",id,p);DiagramValidator.validate(doc);
    if(db.update("UPDATE diagrams SET revision=revision+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND project_id=? AND revision=?",id,p,revision)!=1)throw new ApiException(409,"机制图已被更新，请重新打开最新版本后再保存");
    db.insert("INSERT INTO diagram_versions(diagram_id,version,schema_version,doc_json,created_at) VALUES(?,?,1,?,CURRENT_TIMESTAMP(3))",id,revision+1,doc.toString());return get(p,id);
  }
  @Transactional public Map<String,Object> restore(long p,long id,int revision,int version) {
    get(p,id);var doc=(JsonNode)unpack(db.one("SELECT doc_json FROM diagram_versions WHERE diagram_id=? AND version=?",id,version)).get("doc");return save(p,id,revision,doc);
  }
  @Transactional public Map<String,Object> archive(long p,long id,int revision,boolean archived) {
    var current=get(p,id);save(p,id,revision,(JsonNode)current.get("doc"));db.update("UPDATE diagrams SET archived=? WHERE id=? AND project_id=?",archived,id,p);return get(p,id);
  }
}
