package dev.labflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.agent.ModelConnections;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/agent/connection")
public class ModelConnectionController {
  private final ModelConnections connections;

  public ModelConnectionController(ModelConnections connections) {
    this.connections = connections;
  }

  @GetMapping
  Object get() {
    return connections.view();
  }

  @PutMapping
  Object configure(@RequestBody JsonNode input, HttpServletRequest request) {
    guard(request);
    return connections.configure(input);
  }

  @PostMapping("/test")
  Object test(@RequestBody JsonNode input, HttpServletRequest request) {
    guard(request);
    return connections.test(input);
  }

  @PostMapping("/disconnect")
  Object disconnect(@RequestBody JsonNode input, HttpServletRequest request) {
    guard(request);
    return connections.disconnect(input);
  }

  private void guard(HttpServletRequest request) {
    if (!"1".equals(request.getHeader("X-LabFlow-Connection"))
        || !java.util.Set.of("127.0.0.1", "0:0:0:0:0:0:0:1", "::1")
            .contains(request.getRemoteAddr())) throw new ApiException(403, "仅允许本机工作台配置模型连接");
  }
}
