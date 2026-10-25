package dev.labflow.desktop;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 任务 16-4.1：Edge 查找、启动参数拼装、退回浏览器、browser 配置。 */
class DesktopWindowTest {
  @TempDir Path temp;

  private static final URI URI_ = URI.create("http://127.0.0.1:17861/");

  private Path fakeEdge(String dir) throws IOException {
    Path parent = Files.createDirectories(temp.resolve(dir));
    Path edge = parent.resolve("msedge.exe");
    Files.writeString(edge, "not a real executable");
    return edge;
  }

  // ---- Edge 查找 ----

  @Test void registryLookupWinsWhenTheValuePointsToARealFile() throws IOException {
    Path edge = fakeEdge("reg");
    String output = "\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe\n"
        + "    (默认)    REG_SZ    " + edge + "\n";
    var found = DesktopWindow.findEdge(Map.of("ProgramFiles", temp.resolve("missing").toString()),
        key -> key.startsWith("HKLM") ? output : null);
    assertEquals(Optional.of(edge), found);
  }

  @Test void registryValueWithoutAFileFallsThroughToProgramDirectories() throws IOException {
    Path edge = fakeEdge("Program Files/Microsoft/Edge/Application");
    String stale = "    (Default)    REG_SZ    C:\\gone\\msedge.exe\n";
    var found = DesktopWindow.findEdge(Map.of("ProgramFiles", temp.resolve("Program Files").toString()),
        key -> key.startsWith("HKLM") ? stale : null);
    assertEquals(Optional.of(edge), found);
  }

  @Test void hkcuIsConsultedWhenHklmHasNoAnswer() throws IOException {
    Path edge = fakeEdge("hkcu");
    String output = "    (默认)    REG_SZ    " + edge + "\n";
    var found = DesktopWindow.findEdge(Map.of(), key -> key.startsWith("HKCU") ? output : null);
    assertEquals(Optional.of(edge), found);
  }

  @Test void programDirectoryOrderPrefersX86AndSkipsMissingCandidates() throws IOException {
    Path x86 = fakeEdge("x86/Microsoft/Edge/Application");
    assertEquals(List.of(
            x86,
            temp.resolve("regular").resolve("Microsoft").resolve("Edge").resolve("Application").resolve("msedge.exe")),
        DesktopWindow.candidatePaths(Map.of("ProgramFiles(x86)", temp.resolve("x86").toString(),
            "ProgramFiles", temp.resolve("regular").toString())));
    assertTrue(DesktopWindow.candidatePaths(Map.of()).isEmpty());
    assertTrue(DesktopWindow.candidatePaths(Map.of("ProgramFiles", " ")).isEmpty());
  }

  @Test void registryParsingIsLocaleIndependentAndRejectsNoise() {
    assertEquals(Optional.of(Path.of("C:\\Edge\\msedge.exe")),
        DesktopWindow.parseRegQuery("    (Default)    REG_SZ    C:\\Edge\\msedge.exe\r\n"));
    assertEquals(Optional.of(Path.of("C:\\Edge\\msedge.exe")),
        DesktopWindow.parseRegQuery("    (默认)    REG_SZ    \"C:\\Edge\\msedge.exe\"\n"));
    assertTrue(DesktopWindow.parseRegQuery("HKEY_LOCAL_MACHINE\\...msedge.exe\r\n    (默认)    REG_DWORD    0x1\r\n").isEmpty());
    assertTrue(DesktopWindow.parseRegQuery("    (默认)    REG_SZ\r\n").isEmpty());
    assertTrue(DesktopWindow.parseRegQuery((String) null).isEmpty());
  }

  // ---- 启动参数拼装 ----

  @Test void appCommandAssemblesExactArgumentsIncludingChineseAndSpacePaths() {
    Path edge = Path.of("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    Path userData = Path.of("C:\\用户 数据\\FigTide\\window");
    var command = DesktopWindow.command(edge, URI_, userData);
    assertEquals(List.of(
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "--app=http://127.0.0.1:17861/",
        "--user-data-dir=C:\\用户 数据\\FigTide\\window",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,900"), command);
    // 调试端口只允许出现在测试探针里，正式启动绝不能带。
    assertTrue(command.stream().noneMatch(part -> part.contains("remote-debugging")));
    assertEquals(6, command.size());
  }

  @Test void userDataDirSitsBesideTheDataDirectory() {
    var window = new DesktopWindow(DesktopWindow.Mode.APP, temp.resolve("中文 空间/data"), Map.of());
    assertEquals(temp.resolve("中文 空间/window"), window.userDataDir());
  }

  // ---- open() 行为 ----

  @Test void appModeStartsTheWindowWhenEdgeIsFound() throws IOException {
    Path edge = fakeEdge("edge");
    List<List<String>> launched = new ArrayList<>();
    List<URI> browsed = new ArrayList<>();
    var window = new DesktopWindow(DesktopWindow.Mode.APP, temp.resolve("data"), Map.of(),
        () -> Optional.of(edge), command -> { launched.add(command); return null; },
        (uri, reason) -> browsed.add(uri));
    var opened = window.open(URI_);
    assertFalse(opened.fallback());
    assertEquals(List.of(DesktopWindow.command(edge, URI_, window.userDataDir())), launched);
    assertTrue(browsed.isEmpty());
  }

  @Test void missingEdgeFallsBackToTheDefaultBrowser() {
    List<URI> browsed = new ArrayList<>();
    var window = new DesktopWindow(DesktopWindow.Mode.APP, temp.resolve("data"), Map.of(),
        Optional::empty, command -> { throw new AssertionError("不应启动 Edge"); },
        (uri, reason) -> browsed.add(uri));
    var opened = window.open(URI_);
    assertTrue(opened.fallback());
    assertTrue(opened.reason().contains("Edge"));
    assertEquals(List.of(URI_), browsed);
  }

  @Test void edgeLaunchFailureFallsBackWithTheFailureReason() throws IOException {
    Path edge = fakeEdge("edge");
    List<URI> browsed = new ArrayList<>();
    var window = new DesktopWindow(DesktopWindow.Mode.APP, temp.resolve("data"), Map.of(),
        () -> Optional.of(edge),
        command -> { throw new IOException("CreateProcess error=193"); },
        (uri, reason) -> browsed.add(uri));
    var opened = window.open(URI_);
    assertTrue(opened.fallback());
    assertTrue(opened.reason().contains("CreateProcess error=193"));
    assertEquals(List.of(URI_), browsed);
  }

  @Test void browserModeNeverLooksForEdge() {
    List<URI> browsed = new ArrayList<>();
    var window = new DesktopWindow(DesktopWindow.Mode.BROWSER, temp.resolve("data"), Map.of(),
        () -> { throw new AssertionError("browser 模式不应查找 Edge"); },
        command -> { throw new AssertionError("browser 模式不应启动 Edge"); },
        (uri, reason) -> browsed.add(uri));
    var opened = window.open(URI_);
    assertTrue(opened.fallback());
    assertTrue(opened.reason().contains("browser"));
    assertEquals(List.of(URI_), browsed);
  }

  @Test void modeOptionValidatesValues() {
    assertEquals(DesktopWindow.Mode.APP, DesktopWindow.mode(null));
    assertEquals(DesktopWindow.Mode.APP, DesktopWindow.mode("app"));
    assertEquals(DesktopWindow.Mode.BROWSER, DesktopWindow.mode("BROWSER"));
    assertThrows(IllegalArgumentException.class, () -> DesktopWindow.mode("nope"));
    assertThrows(IllegalArgumentException.class, () -> DesktopWindow.mode(""));
  }
}
