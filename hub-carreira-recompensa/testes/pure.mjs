const normText=(value)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
/* ------------------------------------------------------------------------
   CATALOGO OFICIAL DAS SECOES DO DESCRITIVO
   Fonte da verdade: planilha CARGOS_PARA_GERAR_MAPAS_HIERARQUIA (colunas
   SKILL_nn / SKILL_nn_DESC) e o modelo protegido modelo-cargo-individual.docx.
   A numeracao abaixo e a unica correta. Nao alterar sem conferir o modelo.
     SKILL_30 = FORMACAO/ESCOLARIDADE MINIMA
     SKILL_31 = FORMACAO/ESCOLARIDADE DESEJAVEL
     SKILL_32 = IDIOMA MINIMO
     SKILL_33 = IDIOMA DESEJAVEL
     SKILL_34 = COMPETENCIAS TECNICAS MINIMAS
     SKILL_35 = COMPETENCIAS TECNICAS DESEJAVEIS
     SKILL_36 = EXPERIENCIA PROFISSIONAL DESEJAVEL
     SKILL_37 = COMPETENCIAS COMPORTAMENTAIS MARCOPOLO DESEJAVEIS
   ------------------------------------------------------------------------ */
const DEFAULT_SECTION_CATALOG=[
 {key:'TEXTO_RESULTADO_ESPERADO',label:'Foco de atuação',legacy:['expected_result','foco_atuacao','resultado_esperado'],baseLabel:null},
 {key:'ATIV_DESC',label:'Missão',legacy:['mission','activities','ativ_desc'],baseLabel:null,suggestable:true},
 {key:'DESCRICAO_CARGO',label:'Principais responsabilidades/atividades',legacy:['responsibilities','job_description','description','descricao_cargo'],baseLabel:null,suggestable:true},
 {key:'SKILL_30',label:'Formação/Escolaridade mínima',legacy:['formation_min'],baseLabel:'ESCOLARIDADE MÍNIMA'},
 {key:'SKILL_31',label:'Formação/Escolaridade desejável',legacy:['formation_desired'],baseLabel:'ESCOLARIDADE DESEJÁVEL'},
 {key:'SKILL_32',label:'Idioma mínimo',legacy:['language_min'],baseLabel:'IDIOMA MÍNIMO'},
 {key:'SKILL_33',label:'Idioma desejável',legacy:['language_desired'],baseLabel:'IDIOMA DESEJÁVEL'},
 {key:'SKILL_34',label:'Competências técnicas mínimas',legacy:['technical_min'],baseLabel:'COMPETÊNCIAS TÉCNICAS MÍNIMAS'},
 {key:'SKILL_35',label:'Competências técnicas desejáveis',legacy:['technical_desired'],baseLabel:'COMPETÊNCIAS TÉCNICAS DESEJÁVEIS'},
 {key:'SKILL_36',label:'Experiência profissional desejável',legacy:['experience_min','experience_desired'],baseLabel:'EXPERIÊNCIA PROFISSIONAL DESEJÁVEL'},
 {key:'SKILL_37',label:'Competências comportamentais Marcopolo desejáveis',legacy:['behavioral'],baseLabel:'COMPETÊNCIAS MARCOPOLO DESEJÁVEIS'}
];
/* O catalogo vive no banco quando a tabela section_catalog existe; caso
   contrario cai no padrao acima. Tudo o que deriva dele e recalculado em
   rebuildSectionCatalog, entao a troca em tempo de execucao e segura. */
let SECTION_CATALOG=[],SECTION_BY_KEY={},SECTION_ALIASES={},SUGGESTABLE_SECTIONS=[],REFERENCE_SECTIONS=[],UPDATE_CATALOG=[];
/* Tudo o que antes era constante no codigo e o ADMIN pode precisar mudar.
   Os valores abaixo sao so o padrao de fabrica: a tabela app_settings, quando
   existe, sobrepoe cada chave. */
