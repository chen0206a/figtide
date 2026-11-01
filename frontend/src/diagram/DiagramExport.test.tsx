import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {DiagramExport} from "./DiagramExport";
import type {DiagramDoc,DiagramStyle} from "./model";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("shows physical units and non-blocking review errors without saving or fetching on open",()=>{
  const doc=JSON.parse(readFileSync(resolve(process.cwd(),"../backend/src/test/resources/diagram-doc-v1.json"),"utf8")) as DiagramDoc;
  const style=JSON.parse(readFileSync(resolve(process.cwd(),"../backend/src/main/resources/diagram/styles/nature-flat.json"),"utf8")) as DiagramStyle;
  const fetch=vi.spyOn(globalThis,"fetch");render(<DiagramExport doc={doc} style={style} name="Synthetic" onClose={()=>{}} reviewErrors={3}/>);
  expect(screen.getByText(/180 × 110 mm/)).toBeVisible();expect(screen.getByText(/审稿有 3 个error/)).toBeVisible();expect(screen.getByRole('button',{name:'下载文件'})).toBeEnabled();
  fireEvent.change(screen.getByRole('combobox',{name:'机制图导出格式'}),{target:{value:'png'}});expect(screen.getByRole('combobox',{name:'PNG分辨率'})).toHaveValue('300');expect(fetch).not.toHaveBeenCalled();
});
