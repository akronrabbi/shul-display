// Letter-by-letter styling for text people type (announcements, the welcome
// line, the full-screen message). Only size, bold, italic, color, and line
// breaks are kept; everything else is dropped, so pasted or saved markup can
// never run code or change the page.

const SIZE = /^\s*(\d*\.?\d+)em\s*$/;
const COLOR = /^\s*(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))\s*$/i;

function cleanStyle(node) {
  const out = [];
  const style = node.style;
  const size = style?.fontSize?.match(SIZE);
  if (size) out.push(`font-size:${Math.min(5, Math.max(0.3, Number(size[1]))).toFixed(3).replace(/\.?0+$/, '')}em`);
  const weight = String(style?.fontWeight || '');
  if (/^(bold|[6-9]00)$/.test(weight)) out.push('font-weight:700');
  else if (/^(normal|[1-4]00)$/.test(weight)) out.push('font-weight:400');
  if (style?.fontStyle === 'italic') out.push('font-style:italic');
  if (COLOR.test(style?.color || '')) out.push(`color:${style.color.trim()}`);
  return out.join(';');
}

function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function walk(node) {
  let html = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      html += escapeText(child.nodeValue);
      return;
    }
    if (child.nodeType !== 1) return;
    const tag = child.tagName.toLowerCase();
    if (['script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript', 'svg', 'math'].includes(tag)) return;
    if (tag === 'br') {
      html += '<br>';
      return;
    }
    const inner = walk(child);
    const block = tag === 'div' || tag === 'p';
    if (block && html && !html.endsWith('<br>')) html += '<br>';
    let style = cleanStyle(child);
    if (tag === 'b' || tag === 'strong') style = ['font-weight:700', style].filter(Boolean).join(';');
    if (tag === 'i' || tag === 'em') style = ['font-style:italic', style].filter(Boolean).join(';');
    html += style && inner ? `<span style="${style}">${inner}</span>` : inner;
  });
  return html;
}

export function sanitizeRich(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return walk(doc.body.firstChild).replace(/(<br>)+$/, '');
}

export function richToText(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div>${String(html).replace(/<br\s*\/?>/gi, '\n')}</div>`, 'text/html');
  return doc.body.textContent || '';
}

export function textToRich(text) {
  return escapeText(text || '').replace(/\n/g, '<br>');
}

// The styled version is used only while it still matches the plain words, so
// an edit made somewhere without styling never shows stale text.
export function richFor(plain, html) {
  const clean = sanitizeRich(html);
  if (!clean) return '';
  const same = (a) => String(a || '').replace(/\s+/g, ' ').trim();
  return same(richToText(clean)) === same(plain) ? clean : '';
}

// Fills an element with the styled words, or the plain words when there is no styling.
export function fillRich(el, plain, html) {
  const rich = richFor(plain, html);
  if (rich) el.innerHTML = rich;
  else el.textContent = plain || '';
  return Boolean(rich);
}
