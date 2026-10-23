import { fireEvent,render,screen } from "@testing-library/react";
import { expect,it,vi } from "vitest";
import ProductIntro from "./ProductIntro";
it("all three real CTAs enter the workspace and diagrams identify illustrative data",()=>{
  const start=vi.fn();render(<ProductIntro onStart={start}/>);
  const buttons=screen.getAllByRole('button',{name:/开始创作/});expect(buttons).toHaveLength(3);
  buttons.forEach(button=>fireEvent.click(button));expect(start).toHaveBeenCalledTimes(3);
  expect(screen.getAllByText('示意数据')).toHaveLength(2);
  expect(screen.getByText(/3 个只读查询、10 个生成修改提案/)).toBeVisible();
  expect(document.querySelectorAll('#charts figure')).toHaveLength(6);
  expect(document.querySelector('a[href="#"]')).toBeNull();
});
