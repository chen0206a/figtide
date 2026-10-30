package dev.labflow.eval;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.labflow.agent.AuditSanitizer;

/** Separates machine-checkable rules from free-text interpretation; never declares semantic equivalence. */
final class ProcessingRuleAssessment {
  record Result(boolean structuralMatch,String observationUnitStatus) {}
  static Result assess(JsonNode expected,JsonNode actual,boolean sourceMatches,boolean previewVerified,boolean dataMatches){
    if(!expected.isObject()||!actual.isObject())return new Result(false,"missing_rule");
    String expectedUnit=expected.path("observationUnit").asText("");
    String actualUnit=actual.path("observationUnit").asText("");
    String unit=expectedUnit.equals(actualUnit)?"exact":!expectedUnit.isBlank()&&actualUnit.isBlank()?"missing":"review";
    ObjectNode e=((ObjectNode)expected).deepCopy(),a=((ObjectNode)actual).deepCopy();
    e.remove("observationUnit");a.remove("observationUnit");
    return new Result(sourceMatches&&previewVerified&&dataMatches&&AuditSanitizer.hash(e).equals(AuditSanitizer.hash(a)),unit);
  }
}
