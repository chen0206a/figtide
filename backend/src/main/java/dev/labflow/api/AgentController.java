package dev.labflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.agent.AgentRunService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class AgentController {
  private final AgentRunService service;

  public AgentController(AgentRunService service) {
    this.service = service;
  }

  @GetMapping("/agent/provider")
  Object provider() {
    return service.info();
  }

  @PostMapping("/projects/{p}/agent/runs")
  @ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED)
  Object start(@PathVariable long p, @RequestBody JsonNode request) {
    return service.start(p, request);
  }

  @GetMapping("/projects/{p}/agent/runs/{id}")
  Object get(@PathVariable long p, @PathVariable String id) {
    return service.get(p, id);
  }

  @PostMapping("/projects/{p}/agent/runs/{id}/cancel")
  Object cancel(@PathVariable long p, @PathVariable String id) {
    return service.cancel(p, id);
  }

  @GetMapping("/projects/{p}/agent/history")
  Object history(
      @PathVariable long p,
      @RequestParam(required = false) Long chart_id,
      @RequestParam(required = false) String outcome,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "10") int size) {
    return service.history(p, chart_id, outcome, page, size);
  }

  @GetMapping("/projects/{p}/agent/runs/{id}/audit")
  Object audit(@PathVariable long p, @PathVariable String id) {
    return service.detail(p, id);
  }

  @PostMapping("/projects/{p}/agent/runs/{id}/decision")
  Object decision(@PathVariable long p, @PathVariable String id, @RequestBody JsonNode request) {
    return service.decide(p, id, request);
  }
}
