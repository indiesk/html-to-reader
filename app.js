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
    'figure', 'figcaption', 'img',
    'a', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark', 'abbr', 'time',
    'details', 'summary', 'address'
  ]);

  // Removed entirely — no readable content inside
  const STRIP_TREE = new Set([
    'script', 'style', 'link', 'meta', 'iframe', 'object', 'embed',
    'noscript', 'svg', 'canvas', 'audio', 'video', 'picture', 'source',
    'input', 'select', 'option', 'textarea', 'progress', 'meter'
  ]);

  // Element is dropped but its (sanitized) children are kept
  const UNWRAP_TAGS = new Set([
    'button', 'form', 'fieldset', 'legend', 'label',
    'dialog', 'menu', 'menuitem'
  ]);

  const SAFE_ATTRS = new Set([
    'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'datetime',
    'data-reader-variants', 'data-reader-variant-label'
  ]);

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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.tagName.toLowerCase();

      if (STRIP_TREE.has(tag)) { child.remove(); continue; }

      sanitizeNode(child);

      const shouldUnwrap = UNWRAP_TAGS.has(tag) || !KEEP_TAGS.has(tag);
      if (shouldUnwrap) {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }

      const attrs = Array.from(child.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (SAFE_ATTRS.has(name)) {
          if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
            child.removeAttribute(attr.name);
          }
          continue;
        }
        child.removeAttribute(attr.name);
      }

      if (tag === 'a' && child.hasAttribute('href')) {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }

      if (
        !['img', 'br', 'hr', 'col'].includes(tag) &&
        !child.hasChildNodes() &&
        (child.textContent || '').trim() === ''
      ) {
        child.remove();
      }
    }
  }

  function buildReader(htmlSource) {
    const doc = new DOMParser().parseFromString(htmlSource || '', 'text/html');
    sanitizeNode(doc.body);
    return doc.body.innerHTML.trim();
  }

  // ---------- Dynamic content capture (sandboxed) ----------

  function escapeForScript(s) {
    // Defuse </script> so it can't close the host <script> tag, and \u2028/\u2029.
    return String(s)
      .replace(/<\/(script)/gi, '<\\/$1')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }
  function escapeForStyle(s) {
    return String(s).replace(/<\/(style)/gi, '<\\/$1');
  }

  // Runs inside the sandbox to neutralise navigation/alerts and prevent state escapes
  const SANDBOX_PREAMBLE = `
    try {
      window.alert = window.confirm = window.prompt = function(){};
      window.open = function(){ return null; };
      window.print = function(){};
      const noop = function(){};
      try { history.pushState = history.replaceState = noop; } catch(e){}
      addEventListener('submit', function(e){ e.preventDefault(); }, true);
      addEventListener('beforeunload', function(e){ e.preventDefault(); e.returnValue=''; });
      // Force animations / transitions off so snapshots are stable
      const s = document.createElement('style');
      s.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(s);
    } catch(e){}
  `;

  function buildSandboxDoc(html, css, js) {
    const css2 = escapeForStyle(css || '');
    const js2 = escapeForScript(js || '');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">
      <style>${css2}</style>
    </head><body>${html}<script>${SANDBOX_PREAMBLE}<\/script><script>try{${js2}}catch(e){}<\/script></body></html>`;
  }

  function shortLabel(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function isInteractiveTrigger(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'BUTTON') return true;
    const role = (el.getAttribute && el.getAttribute('role')) || '';
    return role === 'button' || role === 'tab' || role === 'radio' || role === 'menuitem' || role === 'option';
  }

  function syntheticClick(el) {
    try {
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
      el.click();
    } catch (e) { /* swallow */ }
  }

  // Walk button groups and merge per-state content into the live DOM
  async function expandAllVariants(doc) {
    const triggers = Array.from(doc.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], [role="menuitem"], [role="option"]'))
      .filter(isInteractiveTrigger);

    // Group by direct parent — interactive groups are typically siblings
    const groups = new Map();
    for (const t of triggers) {
      const p = t.parentElement;
      if (!p) continue;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(t);
    }

    // Process deepest groups first so outer expansions don't strand nested triggers.
    const ordered = Array.from(groups.entries())
      .filter(([, items]) => items.length >= 2 && items.length <= 24)
      .sort(([a], [b]) => depth(b) - depth(a));

    let expandedCount = 0;
    for (const [parent, items] of ordered) {
      if (!parent.isConnected) continue;
      const did = await tryExpandGroup(parent, items);
      if (did) expandedCount++;
    }
    return expandedCount;
  }

  function depth(el) {
    let n = 0;
    while (el && el.parentElement) { n++; el = el.parentElement; }
    return n;
  }

  function currentSiblings(container, exclude) {
    return Array.from(container.children).filter((c) => c !== exclude);
  }

  async function tryExpandGroup(triggerParent, initialTriggers) {
    const container = triggerParent.parentElement;
    if (!container || !container.isConnected) return false;
    if (currentSiblings(container, triggerParent).length === 0) return false;

    const snapshots = [];
    const triggerCount = initialTriggers.length;

    for (let idx = 0; idx < triggerCount; idx++) {
      if (!triggerParent.isConnected || !container.isConnected) break;

      // Re-query each iteration — React may have re-mounted the parent's children
      const freshTriggers = Array.from(triggerParent.children).filter(isInteractiveTrigger);
      const trig = freshTriggers[idx] || (initialTriggers[idx] && initialTriggers[idx].isConnected ? initialTriggers[idx] : null);
      if (!trig) continue;

      syntheticClick(trig);
      await sleep(70);

      if (!container.isConnected) break;
      const sibs = currentSiblings(container, triggerParent);
      snapshots.push({
        label: shortLabel(trig),
        sibs: sibs.map((s) => s.innerHTML)
      });
    }

    if (snapshots.length < 2) return false;

    const finalSiblings = currentSiblings(container, triggerParent);
    let changed = false;

    for (let i = 0; i < finalSiblings.length; i++) {
      const variants = snapshots.map((s) => s.sibs[i] || '').filter(Boolean);
      const unique = new Set(variants);
      if (unique.size < 2) continue;

      const sibling = finalSiblings[i];
      if (!sibling.isConnected) continue;

      const ownerDoc = sibling.ownerDocument;
      const wrap = ownerDoc.createElement('div');
      wrap.setAttribute('data-reader-variants', '');

      const seen = new Set();
      for (const snap of snapshots) {
        const html = snap.sibs[i];
        if (!html || seen.has(html)) continue;
        seen.add(html);

        if (wrap.children.length > 0) {
          wrap.appendChild(ownerDoc.createElement('hr'));
        }
        if (snap.label) {
          const p = ownerDoc.createElement('p');
          const strong = ownerDoc.createElement('strong');
          strong.textContent = `${snap.label}:`;
          p.appendChild(strong);
          wrap.appendChild(p);
        }
        const body = ownerDoc.createElement('div');
        body.innerHTML = html;
        wrap.appendChild(body);
      }

      sibling.innerHTML = '';
      sibling.appendChild(wrap);
      changed = true;
    }

    return changed;
  }

  async function captureWithStates(html, css, js) {
    if (!js || !js.trim()) return null;

    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none;';
      iframe.setAttribute('aria-hidden', 'true');

      const timer = setTimeout(() => {
        try { iframe.remove(); } catch (e) {}
        resolve(null);
      }, 12000);

      iframe.addEventListener('load', async () => {
        try {
          // Give SPAs time to hydrate / render
          await sleep(900);
          const d = iframe.contentDocument;
          if (!d || !d.body) { clearTimeout(timer); iframe.remove(); return resolve({ html: null, variants: 0 }); }
          const variants = await expandAllVariants(d).catch(() => 0);
          const finalHtml = d.body.innerHTML;
          clearTimeout(timer);
          iframe.remove();
          resolve({ html: finalHtml, variants });
        } catch (err) {
          clearTimeout(timer);
          try { iframe.remove(); } catch (e) {}
          resolve(null);
        }
      });

      try {
        iframe.srcdoc = buildSandboxDoc(html, css, js);
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
        return;
      }
      document.body.appendChild(iframe);
    });
  }

  // ---------- UI flow ----------

  async function process() {
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

    els.btnProcess.disabled = true;
    els.btnDownload.disabled = true;
    els.preview.innerHTML = '';

    const findings = detectBlocks(html, css, js);

    let sourceHtml = html;
    let variantsFound = 0;

    if (js.trim()) {
      els.previewHint.textContent = 'Running scripts in sandbox to capture dynamic states…';
      const captured = await captureWithStates(html, css, js);
      if (captured && captured.html) {
        sourceHtml = captured.html;
        variantsFound = captured.variants || 0;
      } else {
        els.previewHint.textContent = 'Sandbox capture skipped — using static HTML.';
      }
    }

    const cleanHtml = buildReader(sourceHtml);

    els.preview.innerHTML = cleanHtml || '<p><em>No readable content was extracted.</em></p>';
    els.previewHint.textContent = variantsFound > 0
      ? `Reader view ready — captured ${variantsFound} dynamic group${variantsFound === 1 ? '' : 's'}.`
      : 'Reader view ready — copy, print, or download as PDF.';
    els.btnDownload.disabled = false;
    els.btnProcess.disabled = false;

    if (findings.length) {
      els.report.hidden = false;
      els.reportCount.textContent = String(findings.length);
      els.reportList.innerHTML = findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
    } else {
      els.report.hidden = true;
    }
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function downloadPdf() {
    if (typeof html2pdf === 'undefined') {
      alert('PDF library still loading — try again in a moment.');
      return;
    }
    if (!els.preview.innerHTML.trim()) return;

    const container = document.createElement('div');
    container.className = 'reader';
    container.style.cssText = 'padding: 24px; font-family: Georgia, serif; color: #222; background: #fff;';
    container.innerHTML = els.preview.innerHTML;

    const filename = `reader-${new Date().toISOString().slice(0, 10)}.pdf`;

    html2pdf().set({
      margin: [12, 14, 14, 14],
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(container).save();
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

  els.btnProcess.addEventListener('click', () => { process().catch((e) => {
    els.previewHint.textContent = `Error: ${e && e.message || e}`;
    els.btnProcess.disabled = false;
  }); });
  els.btnDownload.addEventListener('click', downloadPdf);
  els.btnClear.addEventListener('click', clearAll);
})();
