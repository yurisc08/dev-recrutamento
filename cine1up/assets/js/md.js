/* ============================================================
   CINE 1UP — md.js
   Markdown → HTML sem dependência externa.
   O HTML do autor é escapado ANTES da conversão, então o conteúdo
   publicado nunca injeta script na página.
   Suporta: # títulos, **negrito**, *itálico*, `código`, blocos ```,
   > citação, listas - e 1., --- , [link](url), ![img](url), tabelas
   simples e linhas em branco como parágrafo.
   ============================================================ */

(function () {
  'use strict';

  function escapar(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function urlSegura(u) {
    const limpa = String(u || '').trim();
    return /^(https?:|data:image\/|\/|\.\/|#|mailto:)/i.test(limpa) ? limpa : '#';
  }

  function inline(txt) {
    return txt
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
        (m, alt, src, t) => `<img src="${urlSegura(src)}" alt="${alt}" loading="lazy"${t ? ` title="${t}"` : ''}>`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
        (m, txt2, href) => {
          const h = urlSegura(href);
          const ext = /^https?:/i.test(h);
          return `<a class="link-fx" href="${h}"${ext ? ' target="_blank" rel="noopener"' : ''}>${txt2}</a>`;
        })
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/==([^=]+)==/g, '<mark>$1</mark>');
  }

  function render(md) {
    if (!md) return '';
    const linhas = escapar(String(md)).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let paragrafo = [];

    function fecharP() {
      if (paragrafo.length) {
        out.push('<p>' + inline(paragrafo.join(' ')) + '</p>');
        paragrafo = [];
      }
    }

    while (i < linhas.length) {
      const l = linhas[i];

      // bloco de código
      if (/^```/.test(l)) {
        fecharP();
        const lang = l.slice(3).trim();
        const buf = [];
        i++;
        while (i < linhas.length && !/^```/.test(linhas[i])) { buf.push(linhas[i]); i++; }
        i++;
        out.push(`<pre class="code"${lang ? ` data-lang="${lang}"` : ''}><code>${buf.join('\n')}</code></pre>`);
        continue;
      }

      // título
      const h = l.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        fecharP();
        const n = h[1].length + 1;
        out.push(`<h${n}>${inline(h[2])}</h${n}>`);
        i++; continue;
      }

      // separador
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { fecharP(); out.push('<hr>'); i++; continue; }

      // citação
      if (/^(&gt;|>)\s?/.test(l)) {
        fecharP();
        const buf = [];
        while (i < linhas.length && /^(&gt;|>)\s?/.test(linhas[i])) {
          buf.push(linhas[i].replace(/^(&gt;|>)\s?/, ''));
          i++;
        }
        out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
        continue;
      }

      // lista não ordenada
      if (/^\s*[-*+]\s+/.test(l)) {
        fecharP();
        const itens = [];
        while (i < linhas.length && /^\s*[-*+]\s+/.test(linhas[i])) {
          itens.push(`<li>${inline(linhas[i].replace(/^\s*[-*+]\s+/, ''))}</li>`);
          i++;
        }
        out.push('<ul>' + itens.join('') + '</ul>');
        continue;
      }

      // lista ordenada
      if (/^\s*\d+[.)]\s+/.test(l)) {
        fecharP();
        const itens = [];
        while (i < linhas.length && /^\s*\d+[.)]\s+/.test(linhas[i])) {
          itens.push(`<li>${inline(linhas[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
          i++;
        }
        out.push('<ol>' + itens.join('') + '</ol>');
        continue;
      }

      // tabela | a | b |
      if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(linhas[i + 1] || '')) {
        fecharP();
        const cabec = l.split('|').slice(1, -1).map(c => `<th>${inline(c.trim())}</th>`).join('');
        i += 2;
        const corpo = [];
        while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) {
          corpo.push('<tr>' + linhas[i].split('|').slice(1, -1)
            .map(c => `<td>${inline(c.trim())}</td>`).join('') + '</tr>');
          i++;
        }
        out.push(`<div class="tabela-wrap"><table><thead><tr>${cabec}</tr></thead><tbody>${corpo.join('')}</tbody></table></div>`);
        continue;
      }

      // linha em branco fecha parágrafo
      if (!l.trim()) { fecharP(); i++; continue; }

      paragrafo.push(l.trim());
      i++;
    }

    fecharP();
    return out.join('\n');
  }

  /* Resumo em texto puro, para cards e meta description */
  function resumo(md, limite) {
    const txt = String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*`~_|-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const max = limite || 160;
    return txt.length > max ? txt.slice(0, max).replace(/\s+\S*$/, '') + '…' : txt;
  }

  window.MD = { render, resumo, escapar };
})();
