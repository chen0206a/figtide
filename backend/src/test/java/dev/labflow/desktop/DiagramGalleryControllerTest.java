package dev.labflow.desktop;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class DiagramGalleryControllerTest {
  @Test void opensOnlyTheFixedDestinationAfterAnExplicitAction(){
    var calls=new ArrayList<URI>();var controller=new DiagramGalleryController(calls::add);assertTrue(calls.isEmpty());
    controller.open(new ObjectMapper().createObjectNode());assertEquals(List.of(DiagramGalleryController.GALLERY),calls);
    assertThrows(dev.labflow.api.ApiException.class,()->controller.open(new ObjectMapper().createObjectNode().put("url","https://example.com")));assertEquals(1,calls.size());
  }
}