const DEFAULT_SETTINGS={
 email_domains:["marcopolo.com.br"],
 triage_deadline_days:15,
 fixed_markers:["EMPRESA","COD_DO_CARGO","NOME_COMPLETO","CBO","TCLC_DESC","DT_ATIVACAO"],
 manager_can_open_new:true,
 manager_can_open_update:true,
 require_job_code_on_approve:true,
};
let SETTINGS={...DEFAULT_SETTINGS};
let settingsSource="padrao";
function setting(k){const v=SETTINGS[k];return v===undefined||v===null?DEFAULT_SETTINGS[k]:v;}
async function loadSettings(){
 try{
  const {data,error}=await sb.rpc("list_app_settings");
  // lista vazia = a RPC nao existe ou a tabela nao foi populada: seguimos no padrao
  if(error||!Array.isArray(data)||!data.length){SETTINGS={...DEFAULT_SETTINGS};settingsSource="padrao";return;}
  const out={...DEFAULT_SETTINGS};
  for(const row of data){
   if(!row||!row.key||!(row.key in DEFAULT_SETTINGS))continue;
   let v=row.value;
   if(typeof v==="string"){try{v=JSON.parse(v)}catch{}}
   if(v!==null&&v!==undefined)out[row.key]=v;
  }
  SETTINGS=out;settingsSource="banco";
 }catch(err){SETTINGS={...DEFAULT_SETTINGS};settingsSource="padrao";}
}
let sectionCatalogSource="padrao";
function normalizeSection(row,i){
 return {
  key:String(row.key||row.section_key||'').trim().toUpperCase(),
  label:String(row.label||'').trim(),
  legacy:Array.isArray(row.legacy)?row.legacy:(Array.isArray(row.legacy_keys)?row.legacy_keys:[]),
  baseLabel:row.baseLabel??row.base_label??null,
  suggestable:row.suggestable===true,
  sort_order:Number.isFinite(row.sort_order)?row.sort_order:i*10,
  active:row.active!==false,
 };
}
function rebuildSectionCatalog(rows){
 const base=(rows&&rows.length?rows:DEFAULT_SECTION_CATALOG.map((x,i)=>({...x,suggestable:['ATIV_DESC','DESCRICAO_CARGO'].includes(x.key),sort_order:i*10})));
 SECTION_CATALOG=base.map(normalizeSection).filter(x=>x.key&&x.active).sort((a,b)=>a.sort_order-b.sort_order);
 SECTION_BY_KEY=Object.fromEntries(SECTION_CATALOG.map(x=>[x.key,x]));
 SECTION_ALIASES={};
 for(const x of SECTION_CATALOG){for(const alias of [x.key,...x.legacy]){const a=String(alias||'').trim();if(!a)continue;SECTION_ALIASES[a]=x.key;SECTION_ALIASES[a.toUpperCase()]=x.key;SECTION_ALIASES[a.toLowerCase()]=x.key;}}
 SUGGESTABLE_SECTIONS=SECTION_CATALOG.filter(x=>x.suggestable).map(x=>x.key);
 REFERENCE_SECTIONS=SECTION_CATALOG.filter(x=>!x.suggestable).map(x=>x.key);
 UPDATE_CATALOG=SUGGESTABLE_SECTIONS.map(k=>[k,SECTION_BY_KEY[k].label]);
}
rebuildSectionCatalog(null);
/* Tolerante de proposito: sem a tabela no Supabase o app segue com o padrao
   embutido e a tela Base e modelo entra em modo somente diagnostico. */
async function loadSectionCatalog(){
 try{
  const {data,error}=await sb.rpc("list_section_catalog");
  if(error||!Array.isArray(data)||!data.length){rebuildSectionCatalog(null);sectionCatalogSource="padrao";return;}
  rebuildSectionCatalog(data);sectionCatalogSource="banco";
 }catch(err){rebuildSectionCatalog(null);sectionCatalogSource="padrao";}
}
/* Regra oficial do pacote (LEIA-ME): por padrao o Gestor sugere apenas Missao
   e Principais responsabilidades; o ADMIN altera isso na tela Base e modelo. */
function canonicalReviewKey(k){const raw=String(k??'').trim();return SECTION_ALIASES[raw]||SECTION_ALIASES[raw.toUpperCase()]||raw;}
function reviewLabel(k){return SECTION_BY_KEY[canonicalReviewKey(k)]?.label||k;}
function sectionLabel(k){const s=SECTION_BY_KEY[canonicalReviewKey(k)];return s?`${s.label} — ${s.key}`:k;}

/* Reconhece a qual secao oficial um campo do formulario pertence.
   Primeiro pelo field_key (inclusive apelidos antigos), depois pelo rotulo. */
const SECTION_PATTERNS=[
 [/foco de atuacao|resultado esperado/,'TEXTO_RESULTADO_ESPERADO'],
 [/missao/,'ATIV_DESC'],
 [/atividad|responsabil|descricao do cargo/,'DESCRICAO_CARGO'],
 [/(escolaridade|formacao)[\s\S]*minim/,'SKILL_30'],
 [/(escolaridade|formacao)[\s\S]*desejav/,'SKILL_31'],
 [/idioma[\s\S]*minim/,'SKILL_32'],
 [/idioma[\s\S]*desejav/,'SKILL_33'],
 [/tecnic[\s\S]*minim/,'SKILL_34'],
 [/tecnic[\s\S]*desejav/,'SKILL_35'],
 [/experiencia/,'SKILL_36'],
 [/comportamental|marcopolo/,'SKILL_37']
];
function fieldSection(f){
 const raw=String(f?.field_key||'').trim();
 const direct=SECTION_ALIASES[raw]||SECTION_ALIASES[raw.toUpperCase()];
 if(direct)return direct;
 const t=normText(`${raw} ${f?.label||''}`);
 for(const [re,key] of SECTION_PATTERNS){if(re.test(t))return key;}
 return null;
}

