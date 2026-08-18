/* Fluxo do pedido nascido com o Gestor: C&R abre o rascunho ja preenchido e
   decide entre concluir direto ou sugerir e enviar de volta ao Gestor. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[
 {id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'GESTOR',field_type:'textarea',required:true,active:true,sort_order:10},
 {id:'f2',field_key:'DESCRICAO_CARGO',label:'Principais responsabilidades/atividades',owner_role:'GESTOR',field_type:'textarea',required:true,active:true,sort_order:20},
 {id:'f3',field_key:'esc_min',label:'Escolaridade mínima',owner_role:'CR',field_type:'text',required:true,active:true,sort_order:30}];
/* Tres cenarios: UPDATE vindo do Gestor (padrao), cargo NOVO vindo do Gestor
   e um rascunho criado pelo proprio C&R, que nao pode ganhar o Concluir. */
const CENARIO=process.env.CENARIO||'update';
const BASE={id:'r1',request_number:'SOL-002',title:'PROGRAMADOR SISTEMAS',job_code:'120',
 status:'Rascunho C&R',company:'MARCOPOLO S A',branch:'AB',deadline:'2026-09-30',
 updated_at:'2026-08-18T10:00:00Z',progress:10,manager:{name:'Gestor Um'},
 request_kind:'UPDATE',intake_request_id:'i1',intake_requester_name:'Gestor Um',
 intake_justification:'Cargo mudou de escopo apos a reestruturacao.',
 intake_selected_sections:['ATIV_DESC','DESCRICAO_CARGO'],
 intake_suggested_values:{ATIV_DESC:'NOVA MISSAO SUGERIDA PELO GESTOR',DESCRICAO_CARGO:'NOVAS RESPONSABILIDADES'},
 source_snapshot:{ATIV_DESC:'MISSAO ANTIGA DA BASE',DESCRICAO_CARGO:'RESP ANTIGA',SKILL_30:'ENSINO MEDIO'},
 request_field_values:[{field_id:'f1',field_value:'NOVA MISSAO SUGERIDA PELO GESTOR'},
                       {field_id:'f2',field_value:'NOVAS RESPONSABILIDADES'},
                       {field_id:'f3',field_value:'ENSINO MEDIO'}],
 history:[]};
const REQ = CENARIO==='novo'
  ? {...BASE, request_number:'SOL-003', request_kind:'NEW', title:'ANALISTA DE DADOS',
     intake_selected_sections:[], intake_suggested_values:{}, source_snapshot:{},
     intake_manager_values:{ATIV_DESC:'MISSAO ESCRITA PELO GESTOR',DESCRICAO_CARGO:'ATIVIDADES DO CARGO NOVO'},
     intake_justification:'Nova frente de analytics.',
     request_field_values:[{field_id:'f1',field_value:'MISSAO ESCRITA PELO GESTOR'},
                           {field_id:'f2',field_value:'ATIVIDADES DO CARGO NOVO'},
                           {field_id:'f3',field_value:'ENSINO SUPERIOR'}]}
  : CENARIO==='cr'
  ? {...BASE, request_number:'SOL-004', request_kind:'NEW', intake_request_id:null,
     intake_requester_name:null, intake_justification:null,
     intake_selected_sections:[], intake_suggested_values:{},
     intake_manager_values:{}, source_snapshot:{}, request_field_values:[]}
  : BASE;
