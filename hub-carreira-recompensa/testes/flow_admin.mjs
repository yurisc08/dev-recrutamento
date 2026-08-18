/* ADMIN corrige qualquer campo, em qualquer status, inclusive apos concluir. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const PERFIL=process.env.PERFIL||'ADMIN';
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[
 {id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'GESTOR',field_type:'textarea',required:false,active:true,sort_order:10},
 {id:'f2',field_key:'esc_min',label:'Escolaridade mínima',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:20},
 {id:'f3',field_key:'idioma_min',label:'Idioma mínimo',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:30}];
// Concluida E com escopo restrito: os dois bloqueios que o ADMIN precisa furar.
const REQ={id:'r1',request_number:'SOL-009',title:'PROGRAMADOR',job_code:'120',status:'Concluído',
 company:'MARCOPOLO S A',branch:'AB',deadline:'2026-09-30',updated_at:'2026-08-18T10:00:00Z',progress:100,
 manager:{name:'Gestor Um'},request_kind:'UPDATE',intake_request_id:'i1',
 intake_selected_sections:['ATIV_DESC'],
 source_snapshot:{ATIV_DESC:'MISSAO',SKILL_30:'ENSINO MEDIO',SKILL_32:'INGLES'},
 request_field_values:[{field_id:'f1',field_value:'MISSAO'},{field_id:'f2',field_value:'ENSINO MEDIO'},{field_id:'f3',field_value:'INGLES'}],
 history:[]};
const TABLES={profiles:[{id:'u1',name:'Quem Testa',email:'x@marcopolo.com.br',role:PERFIL,active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
const RPCS={list_visible_requests:[REQ],list_manager_intake_requests:[],get_visible_request:REQ,
 list_section_catalog:[],get_request_additional_approval:null,list_available_approvers:[],get_request_intake_metadata:{}};
const stub=`
const JSZip={}; const TABLES=${JSON.stringify(TABLES)}, RPCS=${JSON.stringify(RPCS)};
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
for (const k of ['FormData','Event','MouseEvent','Blob','URL','CustomEvent','HTMLElement','Node','Element'])
  { try { Object.defineProperty(globalThis,k,{value:w[k],configurable:true,writable:true}); } catch(e) {} }
globalThis.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
globalThis.scrollTo=()=>{}; globalThis.requestAnimationFrame=(f)=>f();
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
w.document.querySelectorAll('form').forEach(f=>{for(const el of [...f.elements]){const n=el.getAttribute&&el.getAttribute('name');if(n)Object.defineProperty(f,n,{get:()=>f.elements[n],configurable:true});}});
let confirmResp=true; globalThis.confirm=()=>confirmResp; globalThis.prompt=()=>'';
const errs=[]; w.addEventListener('error',e=>errs.push(e.message));
await import('data:text/javascript;base64,'+Buffer.from(stub+js,'utf8').toString('base64'));
await new Promise(r=>setTimeout(r,300));

const $=(s)=>w.document.querySelector(s);
let bad=0; const check=(n,c,extra)=>{console.log((c?'  ok  ':'  FAIL ')+n+(c?'':' :: '+extra));if(!c){bad++;process.exitCode=1}};
$('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,200));

const campos=['ATIV_DESC','esc_min','idioma_min'].map(k=>$(`#content [name="${k}"]`));
console.log(`== perfil ${PERFIL}, solicitação concluída com escopo restrito ==`);

if (PERFIL!=='ADMIN') {
  check('nao-admin fica bloqueado em tudo', campos.every(el=>el.disabled), campos.map(e=>e.disabled).join(','));
  check('nao-admin nao ve Salvar correcao', !$('#actions').textContent.includes('Salvar correção'), $('#actions').textContent);
  check('nao-admin ve o aviso de somente consulta', $('#content').textContent.includes('somente para consulta'));
  check('nao-admin nao ve o aviso de administrador', !$('#content').textContent.includes('Modo administrador'));
  console.log(bad?`\n${bad} falha(s)`:`\nperfil ${PERFIL} OK`); process.exit(process.exitCode||0);
}
check('todos os campos liberados', campos.every(el=>!el.disabled), campos.map(e=>e.disabled).join(','));
check('inclusive fora do escopo da revisao', !$('#content [name="idioma_min"]').disabled);
check('aviso de modo administrador visivel', $('#content').textContent.includes('Modo administrador'));
check('nao mostra o aviso de somente consulta', !$('#content').textContent.includes('somente para consulta'));
check('botao Salvar correcao presente', $('#actions').textContent.includes('Salvar correção'), $('#actions').textContent);
check('botao Baixar documento continua', $('#actions').textContent.includes('Baixar documento'));

console.log('== salvar a correcao ==');
$('#content [name="idioma_min"]').value='ESPANHOL INTERMEDIARIO';
let antes=globalThis.__rpcLog.filter(x=>x[0]==='save_dynamic_values').length;
confirmResp=false; await globalThis.saveApprovedCorrection(); await new Promise(r=>setTimeout(r,80));
check('pede confirmacao', globalThis.__rpcLog.filter(x=>x[0]==='save_dynamic_values').length===antes);
confirmResp=true; await globalThis.saveApprovedCorrection(); await new Promise(r=>setTimeout(r,150));
const sv=globalThis.__rpcLog.filter(x=>x[0]==='save_dynamic_values').pop();
check('grava a correcao', !!sv && sv[1].p_values.idioma_min==='ESPANHOL INTERMEDIARIO', JSON.stringify(sv&&sv[1].p_values));
check('manda todos os campos, nao so o do escopo', sv && Object.keys(sv[1].p_values).length===3, JSON.stringify(Object.keys(sv?.[1].p_values||{})));
check('avisa para gerar o documento de novo', $('#toast').textContent.includes('documento novamente'), $('#toast').textContent);

console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:'\nliberacao do ADMIN OK');
