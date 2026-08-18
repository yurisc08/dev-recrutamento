import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const dir=RAIZ;
const html=fs.readFileSync(dir+'/index.html','utf8');
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'));
// substitui os imports externos por stubs locais
js=js.replace(/import \{ createClient \}[^\n]*\n/,'')
     .replace(/import JSZip[^\n]*\n/,'')
     .replace(/import \{ SUPABASE_URL[^\n]*\n/,'');
const stub=`
const JSZip={loadAsync:async()=>({files:{},file:()=>({async:async()=>''}),generateAsync:async()=>new Blob()})};
const rpcCalls=[];
const q=()=>{const b={select:()=>b,eq:()=>b,in:()=>b,order:()=>b,maybeSingle:async()=>({data:null}),insert:async()=>({}),update:()=>b,delete:()=>b,then:(r)=>r({data:[],error:null})};return b;};
const createClient=()=>({
  auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:async()=>({error:null}),signOut:async()=>{},onAuthStateChange:(cb)=>{globalThis.__authcb=cb;}},
  from:()=>q(),
  rpc:(name,args)=>{rpcCalls.push([name,args]);const pr=Promise.resolve({data:[],error:null});pr.catch=(f)=>Promise.resolve({data:[],error:null});return pr;},
  functions:{invoke:async()=>({data:{},error:null})}
});
const SUPABASE_URL='x',SUPABASE_ANON_KEY='y',APP_URL='z';
globalThis.__rpcCalls=rpcCalls;
`;
const dom=new JSDOM(html.replace(/<script type="module">[\s\S]*<\/script>/,'<div id="__end"></div>'),{url:'https://exemplo.test/'});
const w=dom.window;
for (const [k,v] of Object.entries({window:w,document:w.document,location:w.location,sessionStorage:w.sessionStorage,CSS:w.CSS,Blob:w.Blob,URL:w.URL,requestAnimationFrame:(f)=>f(),HTMLElement:w.HTMLElement,FormData:w.FormData,matchMedia:()=>({matches:false})})) {
  try { Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true}); } catch(e) { console.log('skip global',k); }
}
w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
w.scrollTo=()=>{};

// jsdom nao implementa o named getter form[name] que os navegadores tem.
function shimForms(doc){
  doc.querySelectorAll('form').forEach(f=>{
    for(const el of [...f.elements]){
      const n=el.getAttribute && el.getAttribute('name');
      if(!n || n in f) continue;
      Object.defineProperty(f,n,{get:()=>f.elements[n],configurable:true});
    }
  });
}
shimForms(w.document);
const errs=[];
w.addEventListener('error',e=>errs.push(e.message));
const mod='data:text/javascript;base64,'+Buffer.from(stub+js,'utf8').toString('base64');
try{
  const m=await import(mod);
  await new Promise(r=>setTimeout(r,120));
  console.log('modulo carregou sem excecao no topo');
}catch(e){ console.log('ERRO ao avaliar o modulo:', e.message); process.exitCode=1; }

const $=(s)=>w.document.querySelector(s);
const check=(n,c)=>console.log((c?'  ok  ':'  FAIL ')+n)||(c?0:process.exitCode=1);
check('select de status populado ('+$('#status').options.length+' opcoes)', $('#status').options.length===7);
check('#search tem listener', typeof $('#search').oninput==='function');
check('#status tem listener', typeof $('#status').onchange==='function');
check('#auditSearch tem listener', typeof $('#auditSearch').oninput==='function');
check('#refreshAudit tem listener', typeof $('#refreshAudit').onclick==='function');
check('use_additional_approval tem listener', typeof $('#requestForm').use_additional_approval.onchange==='function');
check('additional_approver_id tem listener', typeof $('#requestForm').additional_approver_id.onchange==='function');
check('login visivel sem sessao', !$('#login').classList.contains('hidden'));
check('app oculto sem sessao', $('#app').classList.contains('hidden'));
// alterna a validacao adicional
$('#requestForm').use_additional_approval.value='YES';
$('#requestForm').use_additional_approval.dispatchEvent(new w.Event('change'));
check('bloco do aprovador aparece ao escolher YES', !$('#requestApprovalFields').classList.contains('hidden'));
$('#requestForm').use_additional_approval.value='NO';
$('#requestForm').use_additional_approval.dispatchEvent(new w.Event('change'));
check('bloco do aprovador some ao escolher NO', $('#requestApprovalFields').classList.contains('hidden'));
console.log('erros de janela:',errs.length?errs:'nenhum');
