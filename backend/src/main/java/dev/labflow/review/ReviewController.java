package dev.labflow.review;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/projects/{p}/figure-tools")
public class ReviewController {
  private final ReviewEndpointService service;
  public ReviewController(ReviewEndpointService service){this.service=service;}
  @PostMapping("/review") Object review(@PathVariable long p,@RequestBody JsonNode request){return service.request(p,request);}
}
