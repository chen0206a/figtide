import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { it, expect, vi } from "vitest";
import { DataPage } from "./DataPage";
import type { Dataset } from "../lib/api";
const original:Dataset={id:1,dataset_id:1,version:1,filename:"完整显示的长文件名-learning-dynamics.csv",row_count:1,sha256:"abc123",fields:[{name:"score",type:"number",missing:0}],rows:[{score:0.9}],warnings:[],created_at:new Date(2026,9,23,17,10).toISOString()};
const derived:Dataset={...original,id:2,filename:"Grouped means SEM",source_meta:{schema_version:1,kind:"experiment_comparison",created_at:original.created_at!,metric:"accuracy",direction:"higher",baseline_id:1,chart_type:"bar",experiments:[],missing_count:0}};
function mount(selected=1){
 const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});
 for(const d of [original,derived]) client.setQueryData(["data",1,d.id],d);
 const onSelect=vi.fn(),onPlot=vi.fn(),onUpload=vi.fn();
 render(<QueryClientProvider client={client}><DataPage project={1} selected={selected} onSelect={onSelect} datasets={[original,derived]} loading={false} onRetry={vi.fn()} onUpload={onUpload} busy={false} onPlot={onPlot} onChartCreated={vi.fn()} onProcessed={vi.fn()}/></QueryClientProvider>);
 return {onSelect,onPlot,onUpload};
}
it("renders complete filenames, real dates, and derived marker only for derived data",()=>{
 const {onSelect}=mount();
 const list=document.querySelector('.dataset-list')!;
 expect(list.querySelector('b')!.textContent).toBe(original.filename);
 expect(list.textContent).toContain("v1 · 1 行 · 10/23");
 expect(screen.getAllByText("派生")).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:/Grouped means SEM/}));expect(onSelect).toHaveBeenCalledWith(2);
});
it("keeps real detail actions and data semantics",()=>{
 const {onPlot,onUpload}=mount();
 fireEvent.click(screen.getByRole('button',{name:/用于绘图/}));expect(onPlot).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'新版本'}));expect(onUpload).toHaveBeenCalledWith(1);
 expect(screen.getByRole('link',{name:'原始文件'})).toHaveAttribute('href','/api/projects/1/data/1/original');
 expect(screen.getByText('0.9',{exact:true})).toBeVisible();expect(original.rows).toEqual([{score:0.9}]);
});
