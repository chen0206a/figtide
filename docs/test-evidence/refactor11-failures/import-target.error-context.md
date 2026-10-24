# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: isolation.spec.ts >> import dialog stores the file in the project that is currently selected
- Location: e2e\isolation.spec.ts:106:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - generic [ref=e6]:
      - link "LabFlow" [ref=e7] [cursor=pointer]:
        - /url: /
      - navigation "主导航" [ref=e14]:
        - link "项目概览" [ref=e15] [cursor=pointer]:
          - /url: /
        - link "实验记录" [ref=e19] [cursor=pointer]:
          - /url: /projects/524/experiments
        - link "数据管理" [ref=e22] [cursor=pointer]:
          - /url: /projects/524/data?dataset=508
        - link "科研绘图" [ref=e27] [cursor=pointer]:
          - /url: /projects/524/figures/new
      - generic [ref=e30]:
        - generic [ref=e31]: 本地工作区
        - combobox "当前项目" [ref=e33]:
          - option "选择项目" [disabled]
          - option "隔离验收 B3 1792770127550" [selected]
          - option "隔离验收 A3 1792770127502"
          - option "隔离验收 B2 1792770124485"
          - option "隔离验收 A2 1792770124436"
          - option "隔离验收 B 1792770122233"
          - option "隔离验收 A 1792770122181"
          - option "介绍页深链接 · 合成演示"
          - option "首页验收 1792770111624"
          - option "首页分页 1792770110120 / 11"
          - option "首页分页 1792770110120 / 10"
          - option "首页分页 1792770110120 / 09"
          - option "首页分页 1792770110120 / 08"
          - option "首页分页 1792770110120 / 07"
          - option "首页分页 1792770110120 / 06"
          - option "首页分页 1792770110120 / 05"
          - option "首页分页 1792770110120 / 04"
          - option "首页分页 1792770110120 / 03"
          - option "首页分页 1792770110120 / 02"
          - option "首页分页 1792770110120 / 01"
          - option "首页分页 1792770110120 / 00"
          - option "首页v2验收 · 合成演示"
          - option "绘图工具验收 1792770106553"
          - option "绘图工具验收 1792770104094"
          - option "绘图工具验收 1792770102315"
          - option "绘图工具验收 1792770100408"
          - option "绘图工具验收 1792770097337"
          - option "绘图工具验收 1792770093099"
          - option "实验关联验收 1792770086850"
          - option "前端体验验收 1792770083948"
          - option "前端体验验收 1792770080990"
          - option "前端体验验收 1792770075258"
          - option "实际区间验收 1792770071685"
          - option "模型评估验收 1792770068041"
          - option "实验记录验收 1792770066587"
          - option "配置交互验收 1792770062663"
          - option "编辑器拆分验收 1792770057973"
          - option "编辑器拆分验收 1792770056196"
          - option "视觉规范验收 · 合成演示"
          - option "热力图 PDF 验收 1792770050445"
          - option "成果恢复验收 484"
          - option "成果交付验收 1792770038472"
          - option "样式清理验收 · 合成演示"
          - option "共同样本 ROC 验收 1792770031043"
          - option "多分类评估验收 1792770026333"
          - option "JSON 数组验收 1792770024365"
          - option "选图验收 1792770019635"
          - option "图表修复验收 1792770014471"
          - option "图表修复验收 1792770011715"
          - option "图表修复验收 1792770008908"
          - option "助手布局验收 1792770005998"
          - option "Agent 验收 1792770004065"
          - option "Agent 验收 1792769990896"
          - option "Agent 验收 1792769985269"
          - option "Agent 验收 1792769981920"
          - option "Agent 验收 1792769980349"
          - option "Agent 验收 1792769975422"
          - option "Agent 验收 1792769971494"
          - option "Agent 验收 1792769967264"
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
        - link "产品介绍" [ref=e34] [cursor=pointer]:
          - /url: /welcome
        - button "管理项目" [ref=e35] [cursor=pointer]
        - button "模型设置" [ref=e36] [cursor=pointer]
        - button "新建项目" [ref=e44] [cursor=pointer]
  - status [ref=e46]:
    - text: 已导入 2 行，原始文件与解析规则已归档
    - button "关闭消息" [ref=e49] [cursor=pointer]: ×
  - generic "工作台内容" [ref=e50]:
    - main [ref=e51]:
      - generic [ref=e52]:
        - generic [ref=e53]:
          - heading "数据管理" [level=1] [ref=e54]
          - paragraph [ref=e55]: 原始文件只读保存，每次更新追加为新版本。
        - button "上传数据文件" [ref=e57] [cursor=pointer]
      - generic [ref=e61]:
        - complementary [ref=e62]:
          - heading "数据集 1" [level=3] [ref=e63]:
            - text: 数据集
            - generic [ref=e64]: "1"
          - button "isolation-target.csv v1 · 2 行 · 10/24" [pressed] [ref=e65] [cursor=pointer]:
            - generic [ref=e69]:
              - generic [ref=e70]: isolation-target.csv
              - generic [ref=e71]: v1 · 2 行 · 10/24
        - generic [ref=e72]:
          - generic [ref=e73]:
            - generic [ref=e74]:
              - heading "isolation-target.csv" [level=2] [ref=e75]
              - generic [ref=e76]: 版本 1 · 内容指纹 4cd013cd4ff0…
            - generic [ref=e77]:
              - button "处理与统计" [ref=e78] [cursor=pointer]
              - button "新版本" [ref=e79] [cursor=pointer]
              - link "原始文件" [ref=e84] [cursor=pointer]:
                - /url: /api/projects/524/data/508/original
              - button "用于绘图" [ref=e85] [cursor=pointer]
          - generic [ref=e89]:
            - generic [ref=e93]:
              - text: 数据已就绪，下一步选择怎样表达。
              - paragraph [ref=e94]: 让助手推荐图型，或自己选择字段，先预览再创建。
            - button "选择绘图方案" [ref=e95] [cursor=pointer]
          - generic [ref=e98]:
            - generic [ref=e99]:
              - generic [ref=e100]: "#"
              - text: epoch
              - generic [ref=e101]: 数值
            - generic [ref=e102]:
              - generic [ref=e103]: "#"
              - text: accuracy
              - generic [ref=e104]: 数值
          - generic [ref=e105]:
            - generic [ref=e106]:
              - textbox "搜索数据" [ref=e107]:
                - /placeholder: 搜索当前数据集…
              - generic [ref=e108]:
                - checkbox "仅看缺失行" [ref=e109]
                - text: 仅看缺失行
              - group [ref=e110]:
                - generic "显示字段" [ref=e111] [cursor=pointer]
              - generic [ref=e112]: 仅影响表格查看，不改变图表或原数据
            - table [ref=e114]:
              - rowgroup [ref=e115]:
                - row [ref=e116]:
                  - columnheader "行" [ref=e117]
                  - columnheader [ref=e118]:
                    - button "# epoch ↕" [ref=e119] [cursor=pointer]
                  - columnheader [ref=e121]:
                    - button "# accuracy ↕" [ref=e122] [cursor=pointer]
              - rowgroup [ref=e124]:
                - row [ref=e125]:
                  - cell "1" [ref=e126]
                  - cell "1" [ref=e127]
                  - cell "0.6" [ref=e128]
                - row [ref=e129]:
                  - cell "2" [ref=e130]
                  - cell "2" [ref=e131]
                  - cell "0.8" [ref=e132]
            - generic [ref=e133]:
              - generic [ref=e134]:
                - text: 2 行 · 2 个字段
                - generic [ref=e135]: 空值按缺失显示，不当作 0
              - generic [ref=e136]:
                - button "上一页" [disabled] [ref=e137]
                - generic [ref=e138]: 1 / 1
                - button "下一页" [disabled] [ref=e139]
