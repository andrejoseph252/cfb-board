/* Redraw by changing only what changed. A view hands over its whole HTML on every refresh; setting innerHTML with it
   throws away every element and builds new ones, so logos blink, running animations restart and the browser lays the
   whole page out again, even when one score moved. This walks the new HTML against what's on screen and touches only
   the differences: elements that are the same stay exactly as they are.

   Elements are matched by key where they have one (id, data-k, or data-id such as a game card's), so a card that moves
   to another spot in its list is moved, not rebuilt; everything else is matched in order by tag and class. */

const keyOf = n => n.nodeType === 1 ? n.id || n.dataset.k || (n.dataset.id ? 'id:' + n.dataset.id : '') : '';
/* Unkeyed nodes that can stand in for each other: same kind, and for elements the same tag and classes. */
// (The class attribute, not className: on SVG elements that's an object, never equal to another.)
const fits = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.localName === b.localName && a.getAttribute('class') === b.getAttribute('class') && !keyOf(a)));

export function morph(el, html){
  const t = document.createElement('template');
  t.innerHTML = html;
  children(el, t.content);
}

function children(from, to){
  let keyed = null;
  for (let c = from.firstElementChild; c; c = c.nextElementSibling){ const k = keyOf(c); if (k) (keyed ??= new Map()).set(k, c); }
  let old = from.firstChild;
  for (let nw = to.firstChild; nw;){
    const next = nw.nextSibling, k = keyOf(nw);
    let match = null;
    if (k){ match = keyed?.get(k) || null; if (match && match.localName !== nw.localName) match = null; if (match) keyed.delete(k); }
    else {
      // The next one in line, or one a few places on when something ahead of it has gone.
      let c = old;
      for (let i = 0; c && i < 8 && !fits(c, nw); i++) c = c.nextSibling;
      if (c && fits(c, nw)) match = c;
    }
    if (match){
      if (match === old) old = old.nextSibling; else from.insertBefore(match, old);
      sync(match, nw);
    } else from.insertBefore(nw, old);
    nw = next;
  }
  while (old){ const n = old.nextSibling; from.removeChild(old); old = n; }
}

function sync(el, nw){
  if (el.nodeType !== 1){ if (el.nodeValue !== nw.nodeValue) el.nodeValue = nw.nodeValue; return; }
  if (el.isEqualNode(nw)) return;
  const have = el.attributes, want = nw.attributes;
  // A drawer's fold-outs (details with data-k) stay as the reader left them unless the view opens them.
  const keepOpen = el.localName === 'details' && el.dataset.k;
  for (let i = have.length - 1; i >= 0; i--){ const n = have[i].name; if (!nw.hasAttribute(n) && !(keepOpen && n === 'open')) el.removeAttribute(n); }
  for (let i = 0; i < want.length; i++){ const { name, value } = want[i]; if (el.getAttribute(name) !== value) el.setAttribute(name, value); }
  // A text box shows what was typed, not its value attribute: follow the view, except while it's being typed in.
  if (el.localName === 'input' && el !== document.activeElement && el.value !== (nw.getAttribute('value') ?? '') && el.type !== 'checkbox' && el.type !== 'radio') el.value = nw.getAttribute('value') ?? '';
  children(el, nw);
}
