import * as A from './pure.mjs';
import assert from 'node:assert/strict';
let ok=0; const t=(n,f)=>{try{f();ok++;console.log('  ok  '+n)}catch(e){console.log('  FAIL '+n+' -> '+e.message);process.exitCode=1}};

console.log('== numeracao SKILL contra o modelo docx ==');
const esperado={SKILL_30:'Formação/Escolaridade mínima',SKILL_31:'Formação/Escolaridade desejável',SKILL_32:'Idioma mínimo',SKILL_33:'Idioma desejável',SKILL_34:'Competências técnicas mínimas',SKILL_35:'Competências técnicas desejáveis',SKILL_36:'Experiência profissional desejável',ATIV_DESC:'Missão',DESCRICAO_CARGO:'Principais responsabilidades/atividades'};
for(const [k,v] of Object.entries(esperado)) t(k+' -> '+v,()=>assert.equal(A.reviewLabel(k),v));

console.log('== apelidos historicos ==');
t('mission -> ATIV_DESC',()=>assert.equal(A.canonicalReviewKey('mission'),'ATIV_DESC'));
t('formation_min -> SKILL_30',()=>assert.equal(A.canonicalReviewKey('formation_min'),'SKILL_30'));
t('formation_desired -> SKILL_31',()=>assert.equal(A.canonicalReviewKey('formation_desired'),'SKILL_31'));
t('technical_min -> SKILL_34',()=>assert.equal(A.canonicalReviewKey('technical_min'),'SKILL_34'));
t('behavioral -> SKILL_37',()=>assert.equal(A.canonicalReviewKey('behavioral'),'SKILL_37'));

console.log('== fieldSection por rotulo ==');
const casos=[[{field_key:'f1',label:'Escolaridade mínima'},'SKILL_30'],[{field_key:'f2',label:'Formação/Escolaridade desejável'},'SKILL_31'],[{field_key:'f3',label:'Idioma mínimo'},'SKILL_32'],[{field_key:'f4',label:'Idioma desejável'},'SKILL_33'],[{field_key:'f5',label:'Competências técnicas mínimas'},'SKILL_34'],[{field_key:'f6',label:'Competências técnicas desejáveis'},'SKILL_35'],[{field_key:'f7',label:'Experiência profissional desejável'},'SKILL_36'],[{field_key:'ATIV_DESC',label:'Missão'},'ATIV_DESC'],[{field_key:'x',label:'Principais responsabilidades/atividades'},'DESCRICAO_CARGO'],[{field_key:'x',label:'Foco de atuação'},'TEXTO_RESULTADO_ESPERADO'],[{field_key:'zzz',label:'Campo solto'},null]];
for(const [f,exp] of casos) t(`${f.label} -> ${exp}`,()=>assert.equal(A.fieldSection(f),exp));

console.log('== leitura do snapshot da base ==');
const job={ATIV_DESC:'MISSAO X',DESCRICAO_CARGO:'RESP A\nRESP B',SKILL_30:'SUPERIOR EM DIREITO',SKILL_32:'INGLES BASICO',cbo:'317110'};
t('ATIV_DESC',()=>assert.equal(A.sourceValueBySection('ATIV_DESC',job),'MISSAO X'));
t('SKILL_30',()=>assert.equal(A.sourceValueBySection('SKILL_30',job),'SUPERIOR EM DIREITO'));
t('SKILL_32',()=>assert.equal(A.sourceValueBySection('SKILL_32',job),'INGLES BASICO'));
t('SKILL_31 vazio',()=>assert.equal(A.sourceValueBySection('SKILL_31',job),''));
t('requirements por rotulo',()=>assert.equal(A.sourceValueBySection('SKILL_34',{requirements:{'COMPETÊNCIAS TÉCNICAS MÍNIMAS':'PACOTE OFFICE'}}),'PACOTE OFFICE'));
t('campo CBO por rotulo',()=>assert.equal(A.sourceValueForField({field_key:'k',label:'CBO'},job),'317110'));

console.log('== catalogo sugerivel x referencia ==');
t('sugerivel = 2 secoes',()=>assert.deepEqual(A.UPDATE_CATALOG.map(x=>x[0]),['ATIV_DESC','DESCRICAO_CARGO']));
t('referencia inclui SKILL_37',()=>assert.ok(A.REFERENCE_SECTIONS.includes('SKILL_37')));

console.log('== substituicao de marcadores no DOCX ==');
t('marcador simples',()=>{const x=A.replaceDocxMarkers('<w:t>«NOME»</w:t>',{NOME:'ANALISTA'});assert.ok(x.includes('ANALISTA'));assert.ok(!x.includes('«'))});
t('marcador quebrado em runs',()=>{const x=A.replaceDocxMarkers('<w:t>«NO</w:t><w:t>ME»</w:t>',{NOME:'ANALISTA'});assert.ok(x.includes('ANALISTA'),x)});
t('duas ocorrencias do mesmo marcador',()=>{const x=A.replaceDocxMarkers('<w:t>«N» meio «N»</w:t>',{N:'AB'});assert.equal((x.match(/AB/g)||[]).length,2,x);assert.ok(!x.includes('«'),x)});
t('quebra de linha vira <w:br/>',()=>{const x=A.replaceDocxMarkers('<w:t>«D»</w:t>',{D:'L1\nL2'});assert.ok(x.includes('<w:br/>'),x);assert.ok(x.includes('L1')&&x.includes('L2'))});
t('escapa & < >',()=>{const x=A.replaceDocxMarkers('<w:t>«E»</w:t>',{E:'P&D <x>'});assert.ok(x.includes('P&amp;D &lt;x&gt;'),x)});
t('texto ao redor preservado',()=>{const x=A.replaceDocxMarkers('<w:t>Cargo: «N» (ativo)</w:t>',{N:'AB'});assert.ok(x.includes('Cargo: AB (ativo)'),x)});
t('sem marcador nao altera',()=>{const src='<w:t>nada aqui</w:t>';assert.equal(A.replaceDocxMarkers(src,{N:'AB'}),src)});

console.log(`\n${ok} verificacoes passaram`);
