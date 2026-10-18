package dev.labflow.api;

public class ApiException extends RuntimeException {
  public final int status;

  public ApiException(int status, String message) {
    super(message);
    this.status = status;
  }

  public static ApiException bad(String m) {
    return new ApiException(400, m);
  }
}
