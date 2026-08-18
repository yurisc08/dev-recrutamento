# Regera testes/pure.mjs a partir do index.html.
# Uso: python3 testes/gerar-pure.py   (a partir da pasta do pacote)
import io, os
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = io.open(os.path.join(raiz, 'index.html'), encoding='utf-8').read()
def bloco(ini, fim):
    i = s.index(ini); return s[i:s.index(fim, i)]
partes = [
    "const normText=" + s.split("const normText=", 1)[1].split("\n", 1)[0],
    bloco("/* ------------------------------------------------------------------------\n   CATALOGO", "function requestReviewPreview"),
    bloco("/* Reconhece a qual secao", "function requirementObject"),
    bloco("function requirementObject", "function buildInitialOfficialValues"),
    bloco("function cleanCatalogValue", "function referenceSectionsHtml"),
    bloco("/* Substitui todas as ocorrencias", "window.downloadApproved"),
]
saida = "\n".join(partes) + ("\nexport {SECTION_CATALOG,SECTION_BY_KEY,canonicalReviewKey,reviewLabel,"
    "sectionLabel,fieldSection,sourceValueBySection,sourceValueForField,replaceDocxMarkers,"
    "UPDATE_CATALOG,REFERENCE_SECTIONS};\n")
io.open(os.path.join(raiz, 'testes', 'pure.mjs'), 'w', encoding='utf-8').write(saida)
print('testes/pure.mjs regerado')
