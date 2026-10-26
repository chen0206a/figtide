package dev.labflow.desktop;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Map;

/** Loaded externally by the probe, never included in the distributed application. */
public final class DesktopWindowProbeMain {
  private DesktopWindowProbeMain() {}

  public static void main(String[] args) {
    var env = System.getenv();
    DesktopLauncher.launch(args, (mode, data) -> new DesktopWindow(mode, data, env,
        () -> DesktopWindow.findEdge(env), command -> {
          if (command.stream().anyMatch(value -> value.contains("remote-debugging")))
            throw new IllegalStateException("Production command contains a debugging option");
          var probeCommand = new ArrayList<>(command);
          probeCommand.add("--remote-debugging-port=0");
          Process process = new ProcessBuilder(probeCommand).start();
          String message = "FIGTIDE_WINDOW_PROBE_START " + new ObjectMapper().writeValueAsString(
              Map.of("edge_pid", process.pid(), "edge_args", probeCommand,
                  "edge", command.getFirst(), "launcher", "DesktopLauncher.launch -> DesktopWindow.open")) + "\n";
          System.out.write(message.getBytes(StandardCharsets.UTF_8));
          System.out.flush();
          return process;
        }, (uri, reason) -> {
          throw new IllegalStateException("Window probe unexpectedly fell back: " + reason);
        }));
  }
}
