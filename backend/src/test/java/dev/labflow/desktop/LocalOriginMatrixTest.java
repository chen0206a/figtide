package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.*;

import dev.labflow.api.LocalOriginFilter;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.*;
import org.springframework.test.util.ReflectionTestUtils;

class LocalOriginMatrixTest {
  static Stream<Arguments> matrix() {
    var cases = new ArrayList<Arguments>();
    for (boolean desktop : new boolean[]{false, true})
      for (String method : new String[]{"GET", "POST"})
        for (String host : Arrays.asList("127.0.0.1:49201", "attacker.example:49201", null))
          for (String origin : Arrays.asList("http://127.0.0.1:49201", "http://localhost:49201", "http://127.0.0.1:49202", "https://attacker.example", null))
            cases.add(Arguments.of(desktop, method, host, origin));
    return cases.stream();
  }

  private LocalOriginFilter filter(boolean desktop) {
    var env = new MockEnvironment(); if (desktop) env.setActiveProfiles("desktop");
    var filter = new LocalOriginFilter(env);
    ReflectionTestUtils.setField(filter, "frontendOrigin", "http://127.0.0.1:5178");
    return filter;
  }

  private boolean allowed(boolean desktop, String method, String host, String origin) throws Exception {
    var req = new MockHttpServletRequest(method, "/api/projects");
    req.setLocalPort(49201);
    // Spoofed forwarding headers must not change the port used for the check.
    req.addHeader("X-Forwarded-Port", "49202"); req.addHeader("X-Forwarded-Host", "attacker.example");
    if (host != null) req.addHeader("Host", host);
    if (origin != null) req.addHeader("Origin", origin);
    var response = new MockHttpServletResponse(); var reached = new AtomicBoolean();
    filter(desktop).doFilter(req, response, (request, reply) -> reached.set(true));
    if (!reached.get()) {
      assertEquals(403, response.getStatus()); assertTrue(response.getContentType().startsWith("application/json"));
      assertFalse(response.getContentAsString().contains("attacker.example"));
    }
    return reached.get();
  }

  @ParameterizedTest(name = "desktop={0} {1} Host={2} Origin={3}") @MethodSource("matrix")
  void hostAndOriginMatrix(boolean desktop, String method, String host, String origin) throws Exception {
    boolean expected = !desktop
        ? method.equals("GET") || origin == null
        : "127.0.0.1:49201".equals(host) && (method.equals("GET") || origin == null
            || Set.of("http://127.0.0.1:49201", "http://localhost:49201").contains(origin));
    assertEquals(expected, allowed(desktop, method, host, origin));
  }

  @Test void defaultProfileKeepsAllExistingOriginsAndIgnoresHost() throws Exception {
    for (String origin : new String[]{"http://127.0.0.1:5176", "http://localhost:5176", "http://127.0.0.1:8086", "http://localhost:8086", "http://127.0.0.1:5178"})
      assertTrue(allowed(false, "POST", "unrestricted-dev-host", origin));
  }

  @Test void desktopAcceptsLocalhostButChecksHostForHeadAndOptions() throws Exception {
    assertTrue(allowed(true, "POST", "localhost:49201", "http://localhost:49201"));
    for (String method : new String[]{"HEAD", "OPTIONS"}) {
      assertFalse(allowed(true, method, null, null));
      assertFalse(allowed(true, method, "127.0.0.1:49202", null));
      assertTrue(allowed(true, method, "localhost:49201", "https://attacker.example"));
    }
  }

  @Test void desktopAllowsOriginlessNodePostWithLocalHostForMcp() throws Exception {
    assertTrue(allowed(true, "POST", "127.0.0.1:49201", null));
  }
}
