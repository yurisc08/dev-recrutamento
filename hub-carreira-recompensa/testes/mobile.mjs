/* Renderiza o app de verdade no Chromium em viewport de celular e mede
   problemas de layout: rolagem horizontal, elementos fora da tela e
   alvos de toque pequenos demais. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium, devices} from 'playwright';
const RAIZ=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const OUT='/tmp/mobile-shots';
fs.mkdirSync(OUT,{recursive:true});

/* Build com Supabase stubado, para a tela abrir logada sem rede. */
const html=fs.readFileSync(RAIZ+'/index.html','utf8');
const FIELDS=[
 {id:'f1',field_key:'ATIV_DESC',label:'Missão',owner_role:'CR',field_type:'textarea',required:true,active:true,sort_order:10,help_text:'Explique a missão'},
 {id:'f2',field_key:'DESCRICAO_CARGO',label:'Principais responsabilidades/atividades',owner_role:'CR',field_type:'textarea',required:true,active:true,sort_order:20},
 {id:'f3',field_key:'esc_min',label:'Formação/Escolaridade mínima',owner_role:'CR',field_type:'text',required:false,active:true,sort_order:30},
 {id:'f4',field_key:'idi_min',label:'Idioma mínimo',owner_role:'GESTOR',field_type:'text',required:false,active:true,sort_order:40},
 {id:'f5',field_key:'tec_min',label:'Competências técnicas mínimas',owner_role:'GESTOR',field_type:'textarea',required:true,active:true,sort_order:50}];
const REQ={id:'r1',request_number:'SOL-0001',title:'PROGRAMADOR DE SISTEMAS PLENO',job_code:'120',
 status:'Rascunho C&R',company:'MARCOPOLO S A',branch:'ANA RECH',deadline:'2026-09-30',
 updated_at:'2026-08-18T10:00:00Z',progress:35,manager:{name:'Gestor Um'},request_kind:'UPDATE',
 intake_request_id:'i1',intake_requester_name:'Gestor Um',intake_justification:'Reestruturação da área.',
 intake_selected_sections:['ATIV_DESC','DESCRICAO_CARGO'],
 intake_suggested_values:{ATIV_DESC:'NOVA MISSÃO PROPOSTA PELO GESTOR PARA O CARGO'},
 source_snapshot:{ATIV_DESC:'MISSÃO ANTIGA',DESCRICAO_CARGO:'RESP A\nRESP B',SKILL_30:'ENSINO SUPERIOR'},
 request_field_values:[],history:[{created_at:'2026-08-18T09:00:00Z',action:'Criado',author_name:'C&R'}]};
const TABLES={profiles:[{id:'u1',name:'Administrador Marcopolo',email:'admin@marcopolo.com.br',role:'ADMIN',active:true,company:'MARCOPOLO S A',branch:'ANA RECH'},
  {id:'u2',name:'Gestor Um',email:'g1@marcopolo.com.br',role:'GESTOR',active:true}],
 form_fields:FIELDS,companies:[{id:'c1',name:'MARCOPOLO S A',active:true}],branches:[{id:'b1',company_id:'c1',name:'ANA RECH',active:true}],
 approval_areas:[],workflow_templates:[],workflow_steps:[]};
const RPCS={list_visible_requests:[REQ,{...REQ,id:'r2',request_number:'SOL-0002',title:'ANALISTA DE PLANEJAMENTO E CONTROLE DA PRODUÇÃO',status:'Concluído'}],
 list_manager_intake_requests:[{id:'i1',title:'ASSISTENTE ADMINISTRATIVO',request_type:'UPDATE',company:'MARCOPOLO S A',branch:'ANA RECH',sector:'RH',requester_name:'Gestor Um',status:'PENDENTE'}],
 get_visible_request:REQ,list_section_catalog:[],get_request_additional_approval:null,
 list_available_approvers:[],get_request_intake_metadata:{},list_audit_logs:[],list_access_logs:[]};
