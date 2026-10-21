import { apiContext, readWatermark } from "./test-cleanup";

/** Removes every project the suite created above the watermark recorded in global-setup. */
export default async function globalTeardown() {
  if (process.env.LABFLOW_E2E_KEEP === "1") {
    console.log("[e2e] LABFLOW_E2E_KEEP=1，保留本次测试数据（便于排查失败）");
    return;
  }
  const { watermark } = readWatermark();
  if (!watermark) return;
  const context = await apiContext();
  try {
    const response = await context.delete(`/api/test/projects?after=${watermark}`);
    if (response.status() === 404) {
      console.warn(
        "[e2e] 后端未开启 labflow.test-support，跳过清理；用 scripts/start.ps1 启动后端可开启",
      );
      return;
    }
    if (!response.ok()) {
      console.warn(`[e2e] 清理失败 HTTP ${response.status()}：${await response.text()}`);
      return;
    }
    const body = (await response.json()) as { deleted: number; projects: string[] };
    console.log(
      body.deleted === 0
        ? "[e2e] 没有需要清理的测试项目"
        : `[e2e] 已清理 ${body.deleted} 个测试项目：${body.projects.join("、")}`,
    );
  } finally {
    await context.dispose();
  }
}