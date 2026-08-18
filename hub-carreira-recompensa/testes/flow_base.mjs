/* Tela Base e modelo: leitura do .docx e da planilha reais, e deteccao das
   divergencias — inclusive o desalinhamento SKILL_nn que existia ate a v38. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import JSZipReal from 'jszip';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const PLANILHA=process.env.PLANILHA;
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[
 {id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'GESTOR',field_type:'textarea',required:false,active:true,sort_order:10},
 {id:'f2',field_key:'DESCRICAO_CARGO',label:'Principais responsabilidades/atividades',owner_role:'GESTOR',field_type:'textarea',required:false,active:true,sort_order:20},
 {id:'f3',field_key:'obs',label:'Observações internas',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:30}];
const TABLES={profiles:[{id:'u1',name:'Admin',email:'a@marcopolo.com.br',role:'ADMIN',active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
// list_section_catalog devolve [] => cai no padrao embutido (sem SQL rodado)
const RPCS={list_visible_requests:[],list_manager_intake_requests:[],list_section_catalog:[]};
const stub=`
const TABLES=${JSON.stringify(TABLES)}, RPCS=${JSON.stringify(RPCS)};
const JSZip=globalThis.__JSZip;
globalThis.__rpcLog=[];
function qb(table){const res={data:TABLES[table]||[],error:null};
 const b={select:()=>b,eq:()=>b,in:()=>b,order:()=>b,limit:()=>b,
  maybeSingle:async()=>({data:(TABLES[table]||[])[0]||null,error:null}),
  insert:async()=>({error:null}),update:()=>b,delete:()=>b,
  then:(ok)=>Promise.resolve(res).then(ok),catch:()=>Promise.resolve(res)};return b;}
const createClient=()=>({
 auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),signOut:async()=>{},onAuthStateChange:()=>{}},
 from:(t)=>qb(t),
 rpc:(name,args)=>{globalThis.__rpcLog.push([name,args]);
  const pr=Promise.resolve({data:(name in RPCS)?RPCS[name]:[],error:null});pr.catch=()=>pr;return pr;},
 functions:{invoke:async()=>({data:{},error:null})}});
const SUPABASE_URL='x',SUPABASE_ANON_KEY='y',APP_URL='z';
`;
const dom=new JSDOM(html.replace(/<script type="module">[\s\S]*<\/script>/,''),{url:'https://exemplo.test/'});
const w=dom.window;
for (const k of Object.getOwnPropertyNames(w)) {
  if (['window','globalThis','self','top','parent','frames'].includes(k)) continue;
  if (k in globalThis && !['document','location','navigator','origin','name','close','focus','blur','fetch','crypto','performance'].includes(k)) continue;
  try { Object.defineProperty(globalThis,k,{get:()=>w[k],set:(v)=>{w[k]=v;},configurable:true}); } catch(e) {}
}
try { Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true,writable:true}); } catch(e) {}
for (const k of ['FormData','Event','MouseEvent','Blob','URL','CustomEvent','HTMLElement','Node','Element','File'])
  { try { Object.defineProperty(globalThis,k,{value:w[k],configurable:true,writable:true}); } catch(e) {} }
globalThis.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
globalThis.scrollTo=()=>{}; globalThis.requestAnimationFrame=(f)=>f();
globalThis.__JSZip=JSZipReal;
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
w.document.querySelectorAll('form').forEach(f=>{for(const el of [...f.elements]){const n=el.getAttribute&&el.getAttribute('name');if(n)Object.defineProperty(f,n,{get:()=>f.elements[n],configurable:true});}});
globalThis.confirm=()=>true; globalThis.prompt=()=>'';
// fetch do modelo direto do disco
globalThis.fetch=async(u)=>{const buf=fs.readFileSync(RAIZ+'/'+String(u).replace(/^\.\//,''));
  return {ok:true, blob:async()=>buf, arrayBuffer:async()=>buf};};
const errs=[]; w.addEventListener('error',e=>errs.push(e.message));
await import('data:text/javascript;base64,'+Buffer.from(stub+js,'utf8').toString('base64'));
await new Promise(r=>setTimeout(r,300));

const $=(s)=>w.document.querySelector(s);
let bad=0; const check=(n,c,extra)=>{console.log((c?'  ok  ':'  FAIL ')+n+(c?'':' :: '+extra));if(!c){bad++;process.exitCode=1}};
const achados=()=>[...w.document.querySelectorAll('#baseFindings .finding')].map(x=>({n:x.className.split(' ')[1],t:x.textContent}));

console.log('== acesso ==');
check('menu Base e modelo visivel para ADMIN', !$('#navBase').classList.contains('hidden'));
$('#navBase').click(); await new Promise(r=>setTimeout(r,80));
check('tela abre', !$('#baseView').classList.contains('hidden'));
check('avisa que o catalogo e o padrao embutido', $('#baseStatus').textContent.includes('padrão embutido'), $('#baseStatus').textContent.slice(0,80));
check('botao vira Exportar sem a tabela', $('#baseSaveCatalog').textContent.includes('Exportar'), $('#baseSaveCatalog').textContent);
check('catalogo listado', w.document.querySelectorAll('#baseCatalog tbody tr').length===11, String(w.document.querySelectorAll('#baseCatalog tbody tr').length));

console.log('== leitura do modelo .docx real ==');
await globalThis.document.querySelector('#baseCheckModel').click();
await new Promise(r=>setTimeout(r,600));
const pills=[...w.document.querySelectorAll('#baseCatalog .pill')].map(x=>x.textContent);
check('todas as secoes foram encontradas no modelo', pills.filter(x=>x==='no modelo').length===11, pills.join('|'));
const semCatalogo=achados().filter(a=>a.t.includes('e o catálogo não'));
check('nenhum marcador orfao no modelo', semCatalogo.length===0, JSON.stringify(semCatalogo));

console.log('== campos do formulario ==');
check('aponta campo sem secao', achados().some(a=>a.t.includes('Observações internas')), JSON.stringify(achados().map(a=>a.t.slice(0,50))));

if (PLANILHA) {
  console.log('== leitura da planilha base real ==');
  const buf=fs.readFileSync(PLANILHA);
  const file=new w.File([buf],'base.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  file.arrayBuffer=async()=>buf;
  Object.defineProperty($('#baseSheet'),'files',{value:[file],configurable:true});
  await $('#baseSheet').onchange({target:{files:[file]}});
  await new Promise(r=>setTimeout(r,900));
  const erros=achados().filter(a=>a.n==='erro');
  check('catalogo corrigido nao acusa erro contra a planilha', erros.length===0, JSON.stringify(erros.map(e=>e.t.slice(0,90))));

  console.log('== detecta o bug da v38 (SKILL deslocado) ==');
  const linhas=[...w.document.querySelectorAll('#baseCatalog tbody tr')];
  const l30=linhas.find(tr=>tr.querySelector('.b-key').value==='SKILL_30');
  l30.querySelector('.b-base').value='ESCOLARIDADE DESEJÁVEL';   // o erro original
  l30.querySelector('.b-base').dispatchEvent(new w.Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,400));   // debounce da conferencia
  const detectado=achados().filter(a=>a.n==='erro'&&a.t.includes('SKILL_30'));
  check('acusa a coluna errada em SKILL_30', detectado.length===1, JSON.stringify(achados().filter(a=>a.n==='erro').map(e=>e.t.slice(0,110))));
  check('a mensagem explica o sintoma', detectado[0]?.t.includes('escolaridade e idioma'), detectado[0]?.t.slice(0,160));
}

console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:'\ntela Base e modelo OK');
