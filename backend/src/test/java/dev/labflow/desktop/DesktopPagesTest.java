package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class DesktopPagesTest {
  private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new DesktopPages()).build();

  @Test void rootAndDeepLinksReturnUncachedIndex() throws Exception {
    for (String path : new String[]{"/", "/welcome", "/projects/3/figures/7"})
      mvc.perform(get(path)).andExpect(status().isOk())
          .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
          .andExpect(header().string("Cache-Control", "no-cache"))
          .andExpect(content().string(org.hamcrest.Matchers.containsString("desktop-test-index")));
  }

  @Test void hashedAssetsHaveLongCacheAndMissingAssetsAre404() throws Exception {
    byte[] expected = new ClassPathResource("desktop-static/assets/test-12345678.js").getContentAsByteArray();
    assertTrue(expected.length > 0, "The static asset fixture must not be empty");
    mvc.perform(get("/assets/test-12345678.js")).andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "max-age=31536000, public, immutable"))
        .andExpect(content().bytes(expected));
    mvc.perform(get("/assets/missing.js")).andExpect(status().isNotFound());
  }

  @Test void unknownApisStayJson404InsteadOfServingTheSpa() throws Exception {
    mvc.perform(get("/api/missing")).andExpect(status().isNotFound())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
  }

  @Test void pagesAreNotRegisteredInTheDefaultProfile() {
    try (var context = new AnnotationConfigApplicationContext()) {
      context.register(DesktopPages.class); context.refresh();
      assertTrue(context.getBeansOfType(DesktopPages.class).isEmpty());
    }
    try (var context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles("desktop");
      context.register(DesktopPages.class); context.refresh();
      assertEquals(1, context.getBeansOfType(DesktopPages.class).size());
    }
  }
}
