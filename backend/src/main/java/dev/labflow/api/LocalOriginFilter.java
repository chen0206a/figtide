package dev.labflow.api;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Loopback is a deployment boundary, not authentication. Block browser cross-site writes. */
@Component
public class LocalOriginFilter extends OncePerRequestFilter {
  @Value("${labflow.frontend-origin:http://127.0.0.1:5176}")
  private String frontendOrigin;

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String origin = request.getHeader("Origin");
    if (!Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod())
        && origin != null
        && !Set.of(
                "http://127.0.0.1:5176",
                "http://localhost:5176",
                "http://127.0.0.1:8086",
                "http://localhost:8086")
            .contains(origin)
        && !origin.equals(frontendOrigin)) {
      response.setStatus(403);
      response.setContentType("application/json;charset=UTF-8");
      response.getWriter().write("{\"code\":\"ORIGIN_DENIED\",\"message\":\"拒绝非本地工作台来源\"}");
      return;
    }
    chain.doFilter(request, response);
  }
}
