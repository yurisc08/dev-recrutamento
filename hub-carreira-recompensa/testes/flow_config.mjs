/* As configuracoes do banco precisam mudar o comportamento de verdade:
   dominio de e-mail, o que o Gestor pode abrir e os marcadores do documento. */
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const MODO=process.env.MODO||'banco';   // banco | padrao
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');

const FIELDS=[{id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'CR',field_type:'textarea',required:false,active:true,sort_order:10}];
const TABLES={profiles:[{id:'u1',name:'Admin',email:'a@grupo-x.com',role:'ADMIN',active:true}],
 form_fields:FIELDS,companies:[],branches:[],approval_areas:[],workflow_templates:[],workflow_steps:[]};
// ADMIN ja ajustou tudo pela tela: outro dominio, Gestor so pode atualizacao,
// e uma secao nova SKILL_38 que nao existe no codigo.
const SETTINGS=[{key:'email_domains',value:['grupo-x.com','volare.com.br']},
                {key:'triage_deadline_days',value:7},
                {key:'fixed_markers',value:['EMPRESA','COD_DO_CARGO']},
                {key:'manager_can_open_new',value:false},
                {key:'manager_can_open_update',value:true},
                {key:'require_job_code_on_approve',value:false}];
const CATALOGO=[{key:'ATIV_DESC',label:'Missão',legacy_keys:['mission'],suggestable:true,sort_order:10,active:true},
                {key:'SKILL_38',label:'Certificações obrigatórias',base_label:'CERTIFICACOES',legacy_keys:['certifications'],suggestable:true,sort_order:20,active:true}];
const RPCS={list_visible_requests:[],list_manager_intake_requests:[],
 list_app_settings: MODO==='banco'?SETTINGS:[], list_section_catalog: MODO==='banco'?CATALOGO:[],
 list_available_approvers:[]};
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
console.log(`== modo ${MODO} ==`);

// 1) dominio de e-mail
$('#logout') && null;
$('#email').value='joao@grupo-x.com'; $('#accessCode').value='X';
$('#loginForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
await new Promise(r=>setTimeout(r,150));
if (MODO==='banco') check('aceita o dominio configurado pelo ADMIN', !$('#toast').textContent.includes('corporativo'), $('#toast').textContent);
else check('sem config, mantem o dominio padrao', $('#toast').textContent.includes('@marcopolo.com.br'), $('#toast').textContent);

// 2) tela Base e modelo: painel de configuracoes
$('#navBase').click(); await new Promise(r=>setTimeout(r,120));
const linhas=[...w.document.querySelectorAll('#baseSettings .setting-row')];
check('painel de configuracoes renderizado', linhas.length===6, String(linhas.length));
check('botao reflete se da para salvar',
  $('#baseSaveSettings').textContent.includes(MODO==='banco'?'Salvar':'Exportar'), $('#baseSaveSettings').textContent);
const dominios=$('#baseSettings [data-key="email_domains"]').value;
check('dominios carregados na tela', MODO==='banco' ? dominios.includes('grupo-x.com') : dominios.includes('marcopolo.com.br'), dominios);
check('prazo carregado', $('#baseSettings [data-key="triage_deadline_days"]').value===(MODO==='banco'?'7':'15'), $('#baseSettings [data-key="triage_deadline_days"]').value);

// 3) marcadores do documento seguem o catalogo
$('.nav[data-view=models]').click(); await new Promise(r=>setTimeout(r,150));
const marcadores=[...w.document.querySelectorAll('#modelMappingGrid .mapping-marker')].map(x=>x.textContent.replace(/«|»/g,''));
if (MODO==='banco') {
  check('secao criada pelo ADMIN aparece no documento', marcadores.includes('SKILL_38'), marcadores.join(','));
  check('marcadores fixos seguem a configuracao', marcadores.includes('EMPRESA')&&!marcadores.includes('CBO'), marcadores.join(','));
  check('secao removida do catalogo some', !marcadores.includes('SKILL_33'), marcadores.join(','));
} else {
  check('padrao mantem os 17 marcadores', marcadores.length===17, String(marcadores.length));
}

// 4) o que o Gestor pode abrir
$('.nav[data-view=dashboard]').click(); await new Promise(r=>setTimeout(r,80));
await w.document.querySelector('#newRequest').onclick();
await new Promise(r=>setTimeout(r,150));
const ops=[...$('#requestForm').request_type.options].map(o=>({v:o.value,off:o.disabled}));
check('ADMIN enxerga os dois tipos', ops.every(o=>!o.off), JSON.stringify(ops));

console.log('\nerros capturados:', errs.length?errs:'nenhum');
console.log(bad?`\n${bad} falha(s)`:`\nconfiguracoes (${MODO}) OK`);
