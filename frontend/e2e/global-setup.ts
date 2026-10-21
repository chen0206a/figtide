import { apiContext, writeWatermark } from "./test-cleanup";

/**
 * Records how many projects the user already has. Everything created above this id during the run
 * is removed in global-teardown, so a test run cannot leave 400 projects behind.
 */
export default async function globalSetup() {
  const context = await apiContext();
  try {
    const response = await context.get("/api/projects");
    if (!response.ok()) {
      console.warn(`[e2e] 读取项目列表失败（HTTP ${response.status()}），本次运行跳过自动清理`);
      writeWatermark({ watermark: null });
      return;
    }
    const projects = (await response.json()) as { id: number }[];
    const watermark = projects.reduce((max, project) => Math.max(max, project.id), 0);
    writeWatermark({ watermark });
    console.log(`[e2e] 清理水位：运行结束后删除 id > ${watermark} 的项目`);
  } catch (error) {
    console.warn(`[e2e] 后端不可达，本次运行跳过自动清理：${String(error)}`);
    writeWatermark({ watermark: null });
  } finally {
    await context.dispose();
  }
}