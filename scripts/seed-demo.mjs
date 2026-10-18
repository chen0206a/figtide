// Explicitly synthetic samples. All writes use the real Java API and MySQL.
import fs from 'node:fs/promises';
const base = process.env.LABFLOW_API || 'http://127.0.0.1:8086/api';
async function api(path, body) {
  const response = await fetch(base + path, body instanceof FormData
    ? {method:'POST',body}
    : body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  const data = await response.json(); if (!response.ok) throw new Error(data.message); return data;
}
const name='视觉模型泛化研究 · 合成演示';
const existing=(await api('/projects')).find(p=>p.name===name);
if(existing){console.log(`Demo already exists: project ${existing.id}`);process.exit(0);}
const project=await api('/projects',{name,description:'CIFAR 系列模型对比与消融分析。所有数值均为合成演示，不代表真实实验结论。'});
async function upload(file){const form=new FormData();form.append('file',new Blob([await fs.readFile(new URL('../samples/'+file,import.meta.url))]),file);return api(`/projects/${project.id}/datasets`,form);}
const curves=await upload('demo-learning-curves.csv'),heat=await upload('demo-heatmap.csv');
const config=JSON.parse(await fs.readFile(new URL('../docs/config-v1.example.json',import.meta.url),'utf8'));
config.datasetVersionId=curves.id;config.style.title='Learning dynamics (synthetic demo)';config.style.fontSize=15;
config.axes.x.title='Training epoch';config.axes.y.title='Test accuracy (%)';config.axes.y.min='50';config.axes.y.max='100';
config.series=[['baseline','Baseline','#6758ce'],['labflow_model','Proposed method','#269e95'],['ablation','Without module A','#d99641']].map(([y,name,color],i)=>({...config.series[0],id:'series-'+i,y,name,color,error:''}));
config.heatY='epoch';config.heatZ='baseline';
await api(`/projects/${project.id}/charts`,{name:'Learning dynamics · 合成演示',config});
const matrix=structuredClone(config);matrix.datasetVersionId=heat.id;matrix.type='heatmap';matrix.x='dataset';matrix.heatY='model';matrix.heatZ='accuracy';matrix.series=[{...matrix.series[0],y:'accuracy'}];matrix.style.title='Cross-dataset performance (synthetic)';matrix.axes.x.title='Dataset';matrix.axes.y={...matrix.axes.y,title:'Model',min:'',max:''};matrix.legend.show=false;
await api(`/projects/${project.id}/charts`,{name:'Cross-dataset comparison · 合成演示',config:matrix});
for(const [index,model,accuracy] of [[1,'Baseline',87.1],[2,'Proposed method',92.8],[3,'Without module A',84.6]])await api(`/projects/${project.id}/experiments`,{name:`EXP-00${index} / ${model}`,parameters:{model,optimizer:'AdamW',learning_rate:0.001,batch_size:128,seed:42,epochs:60},metrics:{accuracy,macro_f1:Number((accuracy/100-.012).toFixed(3))},notes:'合成演示实验记录，用于展示参数、指标与备注管理。并未实际训练模型。数据文件位于本项目的数据管理页面。'});
console.log(`Created synthetic demo project ${project.id}.`);
