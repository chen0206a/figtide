package dev.labflow.desktop;

/** Test-only subprocess entry: stdin requests the same graceful close path as the tray. */
public class LauncherProcessProbe {
  public static void main(String[] args) throws Exception {
    dev.labflow.LabFlowApplication.main(args);
    if (DesktopLauncher.isRunning()) {
      System.in.read();
      DesktopLauncher.shutdown();
    }
  }
}
