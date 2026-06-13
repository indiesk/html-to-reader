(() => {
  'use strict';

  const KEEP_TAGS = new Set([
    'article', 'section', 'main', 'header', 'footer', 'aside', 'nav',
    'div', 'span', 'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'q', 'cite',
    'pre', 'code', 'kbd', 'samp', 'var',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'figure', 'figcaption', 'img', 'picture', 'source',
    'a', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark', 'abbr', 'time',
    'details', 'summary', 'address'
  ]);

  const STRIP_TAGS = new Set([
    'script', 'style', 'link', 'meta', 'iframe', 'object', 'embed',
    'noscript', 'svg', 'canvas', 'audio', 'video',
    'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'fieldset', 'legend'
  ]);

  const SAFE_ATTRS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'datetime']);

  // Patterns that indicate copy/print/share blocking
  const JS_BLOCK_PATTERNS = [
    { re: /oncontextmenu/i, name: 'contextmenu disable' },
    { re: /onselectstart/i, name: 'selectstart disable' },
    { re: /oncopy\s*=/i, name: 'copy disable' },
    { re: /oncut\s*=/i, name: 'cut disable' },
    { re: /onpaste\s*=/i, name: 'paste disable' },
    { re: /ondragstart/i, name: 'drag disable' },
    { re: /document\.onkeydown/i, name: 'keydown override' },
    { re: /document\.onkeyup/i, name: 'keyup override' },
    { re: /window\.print\s*=/i, name: 'print override' },
    { re: /addEventListener\s*\(\s*['"](?:contextmenu|copy|cut|paste|selectstart|keydown|beforeprint|dragstart)['"]/i, name: 'event listener block' },
    { re: /preventDefault/i, name: 'preventDefault (informational)' },
    { re: /devtools|debugger/i, name: 'devtools/debugger trap' }
  ];

  const CSS_BLOCK_PATTERNS = [
    { re: /user-select\s*:\s*none/i, name: 'user-select: none' },
    { re: /-webkit-user-select\s*:\s*none/i, name: '-webkit-user-select: none' },
    { re: /-moz-user-select\s*:\s*none/i, name: '-moz-user-select: none' },
    { re: /-ms-user-select\s*:\s*none/i, name: '-ms-user-select: none' },
    { re: /pointer-events\s*:\s*none/i, name: 'pointer-events: none' },
    { re: /@media\s+print[^{]*\{[^}]*display\s*:\s*none/i, name: '@media print display:none' },
    { re: /@media\s+print[^{]*\{[^}]*visibility\s*:\s*hidden/i, name: '@media print visibility:hidden' },
    { re: /-webkit-touch-callout\s*:\s*none/i, name: '-webkit-touch-callout: none' }
  ];

  const HTML_BLOCK_ATTRS = [
    'oncontextmenu', 'onselectstart', 'oncopy', 'oncut', 'onpaste',
    'ondragstart', 'onkeydown', 'onkeyup', 'onkeypress',
    'onbeforeprint', 'unselectable'
  ];

  const $ = (id) => document.getElementById(id);

  const els = {
    html: $('html-input'),
    css: $('css-input'),
    js: $('js-input'),
    btnProcess: $('btn-process'),
    btnDownload: $('btn-download'),
    btnClear: $('btn-clear'),
    preview: $('preview'),
    previewHint: $('preview-hint'),
    report: $('report'),
    reportCount: $('report-count'),
    reportList: $('report-list')
  };

  function detectBlocks(html, css, js) {
    const findings = [];

    for (const { re, name } of JS_BLOCK_PATTERNS) {
      if (js && re.test(js)) findings.push(`JS: ${name}`);
    }
    for (const { re, name } of CSS_BLOCK_PATTERNS) {
      if (css && re.test(css)) findings.push(`CSS: ${name}`);
      if (html && re.test(html)) findings.push(`Inline CSS: ${name}`);
    }
    for (const attr of HTML_BLOCK_ATTRS) {
      const re = new RegExp(`\\s${attr}\\s*=`, 'i');
      if (html && re.test(html)) findings.push(`HTML attr: ${attr}`);
    }
    return findings;
  }

  function sanitizeNode(node) {
    // Walk children in reverse so removals don't break iteration
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();

        if (STRIP_TAGS.has(tag)) {
          child.remove();
          continue;
        }

        if (!KEEP_TAGS.has(tag)) {
          // Unknown tag — unwrap (keep children, drop the element)
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          child.remove();
          continue;
        }

        // Strip all attributes except a safe allowlist
        const attrs = Array.from(child.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          if (SAFE_ATTRS.has(name)) {
            // Sanitize href/src against javascript: scheme
            if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
              child.removeAttribute(attr.name);
            }
            continue;
          }
          child.removeAttribute(attr.name);
        }

        // Open links in new tab for safety
        if (tag === 'a' && child.hasAttribute('href')) {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        }

        sanitizeNode(child);

        // Remove empty containers (but keep void elements + media)
        if (
          !child.hasChildNodes() &&
          !['img', 'br', 'hr', 'source', 'col'].includes(tag) &&
          (child.textContent || '').trim() === ''
        ) {
          child.remove();
        }
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      }
    }
  }

  function buildReader(htmlSource) {
    const doc = new DOMParser().parseFromString(htmlSource || '', 'text/html');

    // If parsing produced nothing meaningful, fall back to wrapping plain text
    const root = doc.body;
    sanitizeNode(root);

    return root.innerHTML.trim();
  }

  function process() {
    const html = els.html.value;
    const css = els.css.value;
    const js = els.js.value;

    if (!html.trim()) {
      els.preview.innerHTML = '';
      els.previewHint.textContent = 'Paste some HTML to begin.';
      els.btnDownload.disabled = true;
      els.report.hidden = true;
      return;
    }

    const findings = detectBlocks(html, css, js);
    const cleanHtml = buildReader(html);

    els.preview.innerHTML = cleanHtml || '<p><em>No readable content was extracted.</em></p>';
    els.previewHint.textContent = 'Reader view ready — copy, print, or download as PDF.';
    els.btnDownload.disabled = false;

    if (findings.length) {
      els.report.hidden = false;
      els.reportCount.textContent = String(findings.length);
      els.reportList.innerHTML = findings
        .map((f) => `<li>${escapeHtml(f)}</li>`)
        .join('');
    } else {
      els.report.hidden = true;
    }
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function downloadPdf() {
    if (typeof html2pdf === 'undefined') {
      alert('PDF library still loading — try again in a moment.');
      return;
    }
    if (!els.preview.innerHTML.trim()) return;

    // Clone preview into a clean container with print-friendly margins
    const container = document.createElement('div');
    container.className = 'reader';
    container.style.cssText = 'padding: 24px; font-family: Georgia, serif; color: #222; background: #fff;';
    container.innerHTML = els.preview.innerHTML;

    const filename = `reader-${new Date().toISOString().slice(0, 10)}.pdf`;

    html2pdf()
      .set({
        margin: [12, 14, 14, 14],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      })
      .from(container)
      .save();
  }

  function clearAll() {
    els.html.value = '';
    els.css.value = '';
    els.js.value = '';
    els.preview.innerHTML = '';
    els.previewHint.textContent = 'Reader output will appear here.';
    els.btnDownload.disabled = true;
    els.report.hidden = true;
  }

  els.btnProcess.addEventListener('click', process);
  els.btnDownload.addEventListener('click', downloadPdf);
  els.btnClear.addEventListener('click', clearAll);
})();
