package dev.labflow.diagram;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static dev.labflow.diagram.DiagramValidator.*;

@RestController
public class DiagramToolController {
  private final DiagramService diagrams;
  public DiagramToolController(DiagramService diagrams){this.diagrams=diagrams;}
  @GetMapping("/api/diagram-tools/catalog") Object catalog(){return DiagramOperations.catalog();}
  @PostMapping("/api/projects/{p}/diagram-tools/preview") @Transactional(readOnly=true)
  Object preview(@PathVariable long p,@RequestBody JsonNode in){
    fields(in,"protocol_version diagram_id base_revision doc operations","protocol_version doc operations");require(in.path("protocol_version").isIntegralNumber()&&in.path("protocol_version").canConvertToInt()&&in.path("protocol_version").asInt()==1,"操作协议版本无效");diagrams.checkContext(p,in);
    var doc=DiagramOperations.apply(in.get("doc"),in.get("operations"));return Map.of("protocol_version",1,"doc",doc,"changes",DiagramOperations.changes(in.get("doc"),doc));
  }
}
