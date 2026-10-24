# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: processing.spec.ts >> explicit filter and numeric stable sort save as an independent dataset
- Location: e2e\processing.spec.ts:238:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: '数据处理来源', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: '数据处理来源', exact: true }) with timeout 5000ms
  - waiting for getByRole('button', { name: '数据处理来源', exact: true })

```

```yaml
- banner:
  - link "LabFlow":
    - /url: /
  - navigation "主导航":
    - link "项目概览":
      - /url: /
    - link "实验记录":
      - /url: /projects/732/experiments
    - link "数据管理":
      - /url: /projects/732/data?dataset=673
    - link "科研绘图":
      - /url: /projects/732/figures/new
  - text: 本地工作区
  - combobox "当前项目":
    - option "选择项目" [disabled]
    - option "数据排序验收 1792812965796" [selected]
    - option "统计区间验收 1792812962654"
    - option "重复实验汇总验收 1792812956839"
    - option "本地网络验收 1792812953274"
    - option "导航工作台验收 1792812941967"
    - option "动效验收 1792812940935"
    - option "动效验收 1792812938045"
    - option "动效验收 1792812936061"
    - option "模型连接验收 1792812933143"
    - option "隔离验收 B5 1792812929609"
    - option "隔离验收 A5 1792812929552"
    - option "隔离验收 B4 1792812923300"
    - option "隔离验收 A4 1792812923251"
    - option "隔离验收 B3 1792812921939"
    - option "隔离验收 A3 1792812921868"
    - option "隔离验收 B2 1792812918569"
    - option "隔离验收 A2 1792812918503"
    - option "隔离验收 B 1792812916334"
    - option "隔离验收 A 1792812916258"
    - option "介绍页深链接 · 合成演示"
    - option "首页验收 1792812905312"
    - option "首页分页 1792812903725 / 11"
    - option "首页分页 1792812903725 / 10"
    - option "首页分页 1792812903725 / 09"
    - option "首页分页 1792812903725 / 08"
    - option "首页分页 1792812903725 / 07"
    - option "首页分页 1792812903725 / 06"
    - option "首页分页 1792812903725 / 05"
    - option "首页分页 1792812903725 / 04"
    - option "首页分页 1792812903725 / 03"
    - option "首页分页 1792812903725 / 02"
    - option "首页分页 1792812903725 / 01"
    - option "首页分页 1792812903725 / 00"
    - option "首页v2验收 · 合成演示"
    - option "绘图工具验收 1792812900447"
    - option "绘图工具验收 1792812897716"
    - option "绘图工具验收 1792812895930"
    - option "绘图工具验收 1792812893878"
    - option "绘图工具验收 1792812890385"
    - option "绘图工具验收 1792812885617"
    - option "实验关联验收 1792812881345"
    - option "前端体验验收 1792812878749"
    - option "前端体验验收 1792812875984"
    - option "前端体验验收 1792812870867"
    - option "实际区间验收 1792812866330"
    - option "模型评估验收 1792812861514"
    - option "实验记录验收 1792812859826"
    - option "配置交互验收 1792812855183"
    - option "编辑器拆分验收 1792812847266"
    - option "编辑器拆分验收 1792812845191"
    - option "视觉规范验收 · 合成演示"
    - option "热力图 PDF 验收 1792812838373"
    - option "成果恢复验收 679"
    - option "成果交付验收 1792812826168"
    - option "样式清理验收 · 合成演示"
    - option "共同样本 ROC 验收 1792812819480"
    - option "多分类评估验收 1792812812880"
    - option "JSON 数组验收 1792812810709"
    - option "选图验收 1792812804184"
    - option "图表修复验收 1792812797286"
    - option "图表修复验收 1792812793970"
    - option "图表修复验收 1792812790767"
    - option "助手布局验收 1792812787211"
    - option "Agent 验收 1792812784550"
    - option "Agent 验收 1792812770395"
    - option "Agent 验收 1792812762917"
    - option "Agent 验收 1792812758525"
    - option "Agent 验收 1792812756602"
    - option "Agent 验收 1792812749287"
    - option "Agent 验收 1792812743841"
    - option "Agent 验收 1792812736789"
    - option "probe"
    - option "首页分页 1792765252585 / 11"
    - option "首页分页 1792765252585 / 10"
    - option "首页分页 1792765252585 / 09"
    - option "首页分页 1792765252585 / 08"
    - option "首页分页 1792765252585 / 07"
    - option "首页分页 1792765252585 / 06"
    - option "首页分页 1792765252585 / 05"
    - option "首页分页 1792765252585 / 04"
    - option "首页分页 1792765252585 / 03"
    - option "首页分页 1792765252585 / 02"
    - option "首页分页 1792765252585 / 01"
    - option "首页分页 1792765252585 / 00"
    - option "模型连接验收 1792765206675"
    - option "模型连接验收 1792765178825"
    - option "介绍页深链接 · 合成演示"
    - option "隔离验收 B5 1792763227765"
    - option "隔离验收 A5 1792763227619"
    - option "隔离验收 B4 1792763224795"
    - option "隔离验收 A4 1792763224711"
    - option "隔离验收 B3 1792763223251"
    - option "隔离验收 A3 1792763223147"
    - option "隔离验收 B2 1792763219134"
    - option "隔离验收 A2 1792763219056"
    - option "隔离验收 B 1792763216757"
    - option "隔离验收 A 1792763216614"
    - option "空态探针 B 1792761657256"
    - option "空态探针 A 1792761657234"
    - option "竞态探针 1792761371296"
    - option "切换探针 1792761339195"
    - option "空项目验收"
    - option "迁移学习复现"
  - link "产品介绍":
    - /url: /welcome
  - button "管理项目"
  - button "模型设置":
    - img
    - text: 模型设置
  - button "新建项目":
    - img
