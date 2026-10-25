package dev.labflow.desktop;

import dev.labflow.LabFlowApplication;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.boot.web.server.PortInUseException;
import org.slf4j.LoggerFactory;
import org.springframework.context.*;

/** One JVM owns the server and file database. No background child Java process. */
public final class DesktopLauncher {
  private static volatile Runtime active;
  private DesktopLauncher() {}

  public static boolean enabled(String[] args) {
    String profiles = DesktopPaths.option(args, "spring.profiles.active", System.getenv().getOrDefault("SPRING_PROFILES_ACTIVE", ""));
    return Arrays.stream(profiles.split(",")).map(String::trim).anyMatch("desktop"::equals);
  }

  public static void launch(String[] args) {
    try {
      var paths = DesktopPaths.resolve(args, System.getenv(), System.getProperty("user.home"));
      boolean open = Boolean.parseBoolean(DesktopPaths.option(args, "labflow.desktop.open-browser", "true"));
      var window = new DesktopWindow(DesktopWindow.mode(DesktopPaths.option(args, "labflow.desktop.window", "app")),
          paths.data(), System.getenv());
      var acquired = DesktopInstance.acquire(paths.data());
      if (acquired.isEmpty()) {
        for (int i = 0; i < 30; i++) {
          var running = DesktopInstance.running(paths.data());
          if (running.isPresent()) {
            // 再次双击：再开一个应用窗口（Edge 复用同一个 user-data-dir），不启动第二个后端。
            if (open) {
              var opened = window.open(running.get());
              if (opened.fallback()) System.err.println("独立窗口退回浏览器：" + opened.reason());
            }
            System.out.println("FigTide 已在运行：" + running.get()); return;
          }
          Thread.sleep(200);
        }
        throw new IllegalStateException("另一个实例持有数据目录锁，但服务尚未就绪。请稍后重试，勿启动第二个数据库。");
      }
      var instance = acquired.get();
      var runtime = new Runtime(instance);
      Thread hook = new Thread(runtime::close, "figtide-shutdown");
      java.lang.Runtime.getRuntime().addShutdownHook(hook);
      try {
        Files.createDirectories(paths.logs());
        active = runtime;
        var port = DesktopPort.select(paths.data(), args);
        try {
          runtime.context = start(args, paths, instance, port.requested());
        } catch (RuntimeException failure) {
          // Availability checks cannot reserve a Tomcat socket: another process may win
          // the bind race. Spring closes the failed context before this retry.
          if (port.temporary() || !portInUse(failure)) throw failure;
          port = port.fallback();
          runtime.context = start(args, paths, instance, 0);
        }
        if (port.temporary()) LoggerFactory.getLogger(DesktopLauncher.class).warn(
            "{}；首选端口={}，本次端口={}，desktop.json 保持不变", DesktopPort.FALLBACK_NOTICE,
            port.preferred(), instance.uri().getPort());
        if (Boolean.parseBoolean(runtime.context.getEnvironment().getProperty("labflow.desktop.tray", "true")))
          runtime.ui.show(instance, paths, runtime::close, port.temporary(), window);
        if (open) {
          var opened = window.open(instance.uri());
          if (opened.fallback()) {
            LoggerFactory.getLogger(DesktopLauncher.class).warn("独立窗口退回浏览器：{}", opened.reason());
            runtime.ui.notice("FigTide 窗口提示", opened.reason(), java.awt.TrayIcon.MessageType.WARNING);
          }
        }
      } catch (Throwable failure) {
        runtime.close();
        try { java.lang.Runtime.getRuntime().removeShutdownHook(hook); } catch (IllegalStateException ignored) { }
        throw failure;
      }
    } catch (Exception e) { throw new IllegalStateException("FigTide 桌面启动失败：" + e.getMessage(), e); }
  }

  private static ConfigurableApplicationContext start(String[] args, DesktopPaths paths,
      DesktopInstance instance, int port) {
    var effectiveArgs = new ArrayList<String>();
    for (String arg : args)
      if (!arg.startsWith("--server.port=") && !arg.startsWith("--server.address=")) effectiveArgs.add(arg);
    effectiveArgs.add("--server.port=" + port);
    effectiveArgs.add("--server.address=127.0.0.1");
    var app = new SpringApplication(LabFlowApplication.class);
    app.setHeadless(false);
    app.setRegisterShutdownHook(false);
    app.setDefaultProperties(Map.of("labflow.data-dir", paths.data().toString(),
        "labflow.desktop.logs-dir", paths.logs().toString()));
    app.addInitializers(context -> context.getBeanFactory().registerSingleton("desktopInstance", instance));
    app.addListeners((ApplicationListener<WebServerInitializedEvent>) event -> {
      try { instance.publish(event.getWebServer().getPort()); }
      catch (Exception e) { throw new IllegalStateException("无法写入桌面端口文件", e); }
    });
    return app.run(effectiveArgs.toArray(String[]::new));
  }

  private static boolean portInUse(Throwable failure) {
    for (Throwable cause = failure; cause != null; cause = cause.getCause())
      if (cause instanceof PortInUseException || cause instanceof java.net.BindException) return true;
    return false;
  }

  static boolean isRunning() { return active != null && !active.stopped.get(); }
  static void shutdown() { var runtime = active; if (runtime != null) runtime.close(); }

  private static final class Runtime {
    final DesktopInstance instance;
    final DesktopUi ui = new DesktopUi();
    final AtomicBoolean stopped = new AtomicBoolean();
    volatile ConfigurableApplicationContext context;
    Runtime(DesktopInstance instance) { this.instance = instance; }
    void close() {
      if (!stopped.compareAndSet(false, true)) return;
      try {
        if (context != null) context.close(); // Datasource closes before the OS lock is released.
      } finally {
        try { ui.close(); } finally {
          try { instance.close(); } catch (Exception ignored) { System.err.println("桌面锁清理失败，请检查数据目录权限。"); }
          if (active == this) active = null;
        }
      }
    }
  }
}
