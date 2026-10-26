package dev.labflow.desktop;

import java.awt.*;
import java.net.URI;
import java.nio.file.*;
import javax.imageio.ImageIO;

/** OS affordances are separate from lifecycle/locks so headless tests never invoke them. */
final class DesktopUi {
  private TrayIcon tray;

  static void browse(URI uri) {
    try {
      if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
        Desktop.getDesktop().browse(uri); return;
      }
    } catch (Exception | AWTError ignored) { }
    if (System.getProperty("os.name", "").startsWith("Windows")) {
      try { new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", uri.toASCIIString()).start(); return; }
      catch (Exception ignored) { }
    }
    System.err.println("请在浏览器打开 " + uri);
  }

  private static void folder(Path path) {
    try { Desktop.getDesktop().open(path.toFile()); }
    catch (Exception | AWTError ignored) { System.err.println("请打开文件夹：" + path); }
  }

  void show(DesktopInstance instance, DesktopPaths paths, Runnable quit, boolean temporaryPort,
      DesktopWindow window, boolean upgradeNotice) {
    try {
      if (!SystemTray.isSupported()) { System.err.println("系统托盘不可用；关闭进程前请正常退出服务。"); return; }
      EventQueue.invokeAndWait(() -> {
        try {
          var system = SystemTray.getSystemTray();
          String resource = system.getTrayIconSize().height <= 16 ? "/desktop-icons/favicon-16.png" : "/desktop-icons/favicon-32.png";
          try (var stream = DesktopUi.class.getResourceAsStream(resource)) {
            Image image = ImageIO.read(stream);
            var menu = new PopupMenu();
            item(menu, "打开 FigTide", () -> {
              var opened = window.open(instance.uri());
              if (opened.fallback()) System.err.println("独立窗口退回浏览器：" + opened.reason());
            });
            item(menu, "在浏览器中打开", () -> browse(instance.uri()));
            item(menu, "打开数据文件夹", () -> folder(paths.data()));
            item(menu, "打开日志文件夹", () -> folder(paths.logs()));
            menu.addSeparator();
            item(menu, "退出", () -> new Thread(quit, "figtide-exit").start());
            tray = new TrayIcon(image, "FigTide 图汐", menu); tray.setImageAutoSize(true);
            tray.addActionListener(event -> {
              var opened = window.open(instance.uri());
              if (opened.fallback()) System.err.println("独立窗口退回浏览器：" + opened.reason());
            });
            system.add(tray);
            Path notice = paths.data().resolve(".tray-notice-shown");
            if (temporaryPort) {
              tray.displayMessage("FigTide 端口提示", DesktopPort.FALLBACK_NOTICE, TrayIcon.MessageType.WARNING);
            } else if (upgradeNotice) {
              // 16-3：从 0.2.0 升级后首次启动提示一次；旧草稿留在默认浏览器里。
              tray.displayMessage("FigTide 打开方式升级", "FigTide 现在在独立窗口中打开。如果之前在浏览器里有未保存的草稿，"
                  + "可以从托盘「在浏览器中打开」找回。", TrayIcon.MessageType.INFO);
            } else if (!Files.exists(notice)) {
              tray.displayMessage("FigTide 正在运行", "关闭窗口不会退出，可以从托盘图标退出", TrayIcon.MessageType.INFO);
              Files.writeString(notice, "1");
            }
          }
        } catch (Exception e) { System.err.println("托盘初始化失败；服务仍在运行。"); }
      });
    } catch (Exception | AWTError ignored) { System.err.println("系统托盘不可用；服务仍在运行。"); }
  }

  /** 供启动流程在独立窗口退回浏览器时通过托盘气泡说明原因。 */
  void notice(String title, String message, TrayIcon.MessageType type) {
    if (tray == null) return;
    try { EventQueue.invokeAndWait(() -> tray.displayMessage(title, message, type)); }
    catch (Exception | AWTError ignored) { }
  }

  private void item(PopupMenu menu, String title, Runnable action) {
    var item = new MenuItem(title); item.addActionListener(event -> action.run()); menu.add(item);
  }

  void close() {
    if (tray != null) { SystemTray.getSystemTray().remove(tray); tray = null; }
  }
}
