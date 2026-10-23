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
it("returning visitors see 进入工作区 in the top bar while the CTAs keep their wording",()=>{
  const start=vi.fn();const {container}=render(<ProductIntro onStart={start} seen/>);
  const top=container.querySelector('header .cta')!;
  expect(top.textContent).toContain('进入工作区');
  expect(screen.getAllByRole('button',{name:/开始创作/})).toHaveLength(2);
  fireEvent.click(top);expect(start).toHaveBeenCalledTimes(1);
});
it("markup is only rewritten for the top-bar entry",()=>{
  const unseen=render(<ProductIntro onStart={()=>{}}/>);
  expect(unseen.container.querySelector('header .cta')!.textContent).toContain('开始创作');
  expect(unseen.container.querySelectorAll('[data-start]')).toHaveLength(3);
});