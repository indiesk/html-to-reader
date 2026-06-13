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

  // Runs inside the sandbox to neutralise navigation/alerts, capture errors,
  // and let the parent know when the app has done meaningful render work.
  const SANDBOX_PREAMBLE = `
    try {
      window.__reader = { errors: [], renderedAt: 0, mountIds: [] };
      window.alert = window.confirm = window.prompt = function(){};
      window.open = function(){ return null; };
      window.print = function(){};
      const noop = function(){};
      try { history.pushState = history.replaceState = noop; } catch(e){}
      addEventListener('submit', function(e){ e.preventDefault(); }, true);
      addEventListener('error', function(e){
        try { window.__reader.errors.push(String(e.message || e.error || e)); } catch(_){}
      });
      addEventListener('unhandledrejection', function(e){
        try { window.__reader.errors.push('Promise: ' + String(e.reason && e.reason.message || e.reason)); } catch(_){}
      });
      // Force animations/transitions off so snapshots are stable
      const installStyle = function(){
        try {
          const s = document.createElement('style');
          s.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
          (document.head || document.documentElement).appendChild(s);
        } catch(_){}
      };
      const installObserver = function(){
        try {
          const ob = new MutationObserver(function(){ window.__reader.renderedAt = Date.now(); });
          ob.observe(document.body, { childList: true, subtree: true, characterData: true });
        } catch(_){}
      };
      if (document.body) { installStyle(); installObserver(); }
      else { document.addEventListener('DOMContentLoaded', function(){ installStyle(); installObserver(); }); }
    } catch(e){}
  `;

  // Common SPA mount point IDs to ensure exist even if not referenced explicitly
  const DEFAULT_MOUNT_IDS = ['root', 'app', '__next', 'main', '__nuxt'];

  function detectMountSelectors(js) {
    const ids = new Set(DEFAULT_MOUNT_IDS);
    if (!js) return Array.from(ids);
    const patterns = [
      /getElementById\s*\(\s*['"`]([a-zA-Z_][\w-]*)['"`]\s*\)/g,
      /querySelector(?:All)?\s*\(\s*['"`]#([a-zA-Z_][\w-]*)['"`]\s*\)/g
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(js))) ids.add(m[1]);
    }
    return Array.from(ids);
  }

  function existingIdsIn(html) {
    const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
    const set = new Set();
    doc.querySelectorAll('[id]').forEach((el) => set.add(el.id));
    return set;
  }

  function buildSandboxDoc(html, css, js) {
    const css2 = escapeForStyle(css || '');
    const js2 = escapeForScript(js || '');
    const mountIds = detectMountSelectors(js);
    const existing = existingIdsIn(html);
    const missingMounts = mountIds.filter((id) => !existing.has(id));
    const mountDivs = missingMounts.map((id) => `<div id="${id}" data-reader-injected-mount></div>`).join('');
    const recordMounts = `<script>try{window.__reader.mountIds=${JSON.stringify(mountIds)};}catch(e){}<\/script>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">
      <style>${css2}</style>
      <script>${SANDBOX_PREAMBLE}<\/script>
    </head><body>${mountDivs}${html}${recordMounts}<script>try{${js2}}catch(e){try{window.__reader.errors.push('Top-level: '+String(e&&e.message||e));}catch(_){}}<\/script></body></html>`;
  }

  function shortLabel(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  // ---------- Static JS data extraction ----------
  // Many bundles inline content as object-literal arrays the runtime never
  // exposes on `window` (var declarations get scoped by minifiers). The state
  // walker can't reach this content. We mine it directly from the source.

  function findMatchingBracket(src, start) {
    const open = src[start];
    const close = open === '[' ? ']' : open === '{' ? '}' : open === '(' ? ')' : null;
    if (!close) return -1;
    let depth = 0;
    let str = null;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (str) {
        if (c === '\\') { i++; continue; }
        if (c === str) str = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { str = c; continue; }
      if (c === '[' || c === '{' || c === '(') depth++;
      else if (c === ']' || c === '}' || c === ')') {
        depth--;
        if (depth === 0) return c === close ? i : -1;
      }
    }
    return -1;
  }

  function splitTopLevelByComma(inner) {
    const items = [];
    let depth = 0, str = null, start = 0;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (str) {
        if (c === '\\') { i++; continue; }
        if (c === str) str = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { str = c; continue; }
      if (c === '[' || c === '{' || c === '(') depth++;
      else if (c === ']' || c === '}' || c === ')') depth--;
      else if (c === ',' && depth === 0) {
        items.push(inner.slice(start, i).trim());
        start = i + 1;
      }
    }
    const tail = inner.slice(start).trim();
    if (tail) items.push(tail);
    return items;
  }

  function parseObjectLiteralText(text) {
    if (!text.startsWith('{') || !text.endsWith('}')) return null;
    const inner = text.slice(1, -1);
    const parts = splitTopLevelByComma(inner);
    const obj = {};
    for (const part of parts) {
      let depth = 0, str = null, colon = -1;
      for (let i = 0; i < part.length; i++) {
        const c = part[i];
        if (str) { if (c === '\\') { i++; continue; } if (c === str) str = null; continue; }
        if (c === '"' || c === "'" || c === '`') { str = c; continue; }
        if (c === '[' || c === '{' || c === '(') depth++;
        else if (c === ']' || c === '}' || c === ')') depth--;
        else if (c === ':' && depth === 0) { colon = i; break; }
      }
      if (colon < 0) continue;
      let key = part.slice(0, colon).trim();
      if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
      }
      const valText = part.slice(colon + 1).trim();
      let value;
      if ((valText.startsWith('"') && valText.endsWith('"')) ||
          (valText.startsWith("'") && valText.endsWith("'")) ||
          (valText.startsWith('`') && valText.endsWith('`'))) {
        value = valText.slice(1, -1)
          .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
          .replace(/\\"/g, '"').replace(/\\'/g, "'")
          .replace(/\\`/g, '`').replace(/\\\\/g, '\\');
      } else {
        value = valText; // keep raw — non-string values rendered minimally
      }
      if (key) obj[key] = value;
    }
    return Object.keys(obj).length ? obj : null;
  }

  function isProseString(s, minLen) {
    if (typeof s !== 'string' || s.length < minLen) return false;
    if (/^r\.jsxs?\(/.test(s)) return false;             // React.createElement literal
    if (/^[a-zA-Z_$][\w$]*\.jsxs?\(/.test(s)) return false;
    if (/^\(/.test(s) || /^=>/.test(s)) return false;    // arrow function body
    if (/^\[/.test(s) && !/^\["/.test(s)) return false;  // raw array literal
    if (/^\{\w/.test(s)) return false;                   // raw object literal
    if (!/\s/.test(s)) return false;                     // single token — not prose
    return true;
  }

  // Strict — used to detect content-bearing arrays in the source.
  function isReadableString(s) { return isProseString(s, 30); }

  // Looser — used when rendering fields of an already-matched array.
  function isRenderableString(s) { return isProseString(s, 10); }

  function isRichObject(obj) {
    let n = 0;
    for (const v of Object.values(obj)) if (isReadableString(v)) n++;
    return n >= 1;
  }

  function extractContentArrays(js) {
    if (!js) return [];
    const arrays = [];
    const src = js;
    let i = 0;
    while (i < src.length - 1) {
      if (src[i] === '[' && src[i + 1] === '{') {
        const end = findMatchingBracket(src, i);
        if (end > 0 && end - i < 200000) {
          const inner = src.slice(i + 1, end);
          const items = splitTopLevelByComma(inner);
          if (items.length >= 2 && items.length <= 100) {
            const parsed = items.map(parseObjectLiteralText).filter(Boolean);
            if (parsed.length >= items.length / 2 && parsed.filter(isRichObject).length >= 2) {
              arrays.push(parsed);
              i = end + 1;
              continue;
            }
          }
        }
      }
      i++;
    }
    return arrays;
  }

  // Pick a sensible heading for an item from its known fields
  function itemHeading(item) {
    const numKey = ['score', 'num', 'number', 'step', 'order', 'index'].find((k) => k in item);
    const nameKey = ['label', 'title', 'name', 'heading', 'role', 'criterion'].find((k) => k in item);
    const num = numKey ? String(item[numKey]).trim() : '';
    const name = nameKey ? String(item[nameKey]).trim() : '';
    if (num && name) return `${num} — ${name}`;
    if (name) return name;
    if (num) return num;
    return '';
  }

  function itemLabel(item) {
    return String(item.label || item.title || item.name || item.heading || item.role || '').trim();
  }

  // Render the array's items as a stacked, labeled variants block — meant to
  // replace the content of the "result panel" sibling of a button group.
  function buildVariantsBlock(items, doc) {
    const wrap = doc.createElement('div');
    wrap.setAttribute('data-reader-variants', '');
    const skipKeys = new Set(['score', 'num', 'number', 'order', 'index', 'step',
      'label', 'title', 'name', 'heading', 'role', 'tag', 'tone', 'color', 'bg', 'icon', 'emoji']);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (i > 0) wrap.appendChild(doc.createElement('hr'));

      const head = itemHeading(item);
      if (head) {
        const h = doc.createElement('p');
        const s = doc.createElement('strong');
        s.textContent = head + ':';
        h.appendChild(s);
        // Append small qualifiers (tone, role) inline
        const qualifiers = [];
        for (const k of ['tone', 'role', 'tag', 'section']) {
          if (item[k] && typeof item[k] === 'string' && item[k].length < 40 && !/^r\./.test(item[k])) qualifiers.push(item[k]);
        }
        if (qualifiers.length) h.appendChild(doc.createTextNode(' (' + qualifiers.join(', ') + ')'));
        wrap.appendChild(h);
      }

      for (const [k, v] of Object.entries(item)) {
        if (skipKeys.has(k)) continue;
        if (!isRenderableString(v)) continue;
        const p = doc.createElement('p');
        const em = doc.createElement('em');
        em.textContent = k + ': ';
        p.appendChild(em);
        p.appendChild(doc.createTextNode(v));
        wrap.appendChild(p);
      }
    }
    return wrap;
  }

  // Score how well an array matches a button group: count buttons whose text
  // contains at least one item's label. Return null below 2 matches.
  function scoreArrayForButtons(items, buttons) {
    const labels = items.map(itemLabel).filter(Boolean);
    if (labels.length < 2) return 0;
    const btnTexts = buttons.map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim());
    let score = 0;
    for (const t of btnTexts) {
      if (labels.some((l) => t === l || t.includes(' ' + l) || t.includes(l + ' ') || t.endsWith(l) || t.startsWith(l))) score++;
    }
    return score;
  }

  function bestArrayFor(arrays, buttons) {
    if (buttons.length < 2) return null;
    let best = null, bestScore = 0;
    for (const items of arrays) {
      const s = scoreArrayForButtons(items, buttons);
      if (s > bestScore && s >= Math.min(2, Math.floor(buttons.length / 2) + 1)) {
        best = items; bestScore = s;
      }
    }
    return best;
  }

  // Walk the parsed HTML doc for button groups; for each, look up the
  // best-matching JS-source array and inject all variants into the result panel.
  function injectMatchingArrays(htmlSource, arrays) {
    if (!arrays.length || !htmlSource) return { html: htmlSource, injected: 0, matchedArrays: 0 };
    const parsed = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${htmlSource}</body></html>`, 'text/html');
    const body = parsed.body;

    const allButtons = Array.from(body.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"]'));
    const groups = new Map();
    for (const b of allButtons) {
      const p = b.parentElement;
      if (!p) continue;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(b);
    }

    let injected = 0;
    const usedArrays = new Set();

    for (const [parent, buttons] of groups) {
      if (buttons.length < 2) continue;
      const items = bestArrayFor(arrays, buttons);
      if (!items) continue;

      const container = parent.parentElement;
      if (!container) continue;
      const siblings = Array.from(container.children).filter((c) => c !== parent);
      if (!siblings.length) continue;
      const panel = siblings.reduce(
        (acc, s) => ((s.textContent || '').length > (acc ? (acc.textContent || '').length : -1) ? s : acc),
        null
      );
      if (!panel) continue;

      const block = buildVariantsBlock(items, parsed);
      panel.innerHTML = '';
      panel.appendChild(block);
      injected++;
      usedArrays.add(items);
    }

    return { html: body.innerHTML, injected, matchedArrays: usedArrays.size };
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

  // Pick the largest non-empty mount subtree, falling back to body
  function pickRenderRoot(doc, mountIds) {
    let best = null;
    let bestText = 0;
    for (const id of mountIds || []) {
      const el = doc.getElementById(id);
      if (!el) continue;
      const t = (el.textContent || '').trim().length;
      if (t > bestText) { best = el; bestText = t; }
    }
    return { el: best, textLen: bestText };
  }

  async function captureWithStates(html, css, js, onProgress) {
    if (!js || !js.trim()) return null;

    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none;';
      iframe.setAttribute('aria-hidden', 'true');

      const result = {
        html: null,
        variants: 0,
        renderSource: 'static',
        renderRootTag: '',
        renderRootId: '',
        renderTextLen: 0,
        errors: [],
        mountIds: [],
        timedOut: false
      };

      const HARD_TIMEOUT = 20000;
      const timer = setTimeout(() => {
        result.timedOut = true;
        try { iframe.remove(); } catch (e) {}
        resolve(result);
      }, HARD_TIMEOUT);

      iframe.addEventListener('load', async () => {
        try {
          const win = iframe.contentWindow;
          const d = iframe.contentDocument;
          if (!d || !d.body || !win) {
            clearTimeout(timer); iframe.remove(); return resolve(result);
          }

          // Poll for the app to actually render content into a mount point.
          // Many SPAs need 1-3s on first paint of a 1MB+ bundle.
          const mountIds = (win.__reader && win.__reader.mountIds) || detectMountSelectors(js);
          result.mountIds = mountIds;

          const t0 = Date.now();
          let last = pickRenderRoot(d, mountIds);
          while (Date.now() - t0 < 6000) {
            await sleep(200);
            const cur = pickRenderRoot(d, mountIds);
            if (cur.textLen > 100 && cur.textLen === last.textLen) break; // stable + non-trivial
            last = cur;
          }

          const errs = (win.__reader && win.__reader.errors) || [];
          result.errors = errs.slice(0, 10);

          let walkRoot = last.el;
          let source = 'mount';
          if (!walkRoot || last.textLen < 50) {
            walkRoot = d.body;
            source = 'static';
          }
          result.renderSource = source;
          result.renderRootTag = walkRoot.tagName ? walkRoot.tagName.toLowerCase() : '';
          result.renderRootId = walkRoot.id || '';
          result.renderTextLen = (walkRoot.textContent || '').trim().length;

          if (onProgress) onProgress(`Walking ${result.renderSource === 'mount' ? '#' + result.renderRootId : 'static body'} for interactive states…`);

          result.variants = await expandAllVariants(walkRoot).catch(() => 0);

          // For final HTML, prefer the mount root's outerHTML so we discard
          // injected mount-only chrome from the user's static paste.
          result.html = source === 'mount' ? walkRoot.outerHTML : d.body.innerHTML;

          clearTimeout(timer);
          iframe.remove();
          resolve(result);
        } catch (err) {
          result.errors.push(String(err && err.message || err));
          clearTimeout(timer);
          try { iframe.remove(); } catch (e) {}
          resolve(result);
        }
      });

      // Blob URL (not srcdoc) — gives the iframe a real http-ish location so
      // routers that call new URL(location.href) don't blow up.
      let blobUrl = null;
      try {
        const doc = buildSandboxDoc(html, css, js);
        const blob = new Blob([doc], { type: 'text/html' });
        blobUrl = URL.createObjectURL(blob);
        iframe.src = blobUrl;
      } catch (e) {
        clearTimeout(timer);
        result.errors.push('sandbox build: ' + (e && e.message || e));
        resolve(result);
        return;
      }
      // Revoke when iframe load resolves (handled by removing iframe in load handler)
      const _origResolve = resolve;
      resolve = (v) => { try { if (blobUrl) URL.revokeObjectURL(blobUrl); } catch (e) {} _origResolve(v); };
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
    let captured = null;

    if (js.trim()) {
      els.previewHint.textContent = 'Running scripts in sandbox to capture dynamic states…';
      captured = await captureWithStates(html, css, js, (msg) => {
        els.previewHint.textContent = msg;
      });
      // Sandbox output is informational — we use the user's HTML as the layout
      // skeleton, then inject matched JS arrays into it (see below).
    }

    // Mine the JS source for inlined content arrays the runtime hides from us
    // (var-scoped data the minifier kept out of `window`). For each button
    // group in the HTML, find the matching array and inject its items in-place.
    let extractedArrays = [];
    let injectedGroups = 0;
    let matchedArrays = 0;
    let unmatchedArrayCount = 0;
    if (js.trim()) {
      els.previewHint.textContent = 'Mining JavaScript for embedded content arrays…';
      await sleep(0); // yield to the UI before a possibly-large parse
      try {
        extractedArrays = extractContentArrays(js);
      } catch (e) { /* ignore */ }

      if (extractedArrays.length) {
        const r = injectMatchingArrays(sourceHtml, extractedArrays);
        sourceHtml = r.html;
        injectedGroups = r.injected;
        matchedArrays = r.matchedArrays;
        unmatchedArrayCount = extractedArrays.length - matchedArrays;
      }
    }

    const cleanHtml = buildReader(sourceHtml);
    els.preview.innerHTML = cleanHtml || '<p><em>No readable content was extracted.</em></p>';

    // Build a single-line summary of what happened
    const parts = [];
    if (injectedGroups > 0) {
      parts.push(`injected ${injectedGroups} dynamic widget${injectedGroups === 1 ? '' : 's'} from JS data`);
    }
    if (captured) {
      if (captured.variants > 0) parts.push(`walked ${captured.variants} interactive group${captured.variants === 1 ? '' : 's'} in sandbox`);
      if (captured.timedOut) parts.push('sandbox timed out');
    }
    els.previewHint.textContent = parts.length
      ? `Reader view ready — ${parts.join(', ')}.`
      : 'Reader view ready — copy, print, or download as PDF.';

    els.btnDownload.disabled = false;
    els.btnProcess.disabled = false;

    // Combine restriction findings + diagnostics into the report
    const reportItems = findings.slice();
    if (extractedArrays.length) {
      reportItems.push(`Parsed ${extractedArrays.length} content arrays from JS source (${matchedArrays} matched HTML, ${unmatchedArrayCount} unmatched and skipped)`);
    }
    if (captured) {
      if (captured.renderSource === 'mount') {
        reportItems.push(`Sandbox rendered JS into <${captured.renderRootTag}#${captured.renderRootId}> (${captured.renderTextLen.toLocaleString()} chars)`);
      } else if (js.trim()) {
        reportItems.push(`Sandbox: JS did not populate any mount point`);
      }
      for (const e of (captured.errors || [])) {
        reportItems.push(`Sandbox JS error: ${e}`);
      }
    }

    if (reportItems.length) {
      els.report.hidden = false;
      els.reportCount.textContent = String(reportItems.length);
      els.reportList.innerHTML = reportItems.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
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
