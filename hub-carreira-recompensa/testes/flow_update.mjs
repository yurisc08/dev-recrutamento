/* Atualizacao de cargo existente: so o escopo e revisado, o resto vem da base
   e nao pode travar a conclusao. Reproduz o caso relatado, em que campos
   obrigatorios FORA do escopo estavam vazios e bloqueavam tudo. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const TIPO=process.env.TIPO||'update';   // update | novo
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[
 {id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'CR',field_type:'textarea',required:true,active:true,sort_order:10},
 {id:'f2',field_key:'DESCRICAO_CARGO',label:'Principais responsabilidades/atividades',owner_role:'CR',field_type:'textarea',required:true,active:true,sort_order:20},
 {id:'f3',field_key:'idi_min',label:'Idioma mínimo',owner_role:'GESTOR',field_type:'text',required:false,active:true,sort_order:30},
 // os dois campos do print: obrigatorios, do Gestor, FORA do escopo e sem valor na base
 {id:'f4',field_key:'exp_prof',label:'Experiência profissional desejável',owner_role:'GESTOR',field_type:'text',required:true,active:true,sort_order:40},
 {id:'f5',field_key:'comp_mp',label:'Competências Marcopolo desejáveis',owner_role:'GESTOR',field_type:'textarea',required:true,active:true,sort_order:50}];
const BASE={id:'r1',request_number:'SOL-020',title:'ASSISTENTE ADMINISTRATIVO',job_code:'450',
 status:'Rascunho C&R',company:'MARCOPOLO S A',branch:'AB',deadline:'2026-09-30',
 updated_at:'2026-08-18T10:00:00Z',manager:{name:'Milena Castilhos'},
 intake_request_id:'i1',intake_requester_name:'Milena Castilhos',intake_justification:'Teste',
 source_job_id:'j1', request_field_values:[], history:[]};
const REQ = TIPO==='novo'
 ? {...BASE, request_kind:'NEW', intake_selected_sections:[], source_snapshot:{}}
 : {...BASE, request_kind:'UPDATE', intake_selected_sections:['ATIV_DESC'],
    intake_suggested_values:{ATIV_DESC:'NOVA MISSÃO SUGERIDA'},
    // a base tem missao e responsabilidades, mas NAO tem experiencia nem comportamentais
    source_snapshot:{ATIV_DESC:'MISSÃO ANTIGA',DESCRICAO_CARGO:'RESP ATUAL',SKILL_32:'NÃO REQUERIDO',SKILL_36:'',SKILL_37:''}};
const TABLES={profiles:[{id:'u1',name:'CR',email:'cr@marcopolo.com.br',role:'CR',active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
const RPCS={list_visible_requests:[REQ],list_manager_intake_requests:[],get_visible_request:REQ,
 list_section_catalog:[],list_app_settings:[],get_request_additional_approval:null,
 list_available_approvers:[],get_request_intake_metadata:{},
 get_job_catalog_details:{raw_data:{ATIV_DESC:'MISSÃO ANTIGA',DESCRICAO_CARGO:'RESP ATUAL',SKILL_32:'NÃO REQUERIDO',SKILL_36:'',SKILL_37:''}}};
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
$('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,400));
const txt=()=>$('#content').textContent;
const campo=(k)=>$(`#content [name="${k}"]`);

console.log(`== ${TIPO} ==`);
if (TIPO==='novo') {
  check('cargo novo nao separa em blocos', !$('.kept-block'));
  check('todos os campos abertos ao C&R', !campo('ATIV_DESC').disabled);
  check('obrigatorio segue obrigatorio', txt().includes('Experiência profissional desejável'));
  campo('ATIV_DESC').value=''; 
  await globalThis.transition('approve'); await new Promise(r=>setTimeout(r,80));
  check('cargo novo cobra os obrigatorios', $('#toast').textContent.includes('obrigatórios'), $('#toast').textContent);
} else {
  check('explica que e atualizacao de cargo existente', txt().includes('Atualização de cargo existente'));
  check('bloco de campos mantidos existe', !!$('.kept-block'), 'ausente');
  check('conta os campos mantidos', ($('.kept-block summary')?.textContent||'').includes('(4)'), $('.kept-block summary')?.textContent);
  check('campo em revisao fica editavel', !campo('ATIV_DESC').disabled);
  check('campo mantido fica bloqueado', campo('exp_prof').disabled);
  check('campo mantido esta dentro do bloco recolhido', !!$('.kept-block [name="exp_prof"]'));
  check('missao veio da sugestao do Gestor', campo('ATIV_DESC').value==='NOVA MISSÃO SUGERIDA', campo('ATIV_DESC').value);
  check('responsabilidades vieram da base', campo('DESCRICAO_CARGO').value==='RESP ATUAL', campo('DESCRICAO_CARGO').value);
  check('idioma veio da base', campo('idi_min').value==='NÃO REQUERIDO', campo('idi_min').value);

  console.log('-- o caso do print: obrigatorios vazios fora do escopo');
  check('experiencia esta mesmo vazia', campo('exp_prof').value==='', campo('exp_prof').value);
  check('competencias esta mesmo vazia', campo('comp_mp').value==='', campo('comp_mp').value);
  const rotulos=[...$('.kept-block').querySelectorAll('.field-owner')].map(x=>x.textContent);
  check('mantidos deixam de ser marcados como obrigatorios', rotulos.every(t=>t.includes('Opcional')), JSON.stringify(rotulos));

  const antes=globalThis.__rpcLog.filter(x=>x[0]==='transition_dynamic_request').length;
  await globalThis.transition('approve'); await new Promise(r=>setTimeout(r,150));
  const depois=globalThis.__rpcLog.filter(x=>x[0]==='transition_dynamic_request');
  check('CONCLUI mesmo com obrigatorios vazios fora do escopo', depois.length===antes+1, $('#toast').textContent);

  console.log('-- mas o que esta em revisao continua sendo cobrado');
  $('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await new Promise(r=>setTimeout(r,300));
  campo('ATIV_DESC').value='';
  const a2=globalThis.__rpcLog.filter(x=>x[0]==='transition_dynamic_request').length;
  await globalThis.transition('approve'); await new Promise(r=>setTimeout(r,100));
  check('bloqueia quando o campo EM REVISAO esta vazio', globalThis.__rpcLog.filter(x=>x[0]==='transition_dynamic_request').length===a2, $('#toast').textContent);
  check('aponta o campo certo', $('#toast').textContent.includes('Missão'), $('#toast').textContent);
  check('nao cita os campos mantidos', !$('#toast').textContent.includes('Experiência'), $('#toast').textContent);
}
console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:`\nfluxo ${TIPO} OK`);
