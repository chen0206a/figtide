import { test, expect } from "./capture-test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";

// Own a second real JAR and a separate H2 directory. Never restart the user's
// workspace or the outer E2E service. The browser context stays alive throughout.
test("desktop restart retains intro preference and restores the latest unsaved draft", async ({ page }, info) => {
  test.skip(process.env.LABFLOW_DESKTOP_E2E !== "1", "Requires the desktop JAR transport");
  test.setTimeout(180_000);
  const root = path.resolve("..");
  const directory = info.outputPath("desktop-data");
  fs.mkdirSync(directory, { recursive: true });
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java.exe") : "java";
  const children: ChildProcess[] = [];
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  // Stay below Windows' ephemeral range and away from the outer desktop port.
  let port = 17862;
  for (; port < 17962; port++) {
    const probe = net.createServer();
    try { await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve); }); }
    catch { continue; }
    await new Promise<void>(resolve => probe.close(() => resolve()));
    break;
  }
  expect(port).toBeLessThan(17962);
  const base = `http://127.0.0.1:${port}`;
  function start(first: boolean) {
    const fd = fs.openSync(info.outputPath(`desktop-${children.length}.log`), "w");
    const child = spawn(java, ["-Duser.timezone=UTC", "-jar", path.join(root, ".runtime/desktop-build/figtide.jar"),
      "--spring.profiles.active=desktop", `--labflow.data-dir=${directory}`,
      ...(first ? [`--labflow.desktop.port=${port}`] : []),
      "--labflow.desktop.open-browser=false", "--labflow.desktop.tray=false"], {
      cwd: root, windowsHide: true, stdio: ["ignore", fd, fd],
      env: { ...process.env, LABFLOW_AGENT_API_KEY: "", LABFLOW_AGENT_BASE_URL: "http://127.0.0.1:1" },
    });
    fs.closeSync(fd); children.push(child); return child;
  }
  async function ready(child: ChildProcess, previousId = "") {
    let record: { port: number; instance_id: string } | undefined;
    await expect.poll(async () => {
      if (child.exitCode !== null || child.signalCode !== null) throw Error(`Owned desktop process exited: ${child.exitCode ?? child.signalCode}`);
      try {
        record = JSON.parse(fs.readFileSync(path.join(directory, "app.port"), "utf8"));
        if (!record || record.instance_id === previousId) return false;
        const response = await fetch(`http://127.0.0.1:${record.port}/api/desktop/ping`, { signal: AbortSignal.timeout(1000) });
        return response.ok && (await response.json()).instance_id === record.instance_id;
      } catch { return false; }
    }, { timeout: 60_000, intervals: [200, 500] }).toBe(true);
    expect(record!.port).toBe(port);
    return record!;
  }
  async function stop(child: ChildProcess) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill(); await exited;
    }
  }
  try {
    const first = start(true), record = await ready(first);
    const preference = fs.readFileSync(path.join(directory, "desktop.json"), "utf8");
    const project = await (await page.request.post(`${base}/api/projects`, { data: { name: "Desktop restart synthetic test", description: "Test only" } })).json();
    const dataset = await (await page.request.post(`${base}/api/projects/${project.id}/datasets`, {
      multipart: { file: { name: "restart.csv", mimeType: "text/csv", buffer: Buffer.from("epoch,accuracy\n1,0.700\n2,0.800\n3,0.900") } },
    })).json();
    // Do not install an init script: the second page load must read what the first
    // launch actually persisted, rather than re-seeding the preference in the test.
    await page.goto(`${base}/welcome`);
    await page.evaluate(() => localStorage.setItem("labflow-intro-seen", "1"));
    const editor = `${base}/projects/${project.id}/figures/new?dataset=${dataset.id}`;
    await page.goto(editor);
    await page.getByRole("button", { name: "外观", exact: true }).click();
    await page.getByLabel("图表标题", { exact: true }).fill("Unsaved across real JAR restart");
    await expect(page.getByText("本机草稿已保存", { exact: true })).toBeVisible();
    const key = `labflow-draft-v1:${project.id}:new-${dataset.id}`;
    const draft = await page.evaluate(key => localStorage.getItem(key), key);
    expect(JSON.parse(draft!).config.style.title).toBe("Unsaved across real JAR restart");
    expect(await (await page.request.get(`${base}/api/projects/${project.id}/charts`)).json()).toEqual([]);
    await stop(first);
    const second = start(false);
    await ready(second, record.instance_id);
    expect(fs.readFileSync(path.join(directory, "desktop.json"), "utf8")).toBe(preference);
    await page.reload();
    await expect(page).toHaveURL(editor);
    await expect(page.locator(".editor-body")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The inspector state is sessionStorage-backed and survives in the same tab.
    await expect(page.getByLabel("图表标题", { exact: true })).toHaveValue("Unsaved across real JAR restart");
    expect(await page.evaluate(() => localStorage.getItem("labflow-intro-seen"))).toBe("1");
    const restored = JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!);
    const original = JSON.parse(draft!);
    // Restoring a draft may refresh its at timestamp; all editable content must match.
    expect({ config: restored.config, name: restored.name, revision: restored.revision }).toEqual({
      config: original.config, name: original.name, revision: original.revision,
    });
    expect(await (await page.request.get(`${base}/api/projects/${project.id}/charts`)).json()).toEqual([]);
    // Visiting the entry point must now enter the workspace without the introduction.
    await page.goto(base + "/");
    await expect(page.locator(".home")).toBeVisible();
    await expect(page).not.toHaveURL(/\/welcome/);
  } finally {
    for (const child of children) await stop(child);
  }
});
