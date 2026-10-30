package dev.labflow.eval;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class ProcessingRuleAssessmentTest {
  final ObjectMapper json=new ObjectMapper();
  @Test void translationIsMarkedForHumanReviewRatherThanAutomaticPass() throws Exception {
    var expected=json.readTree("{\"mode\":\"aggregate\",\"error\":\"sem\",\"observationUnit\":\"independent run\"}");
    var actual=json.readTree("{\"mode\":\"aggregate\",\"error\":\"sem\",\"observationUnit\":\"独立重复\"}");
    var result=ProcessingRuleAssessment.assess(expected,actual,true,true,true);
    assertTrue(result.structuralMatch());assertEquals("review",result.observationUnitStatus());
    var missing=json.readTree("{\"mode\":\"aggregate\",\"error\":\"sem\",\"observationUnit\":\"\"}");
    assertEquals("missing",ProcessingRuleAssessment.assess(expected,missing,true,true,true).observationUnitStatus());
    var contradiction=json.readTree("{\"mode\":\"aggregate\",\"error\":\"sem\",\"observationUnit\":\"非独立重复\"}");
    assertEquals("review",ProcessingRuleAssessment.assess(expected,contradiction,true,true,true).observationUnitStatus());
    assertEquals("exact",ProcessingRuleAssessment.assess(expected,expected,true,true,true).observationUnitStatus());
  }
  @Test void alteredRulesOrFailedSourcePreviewOrDataNeverPassStructuralCheck() throws Exception {
    var e=json.readTree("{\"mode\":\"aggregate\",\"error\":\"sem\",\"observationUnit\":\"run\"}");
    var wrong=json.readTree("{\"mode\":\"aggregate\",\"error\":\"sd\",\"observationUnit\":\"run\"}");
    assertFalse(ProcessingRuleAssessment.assess(e,wrong,true,true,true).structuralMatch());
    assertFalse(ProcessingRuleAssessment.assess(e,e,false,true,true).structuralMatch());
    assertFalse(ProcessingRuleAssessment.assess(e,e,true,false,true).structuralMatch());
    assertFalse(ProcessingRuleAssessment.assess(e,e,true,true,false).structuralMatch());
    assertFalse(ProcessingRuleAssessment.assess(e,json.nullNode(),true,true,true).structuralMatch());
  }
}
