package dev.labflow.diagram;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;
import static dev.labflow.diagram.DiagramValidator.*;

@RestController
@RequestMapping("/api/projects/{p}/diagrams")
public class DiagramController {
  private final DiagramService diagrams;
  public DiagramController(DiagramService diagrams) { this.diagrams=diagrams; }
  @GetMapping Object list(@PathVariable long p) { return diagrams.list(p); }
  @GetMapping("/{id}") Object get(@PathVariable long p,@PathVariable long id) { return diagrams.get(p,id); }
  @GetMapping("/{id}/versions") Object versions(@PathVariable long p,@PathVariable long id) { return diagrams.versions(p,id); }
  @PostMapping Object create(@PathVariable long p,@RequestBody JsonNode in) { fields(in,"name doc","name doc");return diagrams.create(p,text(in.get("name"),120),in.get("doc")); }
  private int revision(JsonNode in) { var n=in.get("base_revision");require(n!=null&&n.isIntegralNumber()&&n.canConvertToInt()&&n.asInt()>=0&&n.asInt()<Integer.MAX_VALUE,"base_revision无效");return n.asInt(); }
  @PutMapping("/{id}") Object save(@PathVariable long p,@PathVariable long id,@RequestBody JsonNode in) { fields(in,"base_revision doc","base_revision doc");return diagrams.save(p,id,revision(in),in.get("doc")); }
  @PostMapping("/{id}/restore") Object restore(@PathVariable long p,@PathVariable long id,@RequestBody JsonNode in) { fields(in,"base_revision version","base_revision version");var v=in.get("version");require(v.isIntegralNumber()&&v.canConvertToInt()&&v.asInt()>0,"version无效");return diagrams.restore(p,id,revision(in),v.asInt()); }
  @PutMapping("/{id}/archive") Object archive(@PathVariable long p,@PathVariable long id,@RequestBody JsonNode in) { fields(in,"base_revision archived","base_revision archived");require(in.get("archived").isBoolean(),"archived必须是布尔值");return diagrams.archive(p,id,revision(in),in.get("archived").asBoolean()); }
}