const TABLES={profiles:[{id:'u1',name:'CR Teste',email:'cr@marcopolo.com.br',role:'CR',active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
const RPCS={list_visible_requests:[REQ],list_manager_intake_requests:[],get_visible_request:REQ,
 get_request_additional_approval:null,list_available_approvers:[],get_request_intake_metadata:{}};
const stub=`
const JSZip={};
const TABLES=${JSON.stringify(TABLES)}, RPCS=${JSON.stringify(RPCS)};
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
for (const k of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle'])
  { try { Object.defineProperty(globalThis,k,{value:w[k].bind(w),configurable:true,writable:true}); } catch(e) {} }
globalThis.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
globalThis.scrollTo=()=>{}; globalThis.requestAnimationFrame=(f)=>f();
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
w.document.querySelectorAll('form').forEach(f=>{for(const el of [...f.elements]){const n=el.getAttribute&&el.getAttribute('name');if(n)Object.defineProperty(f,n,{get:()=>f.elements[n],configurable:true});}});
let promptResp='', confirmResp=true;
globalThis.prompt=()=>promptResp; globalThis.confirm=()=>confirmResp;
const errs=[]; w.addEventListener('error',e=>errs.push(e.message));
await import('data:text/javascript;base64,'+Buffer.from(stub+js,'utf8').toString('base64'));
await new Promise(r=>setTimeout(r,300));

const $=(s)=>w.document.querySelector(s);
let bad=0; const check=(n,c,extra)=>{console.log((c?'  ok  ':'  FAIL ')+n+(c?'':' :: '+extra));if(!c){bad++;process.exitCode=1}};
const log=()=>globalThis.__rpcLog;

$('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,200));

console.log(`== cenario: ${CENARIO} ==`);
const acoes=$('#actions').textContent;
if (CENARIO==='cr') {
  check('rascunho do proprio C&R NAO ganha Concluir', !acoes.includes('Concluir solicitação'), acoes);
  check('rascunho do proprio C&R mantem Atribuir ao Gestor', acoes.includes('Atribuir ao Gestor'), acoes);
  check('painel do pedido do Gestor fica oculto', $('#intakeReferencePanel').classList.contains('hidden'));
  console.log(bad?`\n${bad} falha(s)`:'\ncenario cr OK'); process.exit(process.exitCode||0);
}
check('botao Concluir disponivel ja no rascunho', acoes.includes('Concluir solicitação'), acoes);
check('botao Sugerir e enviar ao Gestor', acoes.includes('Sugerir e enviar ao Gestor'), acoes);
check('campo do codigo do cargo visivel', !!$('#finalJobCode') && !$('#crFinalOptions').classList.contains('hidden'));
check('conferencia opcional so aparece na validacao', !$('#crFinalOptions').textContent.includes('Enviar novamente ao Gestor'));

console.log('== painel de referencia do pedido ==');
const ref=$('#intakeReferencePanel');
check('painel visivel', !ref.classList.contains('hidden'));
check('mostra o solicitante', ref.textContent.includes('Gestor Um'), ref.textContent.slice(0,120));
check('mostra a justificativa', ref.textContent.includes(CENARIO==='novo'?'analytics':'reestruturacao'), ref.textContent.slice(0,160));
if (CENARIO==='update') {
  check('mostra o texto atual da base', ref.textContent.includes('MISSAO ANTIGA DA BASE'));
  check('mostra a sugestao do Gestor', ref.textContent.includes('NOVA MISSAO SUGERIDA PELO GESTOR'));
  check('rotula as duas colunas', ref.textContent.includes('Hoje na base') && ref.textContent.includes('Sugestão do Gestor'));
} else {
  check('identifica como criacao de cargo novo', ref.textContent.includes('Criação de cargo novo'), ref.textContent.slice(0,140));
  check('explica que o Gestor ja preencheu os campos', ref.textContent.includes('já está no formulário'), ref.textContent.slice(0,300));
}

console.log('== formulario ja puxou as informacoes ==');
const esperada = CENARIO==='novo' ? 'MISSAO ESCRITA PELO GESTOR' : 'NOVA MISSAO SUGERIDA PELO GESTOR';
check('missao preenchida com o conteudo do Gestor', $('#content [name="ATIV_DESC"]').value===esperada, $('#content [name="ATIV_DESC"]').value);
check('escolaridade preenchida', $('#content [name="esc_min"]').value===(CENARIO==='novo'?'ENSINO SUPERIOR':'ENSINO MEDIO'), $('#content [name="esc_min"]').value);

console.log('== concluir direto ==');
let antes=log().filter(x=>x[0]==='transition_dynamic_request').length;
confirmResp=false;
await globalThis.transition('approve');
await new Promise(r=>setTimeout(r,80));
check('pede confirmacao antes de concluir', log().filter(x=>x[0]==='transition_dynamic_request').length===antes);
confirmResp=true;
await globalThis.transition('approve');
await new Promise(r=>setTimeout(r,120));
const ap=log().filter(x=>x[0]==='transition_dynamic_request').pop();
check('conclui a partir do rascunho', ap && ap[1].p_action==='approve', JSON.stringify(ap));

console.log('== bloqueia conclusao com obrigatorio vazio ==');
$('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,200));
$('#content [name="esc_min"]').value='';
antes=log().filter(x=>x[0]==='transition_dynamic_request').length;
await globalThis.transition('approve');
await new Promise(r=>setTimeout(r,80));
check('nao conclui com campo obrigatorio vazio', log().filter(x=>x[0]==='transition_dynamic_request').length===antes);
check('avisa qual campo falta', $('#toast').textContent.includes('Escolaridade mínima'), $('#toast').textContent);

console.log('== sugerir e enviar ao Gestor ==');
$('#content [name="esc_min"]').value='ENSINO SUPERIOR';
promptResp='Confira a missao que ajustei e aprove.';
antes=log().filter(x=>x[0]==='transition_dynamic_request').length;
await globalThis.sendManagerApproval();
await new Promise(r=>setTimeout(r,150));
const env=log().filter(x=>x[0]==='transition_dynamic_request').pop();
check('envia ao Gestor', env && env[1].p_action==='request', JSON.stringify(env&&env[1]));
check('leva a orientacao do C&R', env && env[1].p_reason==='Confira a missao que ajustei e aprove.', JSON.stringify(env&&env[1].p_reason));
check('salva os valores antes de enviar', log().some(x=>x[0]==='save_dynamic_values'));

console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:`\nfluxo ${CENARIO} OK`);
