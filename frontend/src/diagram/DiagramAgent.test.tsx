import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {useDiagramAgent} from './DiagramAgent';
import type {DiagramCatalog,DiagramDoc,DiagramRecord} from './model';
const mock=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../lib/api',()=>({api:mock.api,send:(method:string,body:unknown)=>({method,body})}));
vi.mock('./collectFacts',()=>({collectDiagramFacts:vi.fn()}));
const base=resolve(process.cwd(),'../backend/src/main/resources/diagram');
const doc=JSON.parse(readFileSync(resolve(base,'templates/workflow.json'),'utf8')).documents.en as DiagramDoc;
const catalog={skills:[JSON.parse(readFileSync(resolve(base,'skills/workflow/skill.json'),'utf8'))],styles:[JSON.parse(readFileSync(resolve(base,'styles/nature-flat.json'),'utf8'))]} as DiagramCatalog;
function Harness(){const agent=useDiagramAgent(doc,{id:1,project_id:2} as DiagramRecord,1,catalog,()=>{});return <><button onClick={agent.open}>打开助手</button>{agent.panel}</>;}
it('shows compact click-to-edit facts, two summary lines and only the current primary action',async()=>{
 const brief={run_id:'brief',session_id:'session',status:'answered',phase:'awaiting_facts',persisted:true,diagram:{kind:'brief',brief:'A activates B',cannot_imply:'No dose claim',facts:[{text:'A activates B.',quote:'A activates B.'},{text:'C inhibits B.',quote:'C inhibits B.'}]}};
 let current=brief;mock.api.mockImplementation(async(path:string,options:any)=>{if(path.endsWith('/runs')&&options.body.diagram_stage==='structure'){current={...brief,diagram:{...brief.diagram,kind:'answer'}};return current;}return current;});
 const {container}=render(<Harness/>);fireEvent.click(screen.getByText('打开助手'));fireEvent.change(screen.getByLabelText('机制图绘图需求'),{target:{value:'A activates B. C inhibits B.'}});fireEvent.click(screen.getByRole('checkbox',{name:'同意将当前文档和描述发送至已配置的模型服务'}));fireEvent.click(screen.getByRole('button',{name:'生成简报与事实'}));await screen.findByRole('checkbox',{name:'使用事实 1'});
 expect(container.querySelectorAll('.diagram-agent-fact textarea')).toHaveLength(0);expect(container.querySelectorAll('.diagram-agent-summary textarea')).toHaveLength(0);expect(screen.getByText('不能暗示')).toBeVisible();expect(container.querySelectorAll('footer .btn-primary')).toHaveLength(1);expect(screen.queryByRole('button',{name:'生成简报与事实'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'编辑事实 1'}));fireEvent.change(screen.getByLabelText('事实 1'),{target:{value:'A activates B. User confirmed.'}});fireEvent.blur(screen.getByLabelText('事实 1'));expect(container.querySelectorAll('.diagram-agent-fact textarea')).toHaveLength(0);fireEvent.click(screen.getByRole('checkbox',{name:'使用事实 2'}));fireEvent.click(screen.getByRole('button',{name:'确认事实，生成结构提案'}));await waitFor(()=>expect(mock.api.mock.calls.some(([,o])=>o?.body?.diagram_stage==='structure'&&JSON.stringify(o.body.selected_facts)==='[0]')).toBe(true));
});
