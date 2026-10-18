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
        .body(Map.of("message", "文件不得超过 10 MB", "code", "FILE_TOO_LARGE"));
  }

  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    HttpMessageNotReadableException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
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
}
