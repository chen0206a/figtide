package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.labflow.LabflowIntegrationTest;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 14-1-3：MySQL 版迁移里 updated_at 依赖 ON UPDATE CURRENT_TIMESTAMP(3)，H2 迁移已删除该子句，
 * 由应用在 UPDATE 语句中显式赋值（ExperimentService/WorkspaceService）。本测试验证：
 * 更新后 updated_at 严格变大，且列表排序（ORDER BY updated_at DESC）随之变化。
 * MySQL 下跑一次；14-1-4 引入 LABFLOW_TEST_DB=h2 参数化后，同一用例在 H2 再跑一次。
 */
@LabflowIntegrationTest
@AutoConfigureMockMvc
class UpdatedAtIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  JsonNode request(org.springframework.http.HttpMethod method, String url, Object body)
      throws Exception {
    var perform =
        mvc.perform(
            method == org.springframework.http.HttpMethod.GET
                ? get(url)
                : (method == org.springframework.http.HttpMethod.PUT
                    ? put(url).contentType("application/json")
                        .content(
                            body instanceof String
                                ? body.toString()
                                : json.writeValueAsString(body))
                    : post(url).contentType("application/json")
                        .content(
                            body instanceof String
                                ? body.toString()
                                : json.writeValueAsString(body))));
    return json.readTree(
        perform
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8));
  }

  long project() throws Exception {
    return request(
            org.springframework.http.HttpMethod.POST,
            "/api/projects",
            "{\"name\":\"updated_at integration\",\"description\":\"test\"}")
        .path("id")
        .asLong();
  }

  final byte[] bytes =
      "model,epoch,seed,accuracy\nA,2,1,4\nA,1,1,1\nA,1,2,2\nA,1,3,3\nA,1,4,\nA,2,2,6"
          .getBytes(StandardCharsets.UTF_8);

  JsonNode upload(long p) throws Exception {
    return json.readTree(
        mvc.perform(
                multipart("/api/projects/" + p + "/datasets")
                    .file(new MockMultipartFile("file", "synthetic.csv", "text/csv", bytes)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  String experimentBody(String name) {
    return "{\"name\":\""
        + name
        + "\",\"parameters\":{\"lr\":0.1},\"metrics\":{\"acc\":0.9},\"notes\":\"\"}";
  }

  ObjectNode chartBody(String name, JsonNode config) {
    var body = json.createObjectNode().put("name", name);
    body.set("config", config);
    return body;
  }

  /** 兼容 Jackson 对 Timestamp 的两种序列化形态（epoch 毫秒数字 / 字符串）。 */
  Instant updatedAt(JsonNode row) {
    JsonNode n = row.path("updated_at");
    if (n.isNumber()) return Instant.ofEpochMilli(n.asLong());
    String s = n.asText().trim().replace(' ', 'T');
    LocalDateTime local = LocalDateTime.parse(s.length() > 20 ? s.substring(0, 23) : s);
    return local.toInstant(ZoneOffset.UTC);
  }

  @Test
  void experimentUpdateGrowsUpdatedAtAndReordersList() throws Exception {
    long p = project();
    String root = "/api/projects/" + p;
    var a =
        request(
            org.springframework.http.HttpMethod.POST,
            root + "/experiments",
            experimentBody("exp A"));
    // 1.1 秒余量：即使数据库时钟只精确到秒，更新后的 updated_at 也严格大于更新前
    Thread.sleep(1100);
    var b =
        request(
            org.springframework.http.HttpMethod.POST,
            root + "/experiments",
            experimentBody("exp B"));
    Instant a0 = updatedAt(a), b0 = updatedAt(b);
    assertTrue(!b0.isBefore(a0), "新建实验的 updated_at 不应早于先创建的实验");
    var order = request(org.springframework.http.HttpMethod.GET, root + "/experiments", null);
    assertEquals("exp B", order.get(0).path("name").asText());
    assertEquals("exp A", order.get(1).path("name").asText());
    Thread.sleep(1100);
    var a1 =
        request(
            org.springframework.http.HttpMethod.PUT,
            root + "/experiments/" + a.path("id").asLong(),
            experimentBody("exp A2"));
    assertTrue(updatedAt(a1).isAfter(a0), "更新实验后 updated_at 应严格变大");
    assertTrue(a1.path("revision").asInt() > a.path("revision").asInt(), "revision 应递增");
    order = request(org.springframework.http.HttpMethod.GET, root + "/experiments", null);
    assertEquals("exp A2", order.get(0).path("name").asText());
    assertEquals("exp B", order.get(1).path("name").asText());
  }

  @Test
  void chartUpdateGrowsUpdatedAtAndReordersList() throws Exception {
    long p = project();
    String root = "/api/projects/" + p;
    var version = upload(p);
    var c = (ObjectNode) json.readTree(getClass().getResourceAsStream("/config-v1.json"));
    c.put("datasetVersionId", version.path("id").asLong());
    ((ObjectNode) c.path("series").get(0)).put("y", "accuracy").put("error", "");
    var c1 =
        request(
            org.springframework.http.HttpMethod.POST,
            root + "/charts",
            chartBody("chart one", c));
    Thread.sleep(1100);
    var c2 =
        request(
            org.springframework.http.HttpMethod.POST,
            root + "/charts",
            chartBody("chart two", c));
    Instant c10 = updatedAt(c1);
    var order = request(org.springframework.http.HttpMethod.GET, root + "/charts", null);
    assertEquals("chart two", order.get(0).path("name").asText());
    assertEquals("chart one", order.get(1).path("name").asText());
    Thread.sleep(1100);
    var c1Updated =
        request(
            org.springframework.http.HttpMethod.PUT,
            root + "/charts/" + c1.path("id").asLong(),
            chartBody("chart one v2", c)
                .put("revision", c1.path("revision").asInt()));
    assertTrue(updatedAt(c1Updated).isAfter(c10), "保存图表后 updated_at 应严格变大");
    assertEquals(c1.path("revision").asInt() + 1, c1Updated.path("revision").asInt());
    order = request(org.springframework.http.HttpMethod.GET, root + "/charts", null);
    assertEquals("chart one v2", order.get(0).path("name").asText());
    assertEquals("chart two", order.get(1).path("name").asText());
  }
}
