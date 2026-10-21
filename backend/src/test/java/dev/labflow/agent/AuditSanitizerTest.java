package dev.labflow.agent;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.Test;

class AuditSanitizerTest {
  final ObjectMapper json = new ObjectMapper();

  @Test
  void dataTextUnknownArgumentsRowsAndSamplesAreNeverKept() throws Exception {
    var args =
        AuditSanitizer.arguments(
            "set_style",
            json.readTree(
                "{\"title\":\"private title\",\"fontSize\":18,\"api_key\":\"private-key\"}"));
    assertEquals(18, args.path("fontSize").asInt());
    assertTrue(args.at("/title/redacted").asBoolean());
    assertFalse(args.toString().contains("private"));
    assertFalse(args.toString().contains("api_key"));
    var profile =
        AuditSanitizer.result(
            "get_dataset_profile",
            json.readTree(
                "{\"head\":[{\"secret\":42}],\"fields\":[{\"name\":\"private-column\",\"samples\":[\"private-sample\"],\"type\":\"number\",\"min\":1234567,\"max\":9876543,\"missing\":0}]}"));
    for (String forbidden :
        new String[] {"private-column", "private-sample", "head", "1234567", "9876543"})
      assertFalse(profile.toString().contains(forbidden));
  }

  @Test
  void explicitNotesScrubKnownAndCommonCredentialFormsBeforeTruncation() {
    String note =
        AuditSanitizer.note(
            "原因 my-real-secret api_key=abc Bearer def sk-private123", "my-real-secret");
    assertTrue(note.contains("原因"));
    for (String secret : new String[] {"my-real-secret", "abc", "def", "sk-private123"})
      assertFalse(note.contains(secret));
    assertEquals(500, AuditSanitizer.note("x".repeat(1000), "").length());
  }

  @Test
  void configFingerprintIsIndependentOfObjectKeyOrder() throws Exception {
    assertEquals(
        AuditSanitizer.hash(json.readTree("{\"b\":2,\"a\":1}")),
        AuditSanitizer.hash(json.readTree("{\"a\":1,\"b\":2}")));
  }

  @Test
  void quotedCredentialsAndUrlPasswordsAreScrubbed() {
    var result =
        AuditSanitizer.note(
            "{\"api_key\":\"quoted-secret\"} https://user:url-password@host/path", "");
    assertFalse(result.contains("quoted-secret"));
    assertFalse(result.contains("url-password"));
    assertTrue(result.contains("已脱敏"));
  }
}