- status:
  - img
  - text: 处理结果已保存为独立数据集，源数据保持不变
  - button "关闭消息": ×
- main:
  - heading "数据管理" [level=1]
  - paragraph: 原始文件只读保存，每次更新追加为新版本。
  - button "上传数据文件":
    - img
    - text: 上传数据文件
  - complementary:
    - heading "数据集 2" [level=3]
    - button "synthetic-order · 汇总.csv v1 · 3 行 · 10/24 派生":
      - img
      - text: synthetic-order · 汇总.csv v1 · 3 行 · 10/24 派生
    - button "synthetic-order.csv v1 · 4 行 · 10/24" [pressed]:
      - img
      - text: synthetic-order.csv v1 · 4 行 · 10/24
  - heading "synthetic-order.csv" [level=2]
  - text: 版本 1 · 内容指纹 1554613d7a48…
  - button "处理与统计"
  - button "新版本":
    - img
    - text: 新版本
  - link "原始文件":
    - /url: /api/projects/732/data/673/original
  - button "用于绘图":
    - text: 用于绘图
    - img
  - text: 数据已就绪，下一步选择怎样表达。
  - paragraph: 让助手推荐图型，或自己选择字段，先预览再创建。
  - button "选择绘图方案":
    - text: 选择绘图方案
    - img
  - text: "# epoch 数值 # value 数值"
  - textbox "搜索数据":
    - /placeholder: 搜索当前数据集…
  - checkbox "仅看缺失行"
  - text: 仅看缺失行
  - group: 显示字段
  - text: 仅影响表格查看，不改变图表或原数据
  - table:
    - rowgroup:
      - 'row "行 # epoch ↕ # value ↕"':
        - columnheader "行"
        - columnheader "# epoch ↕":
          - button "# epoch ↕"
        - columnheader "# value ↕":
          - button "# value ↕"
    - rowgroup:
      - row "1 10 10":
        - cell "1"
        - cell "10"
        - cell "10"
      - row "2 2 2":
        - cell "2"
        - cell "2"
        - cell "2"
      - row "3 1 1":
        - cell "3"
        - cell "1"
        - cell "1"
      - row "4 2 3":
        - cell "4"
        - cell "2"
        - cell "3"
  - text: 4 行 · 2 个字段 空值按缺失显示，不当作 0
  - button "上一页" [disabled]
  - text: 1 / 1
  - button "下一页" [disabled]
