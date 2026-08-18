import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const dir=RAIZ;
const html=fs.readFileSync(dir+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[
 {id:'f-mission',field_key:'ATIV_DESC',label:'Missão',owner_role:'CR',field_type:'textarea',required:true,active:true,sort_order:10},
 {id:'f-resp',field_key:'DESCRICAO_CARGO',label:'Principais responsabilidades/atividades',owner_role:'CR',field_type:'textarea',required:true,active:true,sort_order:20},
 {id:'f-esc',field_key:'esc_min',label:'Escolaridade mínima',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:30},
 {id:'f-idi',field_key:'idioma_min',label:'Idioma mínimo',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:40}];
const REQ={id:'r1',request_number:'SOL-001',title:"Analista d'Operações & P&D",job_code:'120',status:'Aguardando preenchimento',
 company:'MARCOPOLO S A',branch:'AB',deadline:'2026-09-30',updated_at:'2026-08-18T10:00:00Z',progress:40,
 manager:{name:'Fulano',company:'MARCOPOLO S A',branch:'AB'},request_kind:'UPDATE',
 intake_selected_sections:['ATIV_DESC','DESCRICAO_CARGO'],
 source_snapshot:{ATIV_DESC:'MISSAO DA BASE',DESCRICAO_CARGO:'RESP 1\nRESP 2',SKILL_30:'SUPERIOR COMPLETO',SKILL_32:'INGLES BASICO'},
 request_field_values:[],history:[{created_at:'2026-08-18T09:00:00Z',action:'Criado',author_name:'C&R'}]};
const TABLES={profiles:[{id:'u1',name:'Gestor Teste',email:'g@marcopolo.com.br',role:'CR',active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
const RPCS={list_visible_requests:[REQ],list_manager_intake_requests:[],get_visible_request:REQ,
 get_request_additional_approval:null,list_available_approvers:[],get_request_intake_metadata:{}};
const rpcLog=[];
const stub=`
const JSZip={};
const TABLES=${JSON.stringify(TABLES)}, RPCS=${JSON.stringify(RPCS)};
globalThis.__rpcLog=[];
function qb(table){
  const res={data:TABLES[table]||[],error:null};
  const b={select:()=>b,eq:()=>b,in:()=>b,order:()=>b,limit:()=>b,
    maybeSingle:async()=>({data:(TABLES[table]||[])[0]||null,error:null}),
    insert:async()=>({error:null}),update:()=>b,delete:()=>b,
    then:(ok)=>Promise.resolve(res).then(ok),catch:(f)=>Promise.resolve(res)};
  return b;
}
const createClient=()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),signOut:async()=>{},onAuthStateChange:()=>{}},
  from:(t)=>qb(t),
  rpc:(name,args)=>{globalThis.__rpcLog.push([name,args]);
    const res={data:(name in RPCS)?RPCS[name]:[],error:null};
    const pr=Promise.resolve(res); const orig=pr.catch.bind(pr); pr.catch=()=>pr; return pr;},
  functions:{invoke:async()=>({data:{},error:null})}
});
const SUPABASE_URL='x',SUPABASE_ANON_KEY='y',APP_URL='z';
`;
const dom=new JSDOM(html.replace(/<script type="module">[\s\S]*<\/script>/,''),{url:'https://exemplo.test/'});
const w=dom.window;
// Em um module de navegador, window E o objeto global: window.foo=1 cria a
// global foo. Replicamos isso aqui para o teste refletir o browser.
for (const k of Object.getOwnPropertyNames(w)) {
  if (k==='window'||k==='globalThis'||k==='self'||k==='top'||k==='parent'||k==='frames') continue;
  if (k in globalThis && !['document','location','navigator','origin','name','close','focus','blur','fetch','crypto','performance'].includes(k)) continue;
  try { Object.defineProperty(globalThis,k,{get:()=>w[k],set:(v)=>{w[k]=v;},configurable:true}); } catch(e) {}
}
try { Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true,writable:true}); } catch(e) {}
for (const k of ['FormData','Event','MouseEvent','Blob','URL','CustomEvent','HTMLElement','Node','DOMParser','getComputedStyle','Element','File'])
  { try { Object.defineProperty(globalThis,k,{value:w[k],configurable:true,writable:true}); } catch(e) {} }
globalThis.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
globalThis.scrollTo=()=>{};
globalThis.requestAnimationFrame=(f)=>f();
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
// jsdom nao implementa o named getter de form nem [LegacyOverrideBuiltIns],
// que nos navegadores faz <input name="id"> sobrepor form.id.
w.document.querySelectorAll('form').forEach(f=>{for(const el of [...f.elements]){const n=el.getAttribute&&el.getAttribute('name');if(n)Object.defineProperty(f,n,{get:()=>f.elements[n],configurable:true});}});
const errs=[]; w.addEventListener('error',e=>errs.push(e.message));
const origErr=console.error; console.error=(...a)=>errs.push(a.map(String).join(' '));

await import('data:text/javascript;base64,'+Buffer.from(stub+js,'utf8').toString('base64'));
await new Promise(r=>setTimeout(r,300));
console.error=origErr;
const $=(s)=>w.document.querySelector(s);
let bad=0; const check=(n,c,extra)=>{console.log((c?'  ok  ':'  FAIL ')+n+(c?'':' :: '+(extra||'')));if(!c){bad++;process.exitCode=1}};
const log=()=>globalThis.__rpcLog.map(x=>x[0]);

check('perfil C&R identificado', $('#userRole').textContent==='Carreira & Recompensa', $('#userRole').textContent);
check('menu Usuários visivel', !$('#navManagers').classList.contains('hidden'));

// abrir o dialog de nova solicitacao
$('#newRequest').click();
await new Promise(r=>setTimeout(r,120));
check('dialog aberto', $('#requestDialog').hasAttribute('open'));
check('prazo visivel para C&R', !$('#requestDeadlineField').classList.contains('hidden'));
check('validacao adicional visivel para C&R', !$('#requestOptionalApproval').classList.contains('hidden'));

const f=$('#requestForm');
const submit=async()=>{ f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); await new Promise(r=>setTimeout(r,120)); };

const antes=log().filter(x=>x==='create_request').length;
await submit();
check('nao cria com formulario vazio', log().filter(x=>x==='create_request').length===antes);
check('avisa sobre o nome do cargo', $('#toast').textContent.includes('nome do cargo'), $('#toast').textContent);

f.title.value='ANALISTA';
await submit();
check('avisa sobre a empresa', $('#toast').textContent.includes('empresa'), $('#toast').textContent);

// empresa/filial nao tem opcoes (sem cadastro) -> preenche manualmente para seguir
f.company.innerHTML='<option value="MARCOPOLO S A" data-id="c1">MARCOPOLO S A</option>';
f.company.value='MARCOPOLO S A';
f.branch.disabled=false; f.branch.innerHTML='<option value="AB">AB</option>'; f.branch.value='AB';
await submit();
check('avisa sobre o setor', $('#toast').textContent.includes('setor'), $('#toast').textContent);

f.sector.value='TI';
await submit();
check('avisa sobre o Gestor', $('#toast').textContent.includes('Gestor'), $('#toast').textContent);

f.manager_id.value='u2';
await submit();
check('avisa sobre o prazo', $('#toast').textContent.includes('prazo'), $('#toast').textContent);

f.deadline.value='2026-12-01';
f.use_additional_approval.value='YES';
f.use_additional_approval.dispatchEvent(new w.Event('change'));
await submit();
check('avisa sobre o aprovador antes de criar', $('#toast').textContent.includes('aprovador'), $('#toast').textContent);
check('ainda nao criou nada', log().filter(x=>x==='create_request').length===antes);

f.use_additional_approval.value='NO';
f.use_additional_approval.dispatchEvent(new w.Event('change'));
await submit();
check('cria a solicitacao com tudo preenchido', log().filter(x=>x==='create_request').length===antes+1, log().join(','));
check('dialog fechado apos criar', !$('#requestDialog').hasAttribute('open'));

console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:'\nfluxo C&R OK');