```

# Test source

```ts
  32  |   if (!withChart) return { project: project.id, dataset: data.id, file };
  33  |   const config = JSON.parse(
  34  |     fs.readFileSync("../docs/config-v1.example.json", "utf8"),
  35  |   );
  36  |   config.datasetVersionId = data.id;
  37  |   config.series = [
  38  |     { ...config.series[0], x: "epoch", y: "accuracy", error: "" },
  39  |   ];
  40  |   const chart = await (
  41  |     await request.post(`/api/projects/${project.id}/charts`, {
  42  |       data: { name: `${name} 图表`, config },
  43  |     })
  44  |   ).json();
  45  |   return { project: project.id, dataset: data.id, chart: chart.id, file };
  46  | }
  47  | 
  48  | async function sampleBody(page: import("@playwright/test").Page, times = 20) {
  49  |   const seen: string[] = [];
  50  |   for (let i = 0; i < times; i++) {
  51  |     seen.push(await page.evaluate(() => document.body.innerText));
  52  |     await page.waitForTimeout(50);
  53  |   }
  54  |   return seen.join("\n");
  55  | }
  56  | 
  57  | test("data page never shows the previous project's file after switching", async ({
  58  |   page,
  59  |   request,
  60  | }) => {
  61  |   const a = await seed(request, "隔离验收 A", "isolation-a-synthetic.csv");
  62  |   const b = await seed(request, "隔离验收 B", "isolation-b-synthetic.csv", false, false);
  63  |   await page.addInitScript(
  64  |     (id) => localStorage.setItem("labflow-project", String(id)),
  65  |     a.project,
  66  |   );
  67  | 
  68  |   await page.goto(`/projects/${a.project}/data`);
  69  |   await expect(page.getByText(a.file)).toBeVisible();
  70  | 
  71  |   await page.getByLabel("当前项目").selectOption(String(b.project));
  72  |   const sampled = await sampleBody(page);
  73  | 
  74  |   expect(sampled).not.toContain(a.file);
  75  |   await expect(page.getByText(/将实验结果带入工作区/)).toBeVisible();
  76  |   await expect(page).toHaveURL(new RegExp(`/projects/${b.project}/data$`));
  77  | });
  78  | 
  79  | test("editor does not keep the previous project's figure while the next one loads", async ({
  80  |   page,
  81  |   request,
  82  | }) => {
  83  |   const a = await seed(request, "隔离验收 A2", "isolation-a2-synthetic.csv");
  84  |   const b = await seed(request, "隔离验收 B2", "isolation-b2-synthetic.csv");
  85  |   await page.addInitScript(
  86  |     (id) => localStorage.setItem("labflow-project", String(id)),
  87  |     a.project,
  88  |   );
  89  | 
  90  |   await page.goto(`/projects/${a.project}/figures/${a.chart}`);
  91  |   await expect(page.getByTestId("plot")).toBeVisible();
  92  | 
  93  |   // 让新项目的数据晚到 800ms，放大"加载期间仍显示旧数据"的窗口。
  94  |   await page.route(`**/api/projects/${b.project}/**`, async (route) => {
  95  |     await new Promise((resolve) => setTimeout(resolve, 800));
  96  |     await route.continue();
  97  |   });
  98  | 
  99  |   await page.getByLabel("当前项目").selectOption(String(b.project));
  100 |   const sampled = await sampleBody(page, 24);
  101 | 
  102 |   expect(sampled).not.toContain(a.file);
  103 |   await expect(page.getByTestId("plot")).toBeVisible();
  104 | });
  105 | 
  106 | test("import dialog stores the file in the project that is currently selected", async ({
  107 |   page,
  108 |   request,
  109 | }) => {
  110 |   const a = await seed(request, "隔离验收 A3", "isolation-a3-synthetic.csv");
  111 |   const b = await seed(request, "隔离验收 B3", "isolation-b3-synthetic.csv", false, false);
  112 |   await page.addInitScript(
  113 |     (id) => localStorage.setItem("labflow-project", String(id)),
  114 |     a.project,
  115 |   );
  116 | 
  117 |   await page.goto(`/projects/${a.project}/data`);
  118 |   await page.getByLabel("当前项目").selectOption(String(b.project));
  119 |   await expect(page.getByText(/将实验结果带入工作区/)).toBeVisible();
  120 | 
  121 |   await page.getByTestId("file-upload").setInputFiles({
  122 |     name: "isolation-target.csv",
  123 |     mimeType: "text/csv",
  124 |     buffer: Buffer.from("epoch,accuracy\n1,0.6\n2,0.8"),
  125 |   });
  126 |   await page.getByRole("button", { name: "确认导入" }).click();
  127 | 
  128 |   await expect(page.getByText("isolation-target.csv")).toBeVisible();
  129 |   const stored = await (
  130 |     await request.get(`/api/projects/${b.project}/datasets`)
  131 |   ).json();
> 132 |   expect(stored.length).toBe(1);
      |                         ^ Error: expect(received).toBe(expected) // Object.is equality
  133 |   const untouched = await (
  134 |     await request.get(`/api/projects/${a.project}/datasets`)
  135 |   ).json();
  136 |   expect(untouched.length).toBe(1);
  137 | });
  138 | 
  139 | test("home charts and experiment lists stay isolated when switching projects", async ({
  140 |   page,
  141 |   request,
  142 | }) => {
  143 |   const a = await seed(request, "隔离验收 A4", "isolation-a4-synthetic.csv");
  144 |   const b = await seed(request, "隔离验收 B4", "isolation-b4-synthetic.csv", false, false);
  145 |   await page.addInitScript(
  146 |     (id) => localStorage.setItem("labflow-project", String(id)),
  147 |     a.project,
  148 |   );
  149 | 
  150 |   await page.goto("/");
  151 |   await expect(page.getByText("隔离验收 A4 图表")).toBeVisible();
  152 | 
  153 |   await page.getByLabel("当前项目").selectOption(String(b.project));
  154 |   const sampled = await sampleBody(page);
  155 | 
  156 |   expect(sampled).not.toContain("隔离验收 A4 图表");
  157 | 
  158 |   // A separate scenario in the same test keeps the fixed 80-test manifest,
  159 |   // while retaining all existing home assertions and adding experiment coverage.
  160 |   await test.step("experiment names never cross project boundaries (50ms × 20)", async () => {
  161 |     const aName = `实验隔离 A ${a.project}`;
  162 |     const bName = `实验隔离 B ${b.project}`;
  163 |     for (const [id, name] of [[a.project, aName], [b.project, bName]] as const) {
  164 |       const response = await request.post(`/api/projects/${id}/experiments`, {
  165 |         data: { name, status: "completed", parameters: {}, metrics: {}, notes: "合成隔离验收", tags: [] },
  166 |       });
  167 |       expect(response.ok()).toBe(true);
  168 |     }
  169 |     await page.goto(`/projects/${a.project}/experiments`);
  170 |     await expect(page.getByText(aName, { exact: true })).toBeVisible();
  171 |     await page.getByLabel("当前项目").selectOption(String(b.project));
  172 |     expect(await sampleBody(page, 20)).not.toContain(aName);
  173 |     await expect(page.getByText(bName, { exact: true })).toBeVisible();
  174 |     await page.getByLabel("当前项目").selectOption(String(a.project));
  175 |     expect(await sampleBody(page, 20)).not.toContain(bName);
  176 |     await expect(page.getByText(aName, { exact: true })).toBeVisible();
  177 |   });
  178 | });
  179 | test("a dataset id carried over from another project never breaks the data page", async ({
  180 |   page,
  181 |   request,
  182 | }) => {
  183 |   const a = await seed(request, "隔离验收 A5", "isolation-a5-synthetic.csv");
  184 |   const b = await seed(request, "隔离验收 B5", "isolation-b5-synthetic.csv", false);
  185 |   await page.addInitScript(
  186 |     (id) => localStorage.setItem("labflow-project", String(id)),
  187 |     a.project,
  188 |   );
  189 | 
  190 |   // 切换项目后，工作区记忆里可能还留着上一个项目的版本号。
  191 |   await page.goto(`/projects/${b.project}/data?dataset=${a.dataset}`);
  192 |   await page.waitForTimeout(1200);
  193 |   const body = await page.locator("main").innerText();
  194 | 
  195 |   expect(body).not.toContain(a.file);
  196 |   expect(body).not.toContain("重试");
  197 |   await expect(page.getByRole("heading", { name: b.file })).toBeVisible();
  198 | });
  199 | 
```