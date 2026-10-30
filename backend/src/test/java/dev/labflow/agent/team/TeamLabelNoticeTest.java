package dev.labflow.agent.team;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class TeamLabelNoticeTest {
  final ObjectMapper json=new ObjectMapper();
  @Test void warnsForChangedMetricWithAnUnchangedLabelWithoutRewritingIt() throws Exception {
    var before=json.readTree("{\"axes\":{\"y\":{\"title\":\"Accuracy\"}},\"series\":[{\"id\":\"s1\",\"name\":\"Accuracy\",\"y\":\"accuracy\"}]}");
    var after=json.readTree("{\"axes\":{\"y\":{\"title\":\"Accuracy\"}},\"series\":[{\"id\":\"s1\",\"name\":\"Accuracy\",\"y\":\"latency\"}]}");
    assertTrue(TeamLabelNotice.forMappingChange(before,after).contains("请核对"));
    assertEquals("Accuracy",after.at("/series/0/name").asText());
    assertEquals("",TeamLabelNotice.forMappingChange(before,before));
    var renamed=json.readTree("{\"axes\":{\"y\":{\"title\":\"Latency\"}},\"series\":[{\"id\":\"s1\",\"name\":\"Latency\",\"y\":\"latency\"}]}");
    assertEquals("",TeamLabelNotice.forMappingChange(before,renamed));
  }
  @Test void warnsIfTheXMappingChangesWhileItsTitleIsKept() throws Exception {
    var before=json.readTree("{\"x\":\"epoch\",\"axes\":{\"x\":{\"title\":\"Epoch\"}},\"series\":[]}");
    var after=json.readTree("{\"x\":\"time\",\"axes\":{\"x\":{\"title\":\"Epoch\"}},\"series\":[]}");
    assertTrue(TeamLabelNotice.forMappingChange(before,after).contains("请核对"));
    var relabeled=json.readTree("{\"x\":\"time\",\"axes\":{\"x\":{\"title\":\"Time\"}},\"series\":[]}");
    assertEquals("",TeamLabelNotice.forMappingChange(before,relabeled));
  }
}
