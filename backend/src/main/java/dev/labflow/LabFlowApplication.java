package dev.labflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class LabFlowApplication {
  public static void main(String[] args) {
    java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));
    if (dev.labflow.desktop.DesktopLauncher.enabled(args)) {
      dev.labflow.desktop.DesktopLauncher.launch(args);
    } else SpringApplication.run(LabFlowApplication.class, args);
  }
}
