import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CanvasAsk} from './CanvasAsk';
it('requires explicit consent and text, then hands off exactly once',()=>{
 const send=vi.fn();render(<CanvasAsk onSend={send}/>);
 const button=screen.getByRole('button',{name:'发送给绘图助手'});
 expect(screen.getByRole('checkbox')).not.toBeChecked();expect(button).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'隐藏网格线'}));expect(screen.getByLabelText('描述绘图调整')).toHaveValue('隐藏网格线');expect(button).toBeDisabled();
 fireEvent.submit(screen.getByRole('form',{name:'画布绘图助手'}));expect(send).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
 expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][0]).toMatchObject({prompt:'隐藏网格线',consent:true});
});
