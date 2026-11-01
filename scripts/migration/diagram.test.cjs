'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeManifest,diffCanonical}=require('./normalize.cjs');
function manifest(shift=0) {
  const time='2026-10-30T00:00:00Z';
  return {format:'labflow-project-v1',project:{name:'Synthetic',created_at:time},tables:{
    datasets:[],dataset_versions:[],experiments:[],experiment_datasets:[],charts:[],chart_versions:[],style_templates:[],
    diagrams:[{id:1+shift,project_id:99+shift,name:'Synthetic mechanism',revision:1,archived:true,created_at:time,updated_at:time}],
    diagram_versions:[{id:2+shift,diagram_id:1+shift,version:1,schema_version:1,doc_json:JSON.stringify({schema_version:1,nodes:[{id:'n1',label:'Synthetic'}]}),created_at:time}]
  }};
}
test('diagram migration compares content and history independently of remapped IDs',()=>{
  assert.deepEqual(normalizeManifest(manifest()),normalizeManifest(manifest(100)));
  const b=manifest(100);b.tables.diagram_versions[0].doc_json='{"schema_version":1,"nodes":[]}';
  assert.ok(diffCanonical(normalizeManifest(manifest()),normalizeManifest(b)).length);
});
test('legacy empty tables compare equal, but a missing new table or broken reference fails',()=>{
  const legacy=manifest();delete legacy.tables.diagrams;delete legacy.tables.diagram_versions;
  const empty=structuredClone(legacy);empty.tables.diagrams=[];empty.tables.diagram_versions=[];
  assert.deepEqual(normalizeManifest(legacy),normalizeManifest(empty));
  const partial=manifest();delete partial.tables.diagram_versions;assert.throws(()=>normalizeManifest(partial));
  const broken=manifest();broken.tables.diagram_versions[0].diagram_id=999;assert.throws(()=>normalizeManifest(broken));
});
test('duplicate diagram names preserve distinct contents and identical-copy multiplicity',()=>{
  const a=manifest();a.tables.diagrams.push({...a.tables.diagrams[0],id:3});a.tables.diagram_versions.push({...a.tables.diagram_versions[0],id:4,diagram_id:3});
  const b=structuredClone(a);b.tables.diagrams.reverse();b.tables.diagram_versions.reverse();
  b.tables.diagrams.forEach(d=>d.id+=100);b.tables.diagram_versions.forEach(v=>{v.id+=100;v.diagram_id+=100});
  assert.deepEqual(normalizeManifest(a),normalizeManifest(b));
  b.tables.diagrams.pop();b.tables.diagram_versions.pop();assert.notDeepEqual(normalizeManifest(a),normalizeManifest(b));
});
