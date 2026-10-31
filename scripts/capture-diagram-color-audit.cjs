// Use the actual catalog outlines and the existing Java ColorVision implementation.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.env.LABFLOW_DIAGRAM_EVIDENCE_DIR||'docs/test-evidence/diagram-19-A7-followup');
const audit=JSON.parse(fs.readFileSync(path.join(out,'okabe-ito-audit.json'),'utf8'));
const roles=audit.used_roles,colors=roles.map(r=>audit.outlines[r]);
if(audit.id!=='okabe-ito'||audit.threshold!==20||roles.length!==4)throw new Error('Expected the actual default mechanism audit');
const jdk=fs.readdirSync(path.join(root,'.runtime/java'),{withFileTypes:true}).find(e=>e.isDirectory()).name;
const stamp=Date.now(),csv=path.join(root,`.runtime/diagram-color-audit-${stamp}.csv`),script=path.join(root,`.runtime/diagram-color-audit-${stamp}.jsh`);
const literal=s=>JSON.stringify(s);
fs.writeFileSync(script,`import dev.labflow.review.ColorVision;
import java.nio.file.*;
import java.util.*;
String[] roles={${roles.map(literal).join(',')}};
String[] colors={${colors.map(literal).join(',')}};
List<String> rows=new ArrayList<>();
for(int i=0;i<roles.length;i++)for(int j=0;j<i;j++){double[] d=new double[3];for(int k=0;k<3;k++)d[k]=ColorVision.deltaE(ColorVision.lab(colors[j],k),ColorVision.lab(colors[i],k));rows.add(roles[j]+","+roles[i]+","+d[0]+","+d[1]+","+d[2]+","+ColorVision.minimum(colors[j],colors[i]));}
Files.writeString(Path.of(${literal(csv.replaceAll('\\','/'))}),String.join("\\n",rows));
/exit
`);
const result=spawnSync(path.join(root,'.runtime/java',jdk,'bin/jshell.exe'),['--class-path',path.join(root,'backend/target/classes'),script],{cwd:root,encoding:'utf8',windowsHide:true});
if(result.status!==0)throw new Error('Java ColorVision capture failed: '+result.stderr);
const pairs=fs.readFileSync(csv,'utf8').trim().split('\n').map(row=>{const [a,b,...v]=row.trim().split(','),d=v.map(Number);return {roles:[a,b],colors:[audit.outlines[a],audit.outlines[b]],delta_e:d.slice(0,3),minimum_delta_e:d[3],meets_threshold:d[3]>=20};});
if(pairs.length!==6||pairs.some(p=>!Number.isFinite(p.minimum_delta_e)))throw new Error('Incomplete color audit');
fs.writeFileSync(path.join(out,'okabe-ito-all-pairs.json'),JSON.stringify({palette:audit.id,preset:audit.preset,roles,outlines:Object.fromEntries(roles.map(r=>[r,audit.outlines[r]])),threshold:20,simulation_order:['protan','deutan','tritan'],method:'existing Java ColorVision: Machado severity 1.0 + CIEDE2000',pairs,default_warning:pairs.some(p=>!p.meets_threshold)},null,2)+'\n');
console.log('Actual used-role outlines: six pairs, '+pairs.filter(p=>!p.meets_threshold).length+' warnings; unchanged threshold 20.');
