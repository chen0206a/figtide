export type DiagramOperation={tool:string;arguments:Record<string,unknown>};
export type DiagramOperationCatalog={protocol_version:1;tools:{name:string;label:string;input_schema:{properties:Record<string,unknown>;required:string[];minProperties:number}}[]};
/** Parameter names come only from the server directory; server schema validation remains authoritative. */
export function makeDiagramOperation(catalog:DiagramOperationCatalog,name:string,args:Record<string,unknown>):DiagramOperation {
  const tool=catalog.tools.find(t=>t.name===name);if(!tool)throw new Error("不支持的机制图操作");
  if(Object.keys(args).some(k=>!Object.hasOwn(tool.input_schema.properties,k))||tool.input_schema.required.some(k=>!Object.hasOwn(args,k))||Object.keys(args).length<tool.input_schema.minProperties)throw new Error("机制图操作参数与目录不一致");
  return {tool:name,arguments:structuredClone(args)};
}
