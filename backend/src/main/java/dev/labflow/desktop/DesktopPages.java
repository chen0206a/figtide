package dev.labflow.desktop;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.*;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Desktop assets live outside Boot's default static locations: development stays API-only. */
@Controller
@Profile("desktop")
public class DesktopPages {
  @GetMapping({"/", "/{*path}"})
  public ResponseEntity<?> page(HttpServletRequest request) {
    String path = request.getRequestURI().substring(request.getContextPath().length());
    if (path.equals("/api") || path.startsWith("/api/") || path.contains("..")
        || path.contains("\\") || path.contains("%")) return missing();
    var resource = new ClassPathResource("desktop-static" + path);
    if (!path.equals("/") && resource.exists() && resource.isReadable()) {
      var cache = path.matches("/assets/[^/]+-[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9]+")
          ? CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable()
          : CacheControl.noCache();
      return ResponseEntity.ok().cacheControl(cache)
          .contentType(MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM))
          .body(resource);
    }
    if (path.startsWith("/assets/")) return missing();
    var index = new ClassPathResource("desktop-static/index.html");
    if (!index.exists()) return missing();
    return ResponseEntity.ok().cacheControl(CacheControl.noCache())
        .contentType(MediaType.TEXT_HTML).body(index);
  }

  private ResponseEntity<?> missing() {
    return ResponseEntity.status(404).body(Map.of("code", "RESOURCE_NOT_FOUND", "message", "接口或资源不存在"));
  }
}