```

# Test source

```ts
  194 |   await expect(page.getByLabel("处理结果预览")).toBeVisible();
  195 |   await page.getByLabel("误差口径").selectOption("sem");
  196 |   await expect(
  197 |     page.getByRole("button", { name: "保存并绘图", exact: true }),
  198 |   ).toBeDisabled();
  199 |   await expect(page.getByLabel("处理结果预览")).toHaveCount(0);
  200 |   await page.getByRole("button", { name: "预览处理结果", exact: true }).click();
  201 |   await expect(
  202 |     page.getByRole("button", { name: "保存并绘图", exact: true }),
  203 |   ).toBeEnabled();
  204 |   await page.getByRole("button", { name: "保存并绘图", exact: true }).click();
  205 |   await expect
  206 |     .poll(() =>
  207 |       page
  208 |         .getByTestId("plot")
  209 |         .evaluate((el: any) =>
  210 |           el.data.filter((t: any) => t.fill === "toself").map((t: any) => t.x),
  211 |         ),
  212 |     )
  213 |     .toEqual([[1, 2, 2, 1]]);
  214 |   await expect
  215 |     .poll(() =>
  216 |       page
  217 |         .getByTestId("plot")
  218 |         .evaluate((el: any) =>
  219 |           el.data
  220 |             .filter((t: any) => t.showlegend !== false)
  221 |             .map((t: any) => t.error_y),
  222 |         ),
  223 |     )
  224 |     .toEqual([undefined, undefined]);
  225 |   await page.getByRole("button", { name: /告警/ }).click();
  226 |   await expect(page.locator(".bottom-content")).toContainText(
  227 |     "1 行区间数据缺失或不适用于对数轴，区间带在此断开",
  228 |   );
  229 |   await page.getByRole("button", { name: /告警/ }).click();
  230 |   await page.getByRole("button", { name: "保存", exact: true }).click();
  231 |   await expect(page.getByText("已保存 v1", { exact: false })).toBeVisible();
  232 |   await page.getByRole("button", { name: "适合窗口", exact: true }).click();
  233 |   await page.screenshot({
  234 |     path: artifactPath(test.info(), "../docs/screenshots/processing-band.png"),
  235 |     fullPage: true,
  236 |   });
  237 | });
  238 | test("explicit filter and numeric stable sort save as an independent dataset", async ({
  239 |   page,
  240 |   request,
  241 | }) => {
  242 |   const p = await (
  243 |     await request.post("/api/projects", {
  244 |       data: {
  245 |         name: `数据排序验收 ${Date.now()}`,
  246 |         description: "synthetic numeric ordering",
  247 |       },
  248 |     })
  249 |   ).json();
  250 |   const raw = Buffer.from("epoch,value\n10,10\n2,2\n1,1\n2,3");
  251 |   const source = await (
  252 |     await request.post(`/api/projects/${p.id}/datasets`, {
  253 |       multipart: {
  254 |         file: {
  255 |           name: "synthetic-order.csv",
  256 |           mimeType: "text/csv",
  257 |           buffer: raw,
  258 |         },
  259 |       },
  260 |     })
  261 |   ).json();
  262 |   await page.addInitScript(
  263 |     (id) => localStorage.setItem("labflow-project", String(id)),
  264 |     p.id,
  265 |   );
  266 |   await page.goto("/");
  267 |   await page.getByRole("link", { name: "数据管理", exact: true }).click();
  268 |   await page.getByRole("button", { name: "处理与统计", exact: true }).click();
  269 |   await page.getByLabel("处理方式").selectOption("sort");
  270 |   await page
  271 |     .getByRole("button", { name: "添加源数据过滤", exact: true })
  272 |     .click();
  273 |   await page.getByLabel("过滤条件 1").selectOption("gte");
  274 |   await page.getByLabel("过滤值 1").fill("2");
  275 |   await page.getByRole("button", { name: "添加结果排序", exact: true }).click();
  276 |   await page.getByRole("button", { name: "预览处理结果", exact: true }).click();
  277 |   await expect(page.getByLabel("处理结果预览")).toContainText(
  278 |     "源数据 4 行 → 结果 3 行",
  279 |   );
  280 |   const response = page.waitForResponse(
  281 |     (r) => r.url().endsWith("/process") && r.request().method() === "POST",
  282 |   );
  283 |   await page
  284 |     .getByRole("button", { name: "保存独立数据集", exact: true })
  285 |     .click();
  286 |   const result = await (await response).json();
  287 |   expect(result.rows).toEqual([
  288 |     { epoch: 2, value: 2 },
  289 |     { epoch: 2, value: 3 },
  290 |     { epoch: 10, value: 10 },
  291 |   ]);
  292 |   await expect(
  293 |     page.getByRole("button", { name: "数据处理来源", exact: true }),
> 294 |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  295 |   expect(
  296 |     await (
  297 |       await request.get(`/api/projects/${p.id}/data/${source.id}/original`)
  298 |     ).body(),
  299 |   ).toEqual(raw);
  300 | });
  301 | 
```