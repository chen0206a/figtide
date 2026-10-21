package dev.labflow.api;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class Errors {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<?> domain(ApiException e) {
    return ResponseEntity.status(e.status)
        .body(Map.of("message", e.getMessage(), "code", "REQUEST_" + e.status));
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<?> size(Exception e) {
    return ResponseEntity.status(413)
        .body(
            Map.of("message", "请求超过大小限制：备份最大 64 MiB，CSV/XLSX 最大 10 MiB", "code", "FILE_TOO_LARGE"));
  }

  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    HttpMessageNotReadableException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class,
    org.springframework.web.multipart.support.MissingServletRequestPartException.class
  })
  ResponseEntity<?> invalid(Exception e) {
    return ResponseEntity.badRequest()
        .body(Map.of("message", "输入格式不正确，请检查名称、JSON 和必填字段", "code", "INVALID_INPUT"));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> other(Exception e) {
    org.slf4j.LoggerFactory.getLogger(Errors.class).error("Request failed", e);
    return ResponseEntity.internalServerError()
        .body(Map.of("message", "服务暂时无法完成请求，请检查服务日志后重试", "code", "INTERNAL_ERROR"));
  }

  @ExceptionHandler({
    org.springframework.web.servlet.resource.NoResourceFoundException.class,
    org.springframework.web.servlet.NoHandlerFoundException.class
  })
  ResponseEntity<?> missing(Exception e) {
    return ResponseEntity.status(404)
        .body(Map.of("message", "接口或资源不存在", "code", "RESOURCE_NOT_FOUND"));
  }

  @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
  ResponseEntity<?> method(Exception e) {
    return ResponseEntity.status(405)
        .body(Map.of("message", "此接口不支持该请求方法", "code", "METHOD_NOT_ALLOWED"));
  }
}
