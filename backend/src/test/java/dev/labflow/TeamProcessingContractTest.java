package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.team.TeamDraftService;
import dev.labflow.api.ApiException;
import dev.labflow.processing.ProcessingRules;
import dev.labflow.service.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class TeamProcessingContractTest {
  final ObjectMapper json=new ObjectMapper();
  final TeamDraftService drafts=new TeamDraftService(mock(ProcessingService.class),mock(FigureToolService.class),null,json);
  JsonNode properties(){return drafts.processingTools().get(0).at("/function/parameters/properties");}
  @Test void advertisedEnumsMatchTheAcceptedProcessingContract() throws Exception {
    var p=properties();
    assertEquals(Set.of("aggregate","sort"),strings(p.at("/mode/enum")));
    assertEquals(Set.of("sd","sem","none"),strings(p.at("/error/enum")));
    assertEquals(Set.of("include","exclude"),strings(p.at("/missingGroup/enum")));
    assertEquals(Set.of("bars","band"),strings(p.at("/display/enum")));
    assertEquals(Set.of("eq","gte","lte","missing"),strings(p.at("/filters/items/properties/operator/enum")));
    assertEquals(Set.of("asc","desc"),strings(p.at("/sort/items/properties/direction/enum")));
    for(var mode:p.at("/mode/enum"))for(var error:p.at("/error/enum"))for(var missing:p.at("/missingGroup/enum"))for(var display:p.at("/display/enum")){
      var rule=new ProcessingRules(1,mode.asText(),List.of("epoch"),List.of("accuracy"),List.of(),List.of(),missing.asText(),error.asText(),"independent run","","epoch","",display.asText());
      assertDoesNotThrow(()->drafts.rules(json.valueToTree(rule)));
    }
    var invalid=json.valueToTree(new ProcessingRules(1,"passthrough",List.of(),List.of(),List.of(),List.of(),"include","none","","","","","bars"));
    assertThrows(ApiException.class,()->drafts.rules(invalid));
  }
  Set<String> strings(JsonNode a){var result=new HashSet<String>();a.forEach(v->result.add(v.asText()));return result;}
  @Test void allFortyExistingProcessingGoldRulesRemainValidWithoutChangingTheirMeaning() throws Exception {
    var suite=json.readTree(getClass().getResourceAsStream("/agent-eval/team-suite-v1.json"));int n=0;
    for(var item:suite.path("cases"))if(item.has("expected_processing")){var rules=drafts.rules(item.path("expected_processing"));assertEquals(item.path("expected_processing"),json.valueToTree(rules));n++;}
    assertEquals(40,n);
  }
  @Test void feedbackContainsOnlyFixedGuidanceAndTheFullPublicSchema(){
    var feedback=drafts.processingValidationFailure();assertFalse(feedback.path("ok").asBoolean(true));
    assertEquals("invalid_processing_rules",feedback.path("error").asText());
    assertEquals(drafts.processingTools().get(0).at("/function/parameters"),feedback.path("expected_schema"));
    assertTrue(feedback.toString().contains("观测单位"));assertFalse(feedback.has("rows"));
  }
}