const stub=`<script>
window.__STUB__={TABLES:${JSON.stringify(TABLES)},RPCS:${JSON.stringify(RPCS)}};
</script>`;
let js=html.slice(html.indexOf('<script type="module">')+22, html.lastIndexOf('</script>'))
  .replace(/import \{ createClient \}[^\n]*\n/,'').replace(/import JSZip[^\n]*\n/,'').replace(/import \{ SUPABASE_URL[^\n]*\n/,'');
const shim=`
const JSZip={loadAsync:async()=>({files:{},file:()=>null})};
const {TABLES,RPCS}=window.__STUB__;
function qb(t){const res={data:TABLES[t]||[],error:null};
 const b={select:()=>b,eq:()=>b,in:()=>b,order:()=>b,limit:()=>b,
  maybeSingle:async()=>({data:(TABLES[t]||[])[0]||null,error:null}),
  insert:async()=>({error:null}),update:()=>b,delete:()=>b,
  then:(ok)=>Promise.resolve(res).then(ok),catch:()=>Promise.resolve(res)};return b;}
const createClient=()=>({
 auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),signOut:async()=>{},onAuthStateChange:()=>{}},
 from:qb, rpc:(n,a)=>{const pr=Promise.resolve({data:(n in RPCS)?RPCS[n]:[],error:null});pr.catch=()=>pr;return pr;},
 functions:{invoke:async()=>({data:{},error:null})}});
const SUPABASE_URL='x',SUPABASE_ANON_KEY='y',APP_URL='z';
`;
const build=html.replace(/<script type="module">[\s\S]*<\/script>/, () => stub+'<script type="module">'+shim+js+'</script>');
fs.writeFileSync(RAIZ+'/.mobile-build.html', build);

const server=http.createServer((req,res)=>{
  let f=decodeURIComponent(req.url.split('?')[0]);
  if(f==='/')f='/.mobile-build.html';
  const full=path.join(RAIZ,f);
  if(!fs.existsSync(full)){res.writeHead(404);return res.end('no');}
  const ext=path.extname(full);
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'}[ext]||'application/octet-stream'});
  res.end(fs.readFileSync(full));
});
await new Promise(r=>server.listen(0,r));
const url='http://127.0.0.1:'+server.address().port+'/';

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let bad=0; const check=(n,c,extra)=>{console.log((c?'  ok  ':'  FAIL ')+n+(c?'':' :: '+extra));if(!c){bad++;process.exitCode=1}};

for (const [nome,perfil] of [['iphone-se',{viewport:{width:375,height:667},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
                             ['pixel',{viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]) {
  const ctx=await browser.newContext({...perfil,userAgent:devices['iPhone 12'].userAgent});
  const page=await ctx.newPage();
  const consoleErrs=[];
  page.on('pageerror',e=>consoleErrs.push(String(e).slice(0,120)));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForTimeout(700);
  console.log(`\n===== ${nome} (${perfil.viewport.width}px) =====`);
  const subiu=await page.evaluate(()=>({app:!document.querySelector('#app').classList.contains('hidden'),
                                        login:!document.querySelector('#login').classList.contains('hidden'),
                                        cards:document.querySelectorAll('.open-request-btn').length}));
  check('app carregou (login escondido)', subiu.app && !subiu.login, JSON.stringify(subiu)+' err='+consoleErrs.join('|'));
  check('cards da lista renderizados', subiu.cards>0, JSON.stringify(subiu));

  const telas=[['painel',null],['detalhe','.open-request-btn'],['campos','[data-view=fields]'],['base','[data-view=base]'],['usuarios','[data-view=managers]']];
  for (const [tela,sel] of telas) {
    if (sel) {
      const el=await page.$(sel);
      if(!el){check(`${tela}: elemento ${sel} existe`,false,'ausente');continue;}
      try{ await el.click({timeout:5000}); }catch(e){ check(`${tela}: ${sel} clicavel`,false,String(e).split('\n')[0]); continue; }
      await page.waitForTimeout(500);
    }
    const m=await page.evaluate(()=>{
      const de=document.documentElement;
      // Um elemento so "estoura" se nao estiver dentro de um container que rola
      // na horizontal: nesse caso ele e alcancavel deslizando.
      const dentroDeScroller=(el)=>{
        for(let p=el.parentElement;p;p=p.parentElement){
          const ov=getComputedStyle(p).overflowX;
          if(ov==='auto'||ov==='scroll')return true;
          if(p===document.body)break;
        }
        return false;
      };
      const fora=[...document.querySelectorAll('main *, .topbar *')].filter(el=>{
        const r=el.getBoundingClientRect();
        return r.width>0 && r.right>window.innerWidth+1 && !dentroDeScroller(el);
      }).slice(0,6).map(el=>`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}${typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/)[0]:''} (right=${Math.round(el.getBoundingClientRect().right)})`);
      const alvos=[...document.querySelectorAll('main button:not(.hidden), main input, main select, main textarea, .topbar button')].filter(el=>{
        const r=el.getBoundingClientRect();
        if(!(r.width>0 && r.height>0) || r.height>=40) return false;
        if(el.classList.contains('help-tip')) return false;              // area efetiva de 44px via ::before
        // checkbox pequeno dentro de um label alto o suficiente e aceitavel
        if(el.type==='checkbox'){
          const lab=el.closest('label');
          if(lab && lab.getBoundingClientRect().height>=40) return false;
        }
        return true;
      }).slice(0,6).map(el=>`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}${typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/)[0]:''} h=${Math.round(el.getBoundingClientRect().height)}`);
      return {scrollW:de.scrollWidth, innerW:window.innerWidth, fora, alvos};
    });
    check(`${tela}: sem rolagem horizontal`, m.scrollW<=m.innerW+1, `scrollWidth=${m.scrollW} vs ${m.innerW}`);
    check(`${tela}: nada estourando a largura`, m.fora.length===0, m.fora.join(' | '));
    check(`${tela}: alvos de toque >= 40px`, m.alvos.length===0, m.alvos.join(' | '));
    await page.screenshot({path:`${OUT}/${nome}-${tela}.png`,fullPage:true});
    if (sel) { await page.click('[data-view=dashboard]').catch(()=>{}); await page.waitForTimeout(250); }
  }
  // ---- o menu precisa rolar e TODO botao precisa ser alcancavel
  const navInfo=await page.evaluate(()=>{
    const nav=document.querySelector('.topbar nav');
    const ov=getComputedStyle(nav).overflowX;
    const botoes=[...nav.querySelectorAll('.nav')].filter(b=>!b.classList.contains('hidden'));
    nav.scrollLeft=nav.scrollWidth;
    const ultimo=botoes[botoes.length-1].getBoundingClientRect();
    const alcancavel=ultimo.right<=window.innerWidth+1 && ultimo.left>=-1;
    nav.scrollLeft=0;
    return {ov,rola:nav.scrollWidth>nav.clientWidth,total:botoes.length,alcancavel,ultimo:botoes[botoes.length-1].textContent};
  });
  check('menu rola na horizontal', navInfo.ov==='auto'||navInfo.ov==='scroll', 'overflow-x='+navInfo.ov);
  check(`ultimo item do menu (${navInfo.ultimo}) alcancavel`, navInfo.alcancavel, JSON.stringify(navInfo));

  // ---- dialog de nova solicitacao
  await page.click('[data-view=dashboard]').catch(()=>{});
  await page.waitForTimeout(200);
  await page.click('#newRequest');
  await page.waitForTimeout(600);
  const dlg=await page.evaluate(()=>{
    const d=document.querySelector('#requestDialog'); if(!d||!d.open)return {aberto:false};
    const r=d.getBoundingClientRect(), form=d.querySelector('.modal-form');
    const btn=[...d.querySelectorAll('.modal-actions .btn')].map(b=>{const x=b.getBoundingClientRect();return {t:b.textContent.trim(),h:Math.round(x.height),dentro:x.right<=window.innerWidth+1&&x.left>=-1};});
    return {aberto:true, cabe:r.width<=window.innerWidth+1,
            rolavel:form.scrollHeight>form.clientHeight?getComputedStyle(form).overflowY:'nao-precisa',
            alturaVisivel:Math.round(Math.min(r.bottom,window.innerHeight)-Math.max(r.top,0)),
            viewport:window.innerHeight, btn,
            fechar:!!d.querySelector('.icon-btn.close')};
  });
  check('dialog abre no celular', dlg.aberto, JSON.stringify(dlg));
  if(dlg.aberto){
    check('dialog cabe na largura', dlg.cabe, JSON.stringify(dlg));
    check('conteudo do dialog rola', ['auto','scroll','nao-precisa'].includes(dlg.rolavel), 'overflow-y='+dlg.rolavel);
    check('botoes do dialog dentro da tela', dlg.btn.every(b=>b.dentro), JSON.stringify(dlg.btn));
    check('botoes do dialog com altura de toque', dlg.btn.every(b=>b.h>=40), JSON.stringify(dlg.btn));
    await page.screenshot({path:`${OUT}/${nome}-dialog.png`,fullPage:false});
    // consegue digitar?
    await page.fill('#requestForm [name=title]','TESTE MOBILE').catch(()=>{});
    const digitou=await page.evaluate(()=>document.querySelector('#requestForm [name=title]').value);
    check('da para digitar no dialog', digitou==='TESTE MOBILE', digitou);
    await page.click('#requestDialog .icon-btn.close').catch(()=>{});
    await page.waitForTimeout(300);
    check('dialog fecha', await page.evaluate(()=>!document.querySelector('#requestDialog').open));
  }

  // ---- explicativo "?" precisa funcionar em toque
  await page.click('.open-request-btn').catch(()=>{});
  await page.waitForTimeout(600);
  const temTip=await page.$('.help-tip');
  if(temTip) await temTip.click().catch(()=>{});
  await page.waitForTimeout(400);   // transicao do balao
  const tip=await page.evaluate(()=>{
    const t=document.querySelector('.help-tip'); if(!t)return {existe:false};
    const r=t.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    // area de toque efetiva: ate onde o dedo ainda acerta o icone
    let alcance=r.width/2;
    for(const d of [10,14,18,22,26]){
      const el=document.elementFromPoint(cx+d,cy);
      if(el&&el.closest('.help-tip')===t) alcance=d; else break;
    }
    const pop=t.querySelector('.help-popover'), cs=getComputedStyle(pop), pr=pop.getBoundingClientRect();
    return {existe:true,alvo:Math.round(alcance*2),
            visivel:cs.visibility==='visible'&&Number(cs.opacity)>0,
            rect:{l:Math.round(pr.left),r:Math.round(pr.right),t:Math.round(pr.top),b:Math.round(pr.bottom)},
            vw:window.innerWidth,vh:window.innerHeight,pos:cs.position,
            dentro:pr.left>=-1&&pr.right<=window.innerWidth+1&&pr.top>=-1};
  });
  if(tip.existe){
    check('explicativo "?" tem alvo de toque >= 40px', tip.alvo>=40, 'alvo='+tip.alvo+'px');
    check('explicativo abre no toque', tip.visivel, JSON.stringify(tip));
    check('balao do explicativo dentro da tela', tip.dentro, JSON.stringify(tip));
  }

  check('sem erro de JS na página', consoleErrs.length===0, consoleErrs.join(' | '));
  await ctx.close();
}
await browser.close(); server.close();
fs.unlinkSync(RAIZ+'/.mobile-build.html');
console.log(bad?`\n${bad} problema(s) — capturas em ${OUT}`:`\nmobile OK — capturas em ${OUT}`);