function requirementObject(snap={}){const r=snap.requirements; if(!r)return{};if(typeof r==='string'){try{return JSON.parse(r)}catch{return{}}}return r;}
function reqValue(req,label){const target=normText(label);for(const [k,v] of Object.entries(req)){if(normText(k)===target)return String(v??'');}return'';}
const IDENTITY_PATTERNS=[
 [/(^| )cbo($| )/,'cbo'],
 [/trilha de carreira/,'career_track'],
 [/nivel do cargo/,'level'],
 [/natureza do cargo/,'nature'],
 [/codigo do cargo/,'job_code'],
 [/nome do cargo/,'job_name']
];
function sourceValueForField(f,snap={}){
 const sec=fieldSection(f);
 if(sec){const v=sourceValueBySection(sec,snap);if(v)return v;}
 const t=normText(`${f?.field_key||''} ${f?.label||''}`);
 for(const [re,prop] of IDENTITY_PATTERNS){if(re.test(t))return cleanCatalogValue(snap?.[prop]??'');}
 return '';
}
/* save_dynamic_values espera SEMPRE field_key. Esta funcao normaliza mapas
   antigos que vinham chaveados por id do campo ou por secao oficial. */
function toFieldKeyMap(source){
 const out={};
 for(const [k,v] of Object.entries(source||{})){
  if(v==null||!String(v).trim())continue;
  const f=S.fields.find(x=>x.id===k||x.field_key===k)
        ||S.fields.find(x=>x.active&&fieldReviewKey(x)===canonicalReviewKey(k));
  if(f)out[f.field_key]=v;
 }
 return out;
}

function cleanCatalogValue(value){return String(value??'').replace(/<br\s*\/?>(\r?\n)?/gi,'\n').replace(/&nbsp;/gi,' ').trim();}
function catalogValue(job,key){
 const sources=[job,job?.raw_data,job?.data,job?.source_snapshot,job?.payload].filter(Boolean);
 const names=[key,key.toLowerCase(),key.toUpperCase()];
 for(const source of sources){for(const name of names){if(source[name]!=null&&cleanCatalogValue(source[name]))return cleanCatalogValue(source[name]);}}
 return '';
}
/* Texto atual da base para uma secao oficial. Tenta a coluna canonica,
   depois os apelidos historicos e por fim o bloco "requirements" por rotulo. */
function sourceValueBySection(key,job={}){
 const canonical=canonicalReviewKey(key),spec=SECTION_BY_KEY[canonical];
 if(!spec||!job)return '';
 for(const name of [canonical,...spec.legacy]){const v=catalogValue(job,name);if(v)return v;}
 if(spec.baseLabel){const v=reqValue(requirementObject(job),spec.baseLabel);if(v)return cleanCatalogValue(v);}
 return '';
}

/* Substitui todas as ocorrencias de cada marcador, inclusive quando o Word
   quebrou o marcador em varios runs. A versao anterior parava na primeira
   ocorrencia e perdia as quebras de linha do texto. */
function preserveSpace(open) {
  return open.includes("xml:space") ? open : open.replace(/^<w:t/, '<w:t xml:space="preserve"');
}
function escXml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function docxText(value, openTag) {
  return escXml(value).split(/\r?\n/).join(`</w:t><w:br/>${openTag}`);
}
function replaceDocxMarkers(xml, map) {
  for (const [k, v] of Object.entries(map)) {
    const target = "\u00ab" + k + "\u00bb";
    let guard = 0;
    while (guard++ < 200) {
      const runs = [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)];
      let plain = "";
      const ranges = runs.map((m) => {
        const r = { start: plain.length, end: plain.length + m[1].length, open: m[0].slice(0, m[0].indexOf(">") + 1) };
        plain += m[1];
        return r;
      });
      const idx = plain.indexOf(target);
      if (idx < 0) break;
      const last = idx + target.length - 1;
      const a = ranges.findIndex((x) => idx >= x.start && idx < x.end);
      const b = ranges.findIndex((x) => last >= x.start && last < x.end);
      if (a < 0 || b < 0) break;
      const open = preserveSpace(ranges[a].open);
      const before = plain.slice(ranges[a].start, idx);
      const after = plain.slice(idx + target.length, ranges[b].end);
      const start = runs[a].index,
        end = runs[b].index + runs[b][0].length;
      xml =
        xml.slice(0, start) + open + before + docxText(v, open) + after + "</w:t>" + xml.slice(end);
    }
  }
  return xml;
}

export {SECTION_CATALOG,SECTION_BY_KEY,canonicalReviewKey,reviewLabel,sectionLabel,fieldSection,sourceValueBySection,sourceValueForField,replaceDocxMarkers,UPDATE_CATALOG,REFERENCE_SECTIONS};
