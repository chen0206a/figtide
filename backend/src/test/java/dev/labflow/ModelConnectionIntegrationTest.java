package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.ModelConnections;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:mysql://127.0.0.1:33316/labflow_test?serverTimezone=UTC",
      "LABFLOW_AGENT_MODEL=",
      "LABFLOW_AGENT_BASE_URL=http://127.0.0.1:1",
      "labflow.test-support=false"
    })
@AutoConfigureMockMvc
class ModelConnectionIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired ModelConnections connections;

  ObjectNode input() {
    return json.createObjectNode()
        .put("revision", connections.view().path("revision").asLong())
        .put("base_url", "https://fixture.example/v1")
        .put("model", "fixture-model")
        .put("api_key", "fixture.private-key.123")
        .put("keep_key", false);
  }

  @Test
  void configureAndReadNeverReturnKeysAndRequireLocalExplicitWriteHeader() throws Exception {
    var input = input();
    mvc.perform(
            put("/api/agent/connection").contentType("application/json").content(input.toString()))
        .andExpect(status().isForbidden());
    mvc.perform(
            put("/api/agent/connection")
                .header("X-LabFlow-Connection", "1")
                .header("Origin", "https://outside.example")
                .contentType("application/json")
                .content(input.toString()))
        .andExpect(status().isForbidden());
    mvc.perform(
            put("/api/agent/connection")
                .header("X-LabFlow-Connection", "1")
                .with(
                    r -> {
                      r.setRemoteAddr("10.0.0.2");
                      return r;
                    })
                .contentType("application/json")
                .content(input.toString()))
        .andExpect(status().isForbidden());
    var saved =
        mvc.perform(
                put("/api/agent/connection")
                    .header("X-LabFlow-Connection", "1")
                    .contentType("application/json")
                    .content(input.toString()))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertFalse(saved.contains("fixture.private-key"));
    var read =
        mvc.perform(get("/api/agent/connection"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertFalse(read.contains("fixture.private-key"));
    assertTrue(json.readTree(read).path("has_key").asBoolean());
    mvc.perform(
            put("/api/agent/connection")
                .header("X-LabFlow-Connection", "1")
                .contentType("application/json")
                .content(input.toString()))
        .andExpect(status().isConflict());
  }

  @Test
  void malformedAddressAndMissingTestConsentCannotLeakInputsOrMakeModelRequests() throws Exception {
    var bad = input().put("base_url", "https://user:fixture.private-key.123@example.com/v1");
    var response =
        mvc.perform(
                put("/api/agent/connection")
                    .header("X-LabFlow-Connection", "1")
                    .contentType("application/json")
                    .content(bad.toString()))
            .andExpect(status().isBadRequest())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertFalse(response.contains("fixture.private-key"));
    mvc.perform(
            post("/api/agent/connection/test")
                .header("X-LabFlow-Connection", "1")
                .contentType("application/json")
                .content(input().put("allow_test", false).toString()))
        .andExpect(status().isBadRequest());
  }
}
