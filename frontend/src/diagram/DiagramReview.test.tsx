import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useState} from 'react';
import {useDiagramReview,DiagramReviewMarkers} from './DiagramReview';
import type {DiagramCatalog,DiagramDoc,DiagramRecord} from './model';
import type {DiagramOperation} from './operations';
import type {ReviewResult} from '../editor/review';
const mocked=vi.hoisted(()=>({api:vi.fn(),facts:vi.fn()}));
vi.mock('../lib/api',()=>({api:mocked.api,send:(method:string,body:unknown)=>({method,body})}));
vi.mock('./collectFacts',()=>({collectDiagramFacts:mocked.facts}));
const doc={canvas:{width_mm:180,height_mm:110,background:'#FFFFFF'},style:{preset:'nature-flat',overrides:{font_size_pt:3}},nodes:[],zones:[],edges:[],annotations:[],legend:{mode:'off',position:'bottom-right'},meta:{template:null}} as unknown as DiagramDoc;
const catalog={styles:[{id:'nature-flat'}],journals:[{id:'default',name:'默认'}]} as DiagramCatalog;
const result:ReviewResult<DiagramOperation>={protocol_version:1,rules_version:'test',journal:'default',issues:[{id:'D1:font',rule:'D1',severity:'error',title:'成品文字字号太小',detail:'3 pt',fixable:true,fix:[{tool:'set_style',arguments:{overrides:{font_size_pt:7}}}],anchor:{kind:'canvas',ref:0}}],passed:['D2'],skipped:[]};
const tools={protocol_version:1,tools:[{name:'set_style',label:'设置风格',input_schema:{properties:{overrides:{}},required:[],minProperties:1}}]};
function Harness(){const [current,setCurrent]=useState(doc),[edits,setEdits]=useState(0);const review=useDiagramReview(current,{id:1,project_id:2} as DiagramRecord,1,catalog,d=>{setCurrent(d);setEdits(x=>x+1);});return <><button onClick={review.open}>打开审稿</button><button onClick={()=>setCurrent({...current,canvas:{...current.canvas,width_mm:200}})}>外部编辑</button><output aria-label="应用次数">{edits}</output>{review.panel}</>;}
it('requires preview then explicit confirmation; cancel and preview do not edit',async()=>{
 mocked.facts.mockResolvedValue({kind:'diagram',version:1});mocked.api.mockImplementation(async(path:string)=>path.endsWith('/catalog')?tools:path.endsWith('/review')?result:{doc:{...doc,style:{...doc.style,overrides:{font_size_pt:7}}},changes:[{path:'/style/overrides/font_size_pt',before:3,after:7}]});
 render(<Harness/>);fireEvent.click(screen.getByText('打开审稿'));fireEvent.click(screen.getByText('运行审稿'));await screen.findByRole('checkbox',{name:'修复 成品文字字号太小'});expect(screen.queryByText('应用修复')).toBeNull();
 fireEvent.click(screen.getByText('预览选中修复'));await screen.findByText('应用修复');expect(screen.getByLabelText('应用次数').textContent).toBe('0');fireEvent.click(screen.getByText('取消预览'));expect(screen.queryByText('应用修复')).toBeNull();
 fireEvent.click(screen.getByText('预览选中修复'));await screen.findByText('应用修复');fireEvent.click(screen.getByText('应用修复'));expect(screen.getByLabelText('应用次数').textContent).toBe('1');expect(screen.queryByText('应用修复')).toBeNull();expect(mocked.api.mock.calls.every(([,options])=>options?.method!=='PUT')).toBe(true);
});
it('discards a review response if the document changes while it is running',async()=>{
 let resolve!:(v:ReviewResult<DiagramOperation>)=>void;mocked.api.mockImplementation((path:string)=>path.endsWith('/catalog')?Promise.resolve(tools):new Promise<ReviewResult<DiagramOperation>>(r=>{resolve=r;}));
 render(<Harness/>);fireEvent.click(screen.getByText('打开审稿'));fireEvent.click(screen.getByText('运行审稿'));await waitFor(()=>expect(resolve).toBeTypeOf('function'));fireEvent.click(screen.getByText('外部编辑'));await act(async()=>resolve(result));expect(screen.queryByRole('checkbox')).toBeNull();
});
it('uses shared numbered markers and hides ignored issues without changing the report',()=>{
 const {container,rerender}=render(<svg><DiagramReviewMarkers doc={doc} report={result} ignored={new Set()}/></svg>);expect(container.querySelector('[data-change-number="1"]')).not.toBeNull();rerender(<svg><DiagramReviewMarkers doc={doc} report={result} ignored={new Set(['D1:font'])}/></svg>);expect(container.querySelector('[data-change-number]')).toBeNull();expect(result.issues).toHaveLength(1);
});
