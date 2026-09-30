/* News: the drawer's full list (#news) and the short list on the My team tab. Stories open on espn.com. */
import { esc, fmtDay } from '../util.js';
import { state } from '../state.js';
import { myTeam } from '../myteam.js';
import { news, newsFilter, markSeen } from '../news.js';
import { logo, panel, chips } from './components.js';

function ago(t){
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h ago`;
  if (m < 7 * 24 * 60) return `${Math.round(m / 1440)}d ago`;
  return fmtDay(t);
}

function item(a, compact){
  const logos = a.teams.map(id => state.standings?.byTeam[id]?.logo).filter(Boolean).slice(0, 3).map(l => logo(l, 'logo')).join('');
  return `<a class="news-item${compact ? ' sm' : ''}" href="${esc(a.href)}" target="_blank" rel="noopener">
    ${a.img ? `<img class="news-img" src="${esc(a.img)}" alt="" loading="lazy">` : '<span class="news-img"></span>'}
    <span class="news-t"><span class="news-h">${esc(a.headline)}</span>${!compact && a.desc && a.desc !== a.headline ? `<span class="news-d">${esc(a.desc)}</span>` : ''}
    <span class="news-m">${logos ? `<span class="news-logos">${logos}</span>` : ''}${a.video ? '<span class="news-tag">Video</span>' : ''}<span>${esc(ago(a.at))}</span></span></span></a>`;
}

const list = (f, n, compact, none) => f.items ? (f.items.length ? `<div class="news-list">${f.items.slice(0, n).map(a => item(a, compact)).join('')}</div>` : `<p class="muted">${none}</p>`)
  : f.err ? `<div class="err">Couldn't load news. ${esc(f.err)}</div>` : '<div class="skeleton"></div>';

/* The drawer: all of college football, or (with a team picked) just yours. */
export function viewNews(){
  const mine = myTeam && newsFilter === 'mine', f = news(mine ? myTeam.id : null);
  if (!mine && f.items) markSeen();
  const toggle = myTeam ? chips([['all', 'All'], ['mine', myTeam.name]], mine ? 'mine' : 'all', 'newsf') : '';
  return `<div data-title="News">${toggle}${list(f, 30, false, 'No stories right now.')}
    <p class="tt-note">Stories from ESPN; each opens on espn.com.</p></div>`;
}

/* My team tab: the newest few, with a way into the drawer for the rest. */
export function newsPanel(t){
  const f = news(t.id);
  const more = f.items?.length > 4 ? `<button class="chipbtn news-more" type="button" data-newsopen="mine">More ${esc(t.name)} news</button>` : '';
  return panel('Latest news', list(f, 4, true, `No recent stories about ${esc(t.name)}.`) + more, ' data-tt="news"');
}
