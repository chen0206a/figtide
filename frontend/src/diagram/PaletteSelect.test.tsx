import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {PaletteSelect} from './PaletteSelect';
import type {DiagramDoc,PaletteAudit} from './model';
it('warns only for present semantic outlines and names both roles',()=>{
 const audits=[{id:'okabe-ito',preset:'nature-flat',safe:false,threshold:20,outlines:{},failing_pairs:[{roles:['actor','model'],colors:['#0069A4','#BC6F9A'],minimum_delta_e:9.345,delta_e:[9.345,22,24]}]}] as PaletteAudit[];
 const doc={style:{preset:'nature-flat'},nodes:[{kind:'glyph',glyph:'protein',role:'actor',style_ref:null}]} as DiagramDoc;
 const {rerender}=render(<PaletteSelect doc={doc} audits={audits} onChange={()=>{}}/>);expect(screen.queryByRole('status')).toBeNull();
 rerender(<PaletteSelect doc={{...doc,nodes:[...doc.nodes,{...doc.nodes[0],role:'model'}]}} audits={audits} onChange={()=>{}}/>);
 expect(screen.getByRole('status').textContent).toContain('参与者 / 模型：ΔE 9.35');
 rerender(<PaletteSelect doc={{...doc,nodes:[...doc.nodes,{...doc.nodes[0],role:'model',glyph:'phospho'}]}} audits={audits} onChange={()=>{}}/>);expect(screen.queryByRole('status')).toBeNull();
});

it('offers six compact chips without warning for 10–20 info pairs',()=>{
 const audits=[{id:'okabe-ito',preset:'nature-flat',safe:false,threshold:20,outlines:{},failing_pairs:[{roles:['actor','model'],colors:['#0069A4','#BC6F9A'],minimum_delta_e:11.724817,delta_e:[]}]}] as PaletteAudit[];
 const doc={style:{preset:'nature-flat'},nodes:[{kind:'glyph',glyph:'protein',role:'actor'},{kind:'glyph',glyph:'ligand',role:'model'}]} as DiagramDoc;
 const onChange=()=>{};render(<PaletteSelect compact doc={doc} audits={audits} onChange={onChange}/>);
 expect(screen.getByRole('group',{name:'机制图配色'}).querySelectorAll('button')).toHaveLength(6);expect(screen.getByRole('status')).toHaveTextContent('当前角色轮廓未发现低于 ΔE 10 的色对');expect(screen.queryByText(/色觉提示/)).toBeNull();
});
