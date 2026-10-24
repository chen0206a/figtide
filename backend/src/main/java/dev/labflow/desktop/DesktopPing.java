package dev.labflow.desktop;

import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile("desktop")
public class DesktopPing {
  private final DesktopInstance instance;
  public DesktopPing(DesktopInstance instance) { this.instance = instance; }
  @GetMapping("/api/desktop/ping")
  public Map<String, String> ping() { return Map.of("instance_id", instance.id()); }
}
