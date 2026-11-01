package dev.labflow.diagram;
import org.springframework.web.bind.annotation.*;
@RestController
public class DiagramCatalogController {
  private final DiagramCatalog catalog;
  public DiagramCatalogController(DiagramCatalog catalog) {this.catalog=catalog;}
  @GetMapping("/api/diagram-catalog") Object catalog() {return catalog.all();}
}
