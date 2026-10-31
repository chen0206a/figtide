import {expect,it} from 'vitest';
import {wrapLabel} from './geometry';
it('keeps English words intact and wraps CJK characters',()=>{expect(wrapLabel('Output prediction',5,2.5)).toEqual(['Output','prediction']);expect(wrapLabel('ERK-dependent transcription',8,2.5)).toEqual(['ERK-dependent','transcription']);expect(wrapLabel('中文标签',5,2.5)).toEqual(['中文','标签']);});
