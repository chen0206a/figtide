import { artifactPath } from "./artifacts";
import { test, expect, type APIRequestContext } from "./workspace-test";
import { defaults } from "../src/editor/model";

async function fixture(request: APIRequestContext) {
  const p=await (await request.post("/api/projects",{data:{name:`编辑器拆分验收 ${Date.now()}`,description:"合成演示"}})).json();
  const d=await (await request.post(`/api/projects/${p.id}/datasets`,{multipart:{file:{name:"compat-synthetic.csv",mimeType:"text/csv",buffer:Buffer.from("epoch,accuracy\n1,0.7\n2,0.8\n3,0.9")}}})).json();
  const config=defaults(d);
  const response=await request.post(`/api/projects/${p.id}/charts`,{data:{name:"可重复编辑 · 合成",config}});
  expect(response.ok()).toBe(true);
  return {p,d,chart:await response.json()};
}

test("save menu keyboard/outside dismissal, curve selection and pointer resizing remain usable",async({page,request})=>{
  const {p,chart}=await fixture(request);
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`/projects/${p.id}/figures/${chart.id}`);
  await expect(page.getByTestId("plot").locator(".main-svg").first()).toBeVisible();
  for(const name of ["数据栏","属性栏"]) {
    await expect(page.getByRole("button",{name,exact:true})).toHaveAttribute("title",name);
    await expect(page.getByRole("button",{name,exact:true}).locator("svg")).toHaveCount(1);
  }
  const menu=page.getByRole("button",{name:"更多保存选项"});
  await menu.focus();await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem",{name:"另存副本"})).toBeFocused();
  await page.keyboard.press("Escape");await expect(menu).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await menu.click();await page.getByLabel("图表名称",{exact:true}).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await (await request.get(`/api/projects/${p.id}/charts`)).json()).length).toBe(1);
  await page.getByTestId("plot").locator(".scatterlayer .point").first().click({force:true});
  await expect(page.getByLabel("序列名称",{exact:true})).toBeVisible();
  const separator=page.getByRole("separator",{name:"调整数据栏宽度"});
  const before=Number(await separator.getAttribute("aria-valuenow"));
  const box=(await separator.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2);await page.mouse.up();
  await expect(separator).toHaveAttribute("aria-valuenow",String(Math.min(340,before+20)));
  await menu.click();await page.getByRole("menuitem",{name:"另存副本"}).click();
  await expect(page.getByLabel("图表名称",{exact:true})).toHaveValue("可重复编辑 · 合成 · 副本");
  await page.screenshot({path:artifactPath(test.info(), "../docs/screenshots/refactor-05-editor.png")});
});

test("two open tabs preserve the losing draft and show the real revision conflict",async({page,context,request})=>{
  const {p,chart}=await fixture(request);const second=await context.newPage();
  for(const tab of [page,second]){
    await tab.goto(`/projects/${p.id}/figures/${chart.id}`);
    await tab.getByRole("button",{name:"外观",exact:true}).click();
    await expect(tab.getByLabel("图表标题",{exact:true})).toBeVisible();
  }
  await page.getByLabel("图表标题",{exact:true}).fill("First tab title");
  await page.getByRole("button",{name:"保存",exact:true}).click();
  await expect(page.getByText("已保存 v2",{exact:false})).toBeVisible();
  await second.getByLabel("图表标题",{exact:true}).fill("Second tab draft");
  await second.getByRole("button",{name:"保存",exact:true}).click();
  await expect(second.getByRole("dialog",{name:"图表已有更新版本"})).toBeVisible();
  const stored=await(await request.get(`/api/projects/${p.id}/charts/${chart.id}`)).json();
  expect(stored.revision).toBe(2);expect(stored.config.style.title).toBe("First tab title");
  await second.getByRole("dialog").getByRole("button",{name:"继续编辑",exact:true}).click();
  await expect(second.getByLabel("图表标题",{exact:true})).toHaveValue("Second tab draft");
});
