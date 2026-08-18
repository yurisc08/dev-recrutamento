import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const dir=RAIZ;
const html=fs.readFileSync(dir+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[
 {id:'f-mission',field_key:'ATIV_DESC',label:'Missão',owner_role:'GESTOR',field_type:'textarea',required:true,active:true,sort_order:10},
 {id:'f-resp',field_key:'DESCRICAO_CARGO',label:'Principais responsabilidades/atividades',owner_role:'GESTOR',field_type:'textarea',required:true,active:true,sort_order:20},
 {id:'f-esc',field_key:'esc_min',label:'Escolaridade mínima',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:30},
 {id:'f-idi',field_key:'idioma_min',label:'Idioma mínimo',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:40}];
const REQ={id:'r1',request_number:'SOL-001',title:"Analista d'Operações & P&D",job_code:'120',status:'Aguardando preenchimento',
 company:'MARCOPOLO S A',branch:'AB',deadline:'2026-09-30',updated_at:'2026-08-18T10:00:00Z',progress:40,
 manager:{name:'Fulano',company:'MARCOPOLO S A',branch:'AB'},request_kind:'UPDATE',
 intake_selected_sections:['ATIV_DESC','DESCRICAO_CARGO'],
 source_snapshot:{ATIV_DESC:'MISSAO DA BASE',DESCRICAO_CARGO:'RESP 1\nRESP 2',SKILL_30:'SUPERIOR COMPLETO',SKILL_32:'INGLES BASICO'},
 request_field_values:[],history:[{created_at:'2026-08-18T09:00:00Z',action:'Criado',author_name:'C&R'}]};
const TABLES={profiles:[{id:'u1',name:'Gestor Teste',email:'g@marcopolo.com.br',role:'GESTOR',active:true}],
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
for (const k of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle'])
  { try { Object.defineProperty(globalThis,k,{value:w[k].bind(w),configurable:true,writable:true}); } catch(e) {} }
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

check('app visivel apos login', !$('#app').classList.contains('hidden'));
check('login oculto apos login', $('#login').classList.contains('hidden'));
check('metricas renderizadas', $('#metrics').children.length===5);
check('card da solicitacao renderizado', $('#requests').children.length===1);
check('titulo com apostrofo escapado no HTML', $('#requests').textContent.includes("Analista d'Operações & P&D"), $('#requests').textContent.slice(0,80));
check('botao Abrir usa delegacao', !!$('.open-request-btn'));

// filtro de busca
$('#search').value='inexistente'; $('#search').dispatchEvent(new w.Event('input'));
check('busca filtra (0 resultados)', $('#requests').children.length===0 && !$('#empty').classList.contains('hidden'));
$('#search').value=''; $('#search').dispatchEvent(new w.Event('input'));
check('busca limpa volta 1 resultado', $('#requests').children.length===1);
// filtro de status
$('#status').value='Concluído'; $('#status').dispatchEvent(new w.Event('change'));
check('filtro de status funciona', $('#requests').children.length===0);
$('#status').value=''; $('#status').dispatchEvent(new w.Event('change'));

// abrir o detalhe
$('.open-request-btn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,200));
check('tela de detalhe visivel', !$('#detailView').classList.contains('hidden'));
check('campos renderizados', $('#content').querySelectorAll('[name]').length===4, String($('#content').querySelectorAll('[name]').length));
const scope=$('.review-scope-note')?.textContent||'';
check('nota de escopo com rotulos corretos', scope.includes('Missão — ATIV_DESC') && scope.includes('DESCRICAO_CARGO'), scope);
const mission=$('#content [name="ATIV_DESC"]'), esc=$('#content [name="esc_min"]');
check('campo do Gestor no escopo esta editavel', mission && !mission.disabled);
check('campo fora do escopo esta bloqueado', esc && esc.disabled);
check('texto da base preenchido no campo', mission.value==='MISSAO DA BASE', mission.value);
const srcs=[...$('#content').querySelectorAll('.current-source')].map(x=>x.textContent);
check('texto atual da base exibido', srcs.some(x=>x.includes('MISSAO DA BASE')) && srcs.some(x=>x.includes('SUPERIOR COMPLETO')), JSON.stringify(srcs));
check('acoes do Gestor disponiveis', $('#actions').textContent.includes('Enviar para C&R'), $('#actions').textContent);

// obrigatoriedade antes de enviar
$('#content [name="DESCRICAO_CARGO"]').value='';
$('#content [name="ATIV_DESC"]').value='';
await globalThis.transition('sendCR');
await new Promise(r=>setTimeout(r,80));
check('bloqueia envio com obrigatorios vazios', $('#toast').textContent.includes('Preencha os campos obrigatórios'), $('#toast').textContent);
check('lista os dois campos faltantes', $('#toast').textContent.includes('Missão') && $('#toast').textContent.includes('responsabilidades'), $('#toast').textContent);

// values() so pega o formulario do detalhe
$('#content [name="ATIV_DESC"]').value='NOVA MISSAO';
$('#content [name="DESCRICAO_CARGO"]').value='NOVAS RESP';
try{ await globalThis.saveValues(); }catch(e){ console.log('  erro em saveValues:', String(e).split('\n')[0].slice(0,200)); }
await new Promise(r=>setTimeout(r,150));
const saved=globalThis.__rpcLog.filter(x=>x[0]==='save_dynamic_values').pop();
check('save_dynamic_values chamado', !!saved);
check('payload chaveado por field_key', saved && Object.keys(saved[1].p_values).every(k=>['ATIV_DESC','DESCRICAO_CARGO'].includes(k)), JSON.stringify(saved&&saved[1].p_values));
check('campos bloqueados fora do payload', saved && !('esc_min' in saved[1].p_values));

console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:'\nfluxo completo OK');
