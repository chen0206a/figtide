package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.service.StyleTemplateService;
import dev.labflow.review.diagram.DiagramReviewService;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import static dev.labflow.diagram.DiagramValidator.*;

@RestController @RequestMapping("/api/projects/{p}/diagram-style-templates")
public class DiagramStyleController {
  private final StyleTemplateService styles;private final DiagramService diagrams;private final DiagramReviewService review;
  public DiagramStyleController(StyleTemplateService styles,DiagramService diagrams,DiagramReviewService review){this.styles=styles;this.diagrams=diagrams;this.review=review;}
  @GetMapping Object list(@PathVariable long p){return styles.diagrams(p);}
  @PostMapping Object save(@PathVariable long p,@RequestBody JsonNode in){fields(in,"name profile","name profile");String name=text(in.get("name"),120);require(!name.isBlank(),"请输入风格名称");require(in.path("profile").path("kind").asText().equals("diagram"),"仅保存机制图风格参数");return styles.save(p,name,in.path("profile"));}
  @PostMapping("/preview") Object preview(@PathVariable long p,@RequestBody JsonNode in){fields(in,"doc profile","doc profile");diagrams.project(p);validate(in.path("doc"));require(in.path("profile").path("kind").asText().equals("diagram"),"仅预览机制图风格参数");var profile=StyleTemplateService.profile(in.path("profile"));var doc=(ObjectNode)in.path("doc").deepCopy();doc.set("style",profile.path("style"));validate(doc);return Map.of("doc",doc,"review",review.review(doc,null,null));}
}
