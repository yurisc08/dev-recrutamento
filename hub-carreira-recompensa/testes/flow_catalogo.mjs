/* Em cargo existente, os campos fora do escopo tambem precisam vir
   preenchidos com o texto da base ao abrir a solicitacao. Quando o snapshot
   gravado esta incompleto, o app busca o cargo no catalogo. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const SNAPSHOT=process.env.SNAPSHOT||'incompleto';
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[
 {id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'CR',field_type:'textarea',required:false,active:true,sort_order:10},
 {id:'f2',field_key:'esc_min',label:'Formação/Escolaridade mínima',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:20},
 {id:'f3',field_key:'idi_min',label:'Idioma mínimo',owner_role:'GESTOR',field_type:'text',required:false,active:true,sort_order:30},
 {id:'f4',field_key:'idi_des',label:'Idioma desejável',owner_role:'GESTOR',field_type:'text',required:false,active:true,sort_order:40},
 {id:'f5',field_key:'tec_min',label:'Competências técnicas mínimas',owner_role:'GESTOR',field_type:'textarea',required:false,active:true,sort_order:50}];
// So a secao do escopo foi gravada; as demais precisam vir do catalogo.
const SNAP = SNAPSHOT==='completo'
 ? {ATIV_DESC:'MISSAO GRAVADA',SKILL_30:'SUPERIOR GRAVADO',SKILL_32:'INGLES GRAVADO',SKILL_33:'ESPANHOL GRAVADO',SKILL_34:'OFFICE GRAVADO'}
 : {ATIV_DESC:'MISSAO GRAVADA'};
const REQ={id:'r1',request_number:'SOL-010',title:'ADVOGADO',job_code:'120',status:'Rascunho C&R',
 company:'MARCOPOLO S A',branch:'AB',deadline:'2026-09-30',updated_at:'2026-08-18T10:00:00Z',
 manager:{name:'Gestor Um'},request_kind:'UPDATE',intake_request_id:'i1',
 source_job_id:'j1', intake_selected_sections:['ATIV_DESC'],
 source_snapshot:SNAP, request_field_values:[], history:[]};
const TABLES={profiles:[{id:'u1',name:'CR',email:'cr@marcopolo.com.br',role:'CR',active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
const RPCS={list_visible_requests:[REQ],list_manager_intake_requests:[],get_visible_request:REQ,
 list_section_catalog:[],get_request_additional_approval:null,list_available_approvers:[],
 get_request_intake_metadata:{},
 get_job_catalog_details:{job_code:'120',job_name:'ADVOGADO',
   raw_data:{SKILL_30:'ENSINO SUPERIOR COMPLETO',SKILL_32:'NÃO REQUERIDO',SKILL_33:'ESPANHOL BÁSICO',SKILL_34:'PACOTE OFFICE'}}};
const stub=`
const JSZip={}; const TABLES=${JSON.stringify(TABLES)}, RPCS=${JSON.stringify(RPCS)};
globalThis.__rpcLog=[];
function qb(t){const res={data:TABLES[t]||[],error:null};
 const b={select:()=>b,eq:()=>b,in:()=>b,order:()=>b,limit:()=>b,
  maybeSingle:async()=>({data:(TABLES[t]||[])[0]||null,error:null}),
  insert:async()=>({error:null}),update:()=>b,delete:()=>b,
  then:(ok)=>Promise.resolve(res).then(ok),catch:()=>Promise.resolve(res)};return b;}
const createClient=()=>({
 auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),signOut:async()=>{},onAuthStateChange:()=>{}},
 from:qb, rpc:(n,a)=>{globalThis.__rpcLog.push([n,a]);
  const pr=Promise.resolve({data:(n in RPCS)?RPCS[n]:[],error:null});pr.catch=()=>pr;return pr;},
 functions:{invoke:async()=>({data:{},error:null})}});
const SUPABASE_URL='x',SUPABASE_ANON_KEY='y',APP_URL='z';
`;
const dom=new JSDOM(html.replace(/<script type="module">[\s\S]*<\/script>/,()=> ''),{url:'https://exemplo.test/'});
const w=dom.window;
for (const k of Object.getOwnPropertyNames(w)) {
  if (['window','globalThis','self','top','parent','frames'].includes(k)) continue;
  if (k in globalThis && !['document','location','navigator','origin','name','close','focus','blur','fetch','crypto','performance'].includes(k)) continue;
  try { Object.defineProperty(globalThis,k,{get:()=>w[k],set:(v)=>{w[k]=v;},configurable:true}); } catch(e) {}
}
try { Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true,writable:true}); } catch(e) {}
for (const k of ['FormData','Event','MouseEvent','Blob','URL','CustomEvent','HTMLElement','Node','Element'])
  { try { Object.defineProperty(globalThis,k,{value:w[k],configurable:true,writable:true}); } catch(e) {} }
for (const k of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle'])
  { try { Object.defineProperty(globalThis,k,{value:w[k].bind(w),configurable:true,writable:true}); } catch(e) {} }
globalThis.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
globalThis.scrollTo=()=>{}; globalThis.requestAnimationFrame=(f)=>f();
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
w.document.querySelectorAll('form').forEach(f=>{for(const el of [...f.elements]){const n=el.getAttribute&&el.getAttribute('name');if(n)Object.defineProperty(f,n,{get:()=>f.elements[n],configurable:true});}});
globalThis.confirm=()=>true; globalThis.prompt=()=>'';
const errs=[]; w.addEventListener('error',e=>errs.push(e.message));
await import('data:text/javascript;base64,'+Buffer.from(stub+js,'utf8').toString('base64'));
await new Promise(r=>setTimeout(r,300));

const $=(s)=>w.document.querySelector(s);
let bad=0; const check=(n,c,extra)=>{console.log((c?'  ok  ':'  FAIL ')+n+(c?'':' :: '+extra));if(!c){bad++;process.exitCode=1}};
$('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,400));

const v=(k)=>$(`#content [name="${k}"]`).value;
console.log(`== snapshot ${SNAPSHOT} ==`);
const buscou=globalThis.__rpcLog.some(x=>x[0]==='get_job_catalog_details');
if (SNAPSHOT==='completo') {
  check('nao busca o catalogo quando o snapshot ja esta completo', !buscou, JSON.stringify(globalThis.__rpcLog.map(x=>x[0])));
  check('usa o texto gravado', v('esc_min')==='SUPERIOR GRAVADO', v('esc_min'));
} else {
  check('busca o cargo no catalogo', buscou, JSON.stringify(globalThis.__rpcLog.map(x=>x[0])));
  check('preenche escolaridade fora do escopo', v('esc_min')==='ENSINO SUPERIOR COMPLETO', v('esc_min'));
  check('preenche idioma mínimo (Gestor)', v('idi_min')==='NÃO REQUERIDO', v('idi_min'));
  check('preenche idioma desejável (Gestor)', v('idi_des')==='ESPANHOL BÁSICO', v('idi_des'));
  check('preenche competências técnicas', v('tec_min')==='PACOTE OFFICE', v('tec_min'));
  check('preserva o que ja estava gravado', v('ATIV_DESC')==='MISSAO GRAVADA', v('ATIV_DESC'));
  const fontes=[...$('#content').querySelectorAll('.current-source')].map(x=>x.textContent);
  check('mostra "Texto atual da base" nos campos fora do escopo', fontes.some(t=>t.includes('ESPANHOL BÁSICO')), JSON.stringify(fontes.slice(0,3)));
}
console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:`\nsnapshot ${SNAPSHOT} OK`);
