import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {PaletteSelect} from './PaletteSelect';
import type {DiagramDoc,PaletteAudit} from './model';
it('warns only for present semantic outlines and names both roles',()=>{
 const audits=[{id:'okabe-ito',preset:'nature-flat',safe:false,threshold:20,outlines:{},failing_pairs:[{roles:['actor','model'],colors:['#0069A4','#BC6F9A'],minimum_delta_e:12.345,delta_e:[12.345,22,24]}]}] as PaletteAudit[];
 const doc={style:{preset:'nature-flat'},nodes:[{kind:'glyph',glyph:'protein',role:'actor',style_ref:null}]} as DiagramDoc;
 const {rerender}=render(<PaletteSelect doc={doc} audits={audits} onChange={()=>{}}/>);expect(screen.queryByRole('status')).toBeNull();
 rerender(<PaletteSelect doc={{...doc,nodes:[...doc.nodes,{...doc.nodes[0],role:'model'}]}} audits={audits} onChange={()=>{}}/>);
 expect(screen.getByRole('status').textContent).toContain('参与者 / 模型：ΔE 12.35');
 rerender(<PaletteSelect doc={{...doc,nodes:[...doc.nodes,{...doc.nodes[0],role:'model',glyph:'phospho'}]}} audits={audits} onChange={()=>{}}/>);expect(screen.queryByRole('status')).toBeNull();
});
