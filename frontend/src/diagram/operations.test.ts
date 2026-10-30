import {expect,it} from "vitest";
import {makeDiagramOperation,type DiagramOperationCatalog} from "./operations";
const catalog:DiagramOperationCatalog={protocol_version:1,tools:[{name:"directory_supplied_tool",label:"来自服务端的操作",input_schema:{properties:{target:{},adjustment:{}},required:["target"],minProperties:2}}]};
it("builds operations from directory fields rather than a second frontend parameter list",()=>{
  const args={target:"n1",adjustment:{value:8}},op=makeDiagramOperation(catalog,"directory_supplied_tool",args);expect(op).toEqual({tool:"directory_supplied_tool",arguments:args});args.adjustment.value=9;expect((op.arguments.adjustment as {value:number}).value).toBe(8);
});
it("rejects unknown tools, extra properties and incomplete adjustments",()=>{
  expect(()=>makeDiagramOperation(catalog,"save",{})).toThrow();expect(()=>makeDiagramOperation(catalog,"directory_supplied_tool",{target:"n1"})).toThrow();expect(()=>makeDiagramOperation(catalog,"directory_supplied_tool",{adjustment:8})).toThrow();expect(()=>makeDiagramOperation(catalog,"directory_supplied_tool",{target:"n1",adjustment:8,toString:true})).toThrow();
});
