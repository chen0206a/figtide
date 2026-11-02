package dev.labflow.diagram;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
public class DiagramIconController {
  private final DiagramIcons icons;public DiagramIconController(DiagramIcons icons){this.icons=icons;}
  @GetMapping(value="/api/diagram-icons/{id}.svg",produces="image/svg+xml")
  ResponseEntity<String> svg(@PathVariable String id){return ResponseEntity.ok().header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; sandbox").header("X-Content-Type-Options","nosniff").body(icons.svg(id));}
}
