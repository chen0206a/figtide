package dev.labflow.desktop;

import com.fasterxml.jackson.databind.JsonNode;
import dev.labflow.api.ApiException;
import java.net.URI;
import java.util.Map;
import java.util.function.Consumer;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

/** Fixed external destination, requested only by an explicit user click. */
@Profile("desktop") @RestController
public class DiagramGalleryController {
  static final URI GALLERY=URI.create("https://github.com/qwdwqfwq/topconf-paper-figure-gallery");
  private final Consumer<URI> browse;
  public DiagramGalleryController(){this(DesktopUi::browse);}
  DiagramGalleryController(Consumer<URI> browse){this.browse=browse;}
  @PostMapping("/api/desktop/diagram-gallery")
  Object open(@RequestBody(required=false) JsonNode input){
    if(input!=null&&(!input.isObject()||!input.isEmpty()))throw ApiException.bad("外部链接不接受自定义地址或参数");
    browse.accept(GALLERY);return Map.of("requested",true);
  }
}
