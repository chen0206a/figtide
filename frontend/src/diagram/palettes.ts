import definitions from '../../../backend/src/main/resources/diagram/palettes.json';
import {tintColor} from './render/color';
export const palettes=definitions;
export type PaletteId=typeof definitions[number]['id'];
export const paletteOf=(id?:string)=>palettes.find(p=>p.id===id)||palettes[0];
export function roleColor(role:string,id?:string):{fill:string;stroke:string}{
  const p=paletteOf(id),mapping:Record<string,'a'|'b'|'c'|'d'|'n'>={actor:'a',data:'a',process:'b',output:'b',note:'c',model:'d'},key=mapping[role]||'n';
  return {fill:tintColor(p[key],'#FFFFFF',key==='n'?.88:.82),stroke:tintColor(p[key],'#000000',key==='n'?.05:.08)};
}
