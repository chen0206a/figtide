package dev.labflow.review.diagram;
import com.fasterxml.jackson.databind.*;
import dev.labflow.diagram.DiagramService;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static dev.labflow.diagram.DiagramValidator.*;
@RestController
public class DiagramReviewController {
  private final DiagramService diagrams;private final DiagramReviewService review;private final ObjectMapper json;
  public DiagramReviewController(DiagramService diagrams,DiagramReviewService review,ObjectMapper json){this.diagrams=diagrams;this.review=review;this.json=json;}
  @PostMapping("/api/projects/{p}/diagram-tools/review") @Transactional(readOnly=true)
  Object review(@PathVariable long p,@RequestBody JsonNode in){fields(in,"protocol_version diagram_id base_revision doc render_facts target","protocol_version doc");require(in.path("protocol_version").isIntegralNumber()&&in.path("protocol_version").canConvertToInt()&&in.path("protocol_version").asInt()==1,"审稿协议版本无效");diagrams.checkContext(p,in);return review.review(in.get("doc"),in.get("render_facts"),in.has("target")?in.get("target"):json.createObjectNode());}
}
