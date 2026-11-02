package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.review.*;
import dev.labflow.review.diagram.DiagramReviewService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import static org.junit.jupiter.api.Assertions.*;

class DiagramIconsTest {
  final ObjectMapper json=new ObjectMapper();final DiagramCatalog catalog=new DiagramCatalog(json,new JournalRules(json));
  @Test void all151LicensedFilesMatchTheirManifestAndTheSingleSecurityBoundary()throws Exception{
    var icons=catalog.icons();assertEquals(151,icons.all().size());assertEquals(151,new PathMatchingResourcePatternResolver().getResources("classpath*:diagram/icons/*.svg").length);Set<String> ids=new HashSet<>();int attributed=0;
    for(var item:icons.all()){
      String id=item.path("id").asText();assertTrue(ids.add(id));assertTrue(Set.of("CC0-1.0","CC-BY-4.0").contains(item.path("license").asText()));if(item.path("license").asText().equals("CC-BY-4.0"))attributed++;
      assertFalse(item.at("/name/en").asText().isBlank());assertTrue(item.at("/name/zh").asText().codePoints().anyMatch(c->Character.UnicodeScript.of(c)==Character.UnicodeScript.HAN));assertFalse(item.path("author").asText().isBlank());assertTrue(item.path("source_url").asText().contains("/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/"));assertTrue(item.path("modified").asBoolean());
      String svg=icons.svg(id);assertFalse(svg.contains("\r"),id);assertEquals(svg,SvgSanitizer.sanitize(svg),id);assertEquals(item.path("sha256").asText(),HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(svg.getBytes(StandardCharsets.UTF_8))),id);
      assertFalse(svg.matches("(?s).*<(script|foreignObject|image|iframe)\\b.*"));
    }
    assertEquals(BuiltinIconIds.IDS,ids);assertTrue(attributed>0);
    for(String license:List.of("CC0-1.0","CC-BY-4.0"))try(var in=getClass().getResourceAsStream("/diagram/icons/licenses/"+license+".txt")){assertTrue(in.readAllBytes().length>5000);}
  }
  @Test void ccByAttributionIsDeduplicatedAndD9UsesPreviewableOperations(){
    var icon=catalog.icons().all().stream().filter(i->i.path("license").asText().equals("CC-BY-4.0")).findFirst().orElseThrow();var doc=(ObjectNode)catalog.template("workflow","en");var node=(ObjectNode)doc.path("nodes").get(0);node.put("kind","icon").put("icon",icon.path("id").asText());node.remove("glyph");((ObjectNode)doc.path("meta")).put("include_icon_attribution",false);DiagramValidator.validate(doc);
    String attribution=catalog.icons().attribution(doc);assertTrue(attribution.contains(icon.path("author").asText()));assertTrue(attribution.contains("CC BY 4.0"));assertTrue(attribution.contains("modified"));
    var review=new DiagramReviewService(json,catalog,new JournalRules(json));JsonNode issue=null;for(var i:review.review(doc,null,null).path("issues"))if(i.path("rule").asText().equals("D9"))issue=i;assertNotNull(issue);assertTrue(issue.path("fixable").asBoolean());
    var fixed=DiagramOperations.apply(doc,issue.path("fix"));assertTrue(fixed.at("/meta/include_icon_attribution").asBoolean());assertTrue(review.review(fixed,null,null).path("passed").toString().contains("D9"));assertFalse(doc.at("/meta/include_icon_attribution").asBoolean());
  }
}
