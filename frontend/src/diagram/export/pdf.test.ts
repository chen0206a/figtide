import {afterEach,expect,it,vi} from 'vitest';
import type {DiagramDoc} from '../model';
const calls=vi.hoisted(()=>({svg:vi.fn()}));
vi.mock('jspdf',()=>({jsPDF:class{setFont(){}async svg(svg:SVGSVGElement){calls.svg(svg.cloneNode(true));}output(){return new Blob(['pdf']);}}}));
vi.mock('svg2pdf.js',()=>({}));
vi.mock('../../editor/pdf',()=>({loadPdfFontSubset:vi.fn(),positionPdfText:(svg:SVGSVGElement)=>{
  // The shared freezer creates new runs and copies fill/font, not source stroke.
  const old=svg.querySelector('text')!,run=document.createElementNS('http://www.w3.org/2000/svg','text');run.textContent=old.textContent;run.setAttribute('fill','#343434');old.replaceWith(run);
}}));
const originalFonts=Object.getOwnPropertyDescriptor(document,'fonts');
afterEach(()=>{vi.restoreAllMocks();if(originalFonts)Object.defineProperty(document,'fonts',originalFonts);else Reflect.deleteProperty(document,'fonts');});
it('resets inherited node strokes after the shared text freezer rebuilds P glyphs',async()=>{
  Object.defineProperty(document,'fonts',{configurable:true,value:{load:vi.fn().mockResolvedValue([])}});
  const {diagramPdf}=await import('./pdf');await diagramPdf('<svg xmlns="http://www.w3.org/2000/svg"><g stroke="#00916A"><text stroke="none" fill="#343434">P</text></g></svg>',{canvas:{width_mm:180,height_mm:110}} as DiagramDoc);
  const rendered=calls.svg.mock.calls[0][0] as SVGSVGElement,text=rendered.querySelector('text')!;expect(text.getAttribute('stroke')).toBe('none');expect(text.style.stroke).toBe('none');expect(text.getAttribute('fill')).toBe('#343434');expect(text.textContent).toBe('P');
});
