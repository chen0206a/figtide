package dev.labflow.review;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.api.ApiException;
import org.junit.jupiter.api.Test;
class RenderFactsTest {
  final ObjectMapper json=new ObjectMapper();
  ObjectNode facts() throws Exception {return (ObjectNode)json.readTree("{\"version\":1,\"canvas\":{\"width\":760,\"height\":500},\"plot\":{\"x\":0,\"y\":0,\"width\":760,\"height\":500},\"texts\":[],\"points\":[],\"bands\":[]}");}
  @Test void rejectsUnknownNestedFieldsAndNonGeometricData() throws Exception {
    var f=facts();assertEquals(f,RenderFacts.validate(f));f.put("filename","private.csv");assertThrows(ApiException.class,()->RenderFacts.validate(f));
    f.remove("filename");((ObjectNode)f.path("plot")).put("label","private");assertThrows(ApiException.class,()->RenderFacts.validate(f));
    ((ObjectNode)f.path("plot")).remove("label");((ObjectNode)f.path("canvas")).put("width",Double.NaN);assertThrows(ApiException.class,()->RenderFacts.validate(f));
  }
  @Test void rejectsAllCollectionOverflowsAndPerTraceOverflow() throws Exception {
    for(String field:new String[]{"texts","points","bands"}){
      var f=facts();var array=(ArrayNode)f.path(field);int max=field.equals("texts")?300:field.equals("points")?3000:20;
      for(int i=0;i<=max;i++)array.addObject();assertThrows(ApiException.class,()->RenderFacts.validate(f),field);
    }
    var f=facts();for(int i=0;i<201;i++)((ArrayNode)f.path("points")).addObject().put("trace",0).put("x",i).put("y",i);
    assertThrows(ApiException.class,()->RenderFacts.validate(f));
    assertNull(RenderFacts.validate(null));
  }
}
