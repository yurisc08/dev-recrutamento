/* Codigo do cargo: nao existe antes da aprovacao, e lancado no sistema depois.
   E as "Opcoes finais de C&R" so aparecem na validacao. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const ETAPA=process.env.ETAPA||'rascunho';   // rascunho | validacao | concluida | concluida-com-codigo
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[{id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'CR',field_type:'textarea',required:true,active:true,sort_order:10}];
const ST={rascunho:'Rascunho C&R',validacao:'Aguardando validação de C&R',concluida:'Concluído','concluida-com-codigo':'Concluído'};
const REQ={id:'r1',request_number:'SOL-030',title:'ANALISTA DE DADOS',
 job_code: ETAPA==='concluida-com-codigo' ? '1204' : '',
 status:ST[ETAPA],request_kind:'NEW',intake_request_id:'i1',
 company:'MARCOPOLO S A',branch:'AB',deadline:'2026-09-30',updated_at:'2026-08-18T10:00:00Z',
 manager:{name:'Gestor Um'},source_snapshot:{},
 request_field_values:[{field_id:'f1',field_value:'MISSAO PREENCHIDA'}],history:[]};
const TABLES={profiles:[{id:'u1',name:'CR',email:'cr@marcopolo.com.br',role:'CR',active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
const RPCS={list_visible_requests:[REQ],list_manager_intake_requests:[],get_visible_request:REQ,
 list_section_catalog:[],list_app_settings:[],get_request_additional_approval:null,
 list_available_approvers:[],get_request_intake_metadata:{}};
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
const dom=new JSDOM(html.replace(/<script type="module">[\s\S]*<\/script>/,()=>''),{url:'https://exemplo.test/'});
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
const visivel=(sel)=>{const el=$(sel);return !!el && !el.classList.contains('hidden');};

console.log(`== ${ETAPA} ==`);
if (ETAPA==='rascunho') {
  check('painel de codigo pendente no painel geral', $('#metrics').textContent.includes('Código pendente')===false, $('#metrics').textContent);
}
$('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,350));

if (ETAPA==='rascunho') {
  check('Opções finais NAO aparecem no rascunho', !visivel('#crFinalOptions'));
  check('campo de codigo NAO aparece no rascunho', !visivel('#jobCodePanel'));
  check('cabecalho diz que o codigo ainda nao foi lancado', $('#detailHead').textContent.includes('ainda não lançado'), $('#detailHead').textContent.slice(0,140));
  const antes=globalThis.__rpcLog.filter(x=>x[0]==='transition_dynamic_request').length;
  await globalThis.transition('approve'); await new Promise(r=>setTimeout(r,120));
  check('CONCLUI sem codigo do cargo', globalThis.__rpcLog.filter(x=>x[0]==='transition_dynamic_request').length===antes+1, $('#toast').textContent);
}
if (ETAPA==='validacao') {
  check('Opções finais aparecem na validação', visivel('#crFinalOptions'));
  check('painel traz so a conferência do Gestor', $('#crFinalOptions').textContent.includes('Conferência opcional do Gestor'));
  check('painel NAO pede codigo do cargo', !$('#crFinalOptions').textContent.includes('Código do cargo'), $('#crFinalOptions').textContent.slice(0,160));
  check('campo de codigo NAO aparece antes de concluir', !visivel('#jobCodePanel'));
  check('acoes trazem Devolver e Concluir', $('#actions').textContent.includes('Devolver')&&$('#actions').textContent.includes('Concluir'), $('#actions').textContent);
}
if (ETAPA==='concluida') {
  check('campo de codigo aparece na concluida', visivel('#jobCodePanel'));
  check('trata como pendencia', $('#jobCodePanel').textContent.includes('Pendente'), $('#jobCodePanel').textContent.slice(0,120));
  check('botao diz Registrar', $('#jobCodePanel').textContent.includes('Registrar código'));
  check('Opções finais somem depois de concluida', !visivel('#crFinalOptions'));
  check('cabecalho marca pendencia', $('#detailHead').textContent.includes('pendente de lançamento'), $('#detailHead').textContent.slice(0,150));
  $('#finalJobCode').value='1204';
  await globalThis.saveFinalJobCode(); await new Promise(r=>setTimeout(r,150));
  const sv=globalThis.__rpcLog.filter(x=>x[0]==='cr_set_request_job_code').pop();
  check('grava o codigo', sv && sv[1].p_job_code==='1204', JSON.stringify(sv&&sv[1]));
  check('avisa para gerar o documento de novo', $('#toast').textContent.includes('documento'), $('#toast').textContent);
}
if (ETAPA==='concluida-com-codigo') {
  check('campo continua disponivel para correcao', visivel('#jobCodePanel'));
  check('nao trata como pendencia', !$('#jobCodePanel').textContent.includes('Pendente'), $('#jobCodePanel').textContent.slice(0,120));
  check('botao vira Atualizar', $('#jobCodePanel').textContent.includes('Atualizar código'));
  check('cabecalho mostra o codigo', $('#detailHead').textContent.includes('1204'));
  check('sem selo de pendencia na lista', !$('#requests').textContent.includes('Código pendente'));
}
console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:`\netapa ${ETAPA} OK`);
