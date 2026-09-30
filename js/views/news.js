/* News: the drawer (#news) and the short list on the My team tab. Stories open on espn.com.
   The drawer leads with ESPN's top article, then a sideways row of videos, then the rest by day. */
import { esc, fmtDay } from '../util.js';
import { state } from '../state.js';
import { myTeam } from '../myteam.js';
import { news, newsFilter, markSeen, lastVisitAt, isRead, openStory } from '../news.js';
import { logo, panel, chips } from './components.js';

function ago(t){
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h ago`;
  if (m < 7 * 24 * 60) return `${Math.round(m / 1440)}d ago`;
  return fmtDay(t);
}
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const img = a => a.img ? `<img class="news-img" src="${esc(a.img)}" alt="" loading="lazy">` : '<span class="news-img"></span>';
const logos = a => a.teams.map(id => state.standings?.byTeam[id]?.logo).filter(Boolean).slice(0, 3).map(l => logo(l, 'logo')).join('');
const meta = a => `<span class="news-m">${logos(a) ? `<span class="news-logos">${logos(a)}</span>` : ''}${a.video ? '<span class="news-tag">Video</span>' : ''}<span>${esc(ago(a.at))}</span></span>`;
const link = (a, cls, body) => `<a class="${cls}" href="${esc(a.href)}" target="_blank" rel="noopener" data-read="${esc(a.id)}">${body}</a>`;

/* One row. On desktop the summary shows inline; on phones tapping the row unfolds it (see main.js). */
function item(a, compact){
  const cls = `news-item${compact ? ' sm' : ''}${isRead(a.id) ? ' read' : ''}${openStory === a.id ? ' open' : ''}`;
  return `<div class="${cls}" data-story="${esc(a.id)}"${a.desc ? ' data-desc' : ''}>${link(a, 'news-main', `${img(a)}
    <span class="news-t"><span class="news-h">${esc(a.headline)}</span>${!compact && a.desc ? `<span class="news-d">${esc(a.desc)}</span>` : ''}${meta(a)}</span>`)}
    ${a.desc ? `<div class="news-x"><p>${esc(a.desc)}</p>${link(a, 'news-go', 'Read on ESPN ↗')}</div>` : ''}</div>`;
}

const lead = a => link(a, `news-lead${isRead(a.id) ? ' read' : ''}`, `${img(a)}<span class="news-h">${esc(a.headline)}</span>${a.desc ? `<span class="news-d">${esc(a.desc)}</span>` : ''}${meta(a)}`);
const video = a => link(a, `news-vid${isRead(a.id) ? ' read' : ''}`, `<span class="news-vimg">${img(a)}<i>${PLAY}</i></span><span class="news-h">${esc(a.headline)}</span><span class="news-m">${esc(ago(a.at))}</span>`);

function day(t){
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'Earlier this week' : 'Older';
}

/* Articles by day, with a "Last visit" line above the first story that was already out last time you looked. */
function byDay(items, mark){
  let out = '', last = '', marked = !mark || !items.some(a => a.at > mark);
  for (const a of items){
    const d = day(a.at);
    if (d !== last){ out += `<h4 class="news-day">${d}</h4>`; last = d; }
    if (!marked && a.at <= mark){ out += '<div class="news-new"><span>Last visit</span></div>'; marked = true; }
    out += item(a);
  }
  return `<div class="news-list">${out}</div>`;
}

const status = (f, none) => f.err ? `<div class="err">Couldn't load news. ${esc(f.err)}</div>` : f.items ? `<p class="muted">${none}</p>` : '<div class="skeleton tall"></div>';

/* The drawer: all of college football, or (with a team picked) just yours. */
export function viewNews(){
  const mine = myTeam && newsFilter === 'mine', f = news(mine ? myTeam.id : null);
  if (!mine && f.items) markSeen();
  const toggle = myTeam ? chips([['all', 'All'], ['mine', myTeam.name]], mine ? 'mine' : 'all', 'newsf') : '';
  let body;
  if (!f.items?.length) body = status(f, 'No stories right now.');
  else {
    const arts = f.items.filter(a => !a.video), vids = f.items.filter(a => a.video);
    const top = [...arts].sort((a, b) => a.rank - b.rank).find(a => a.img) || arts[0];
    body = (top ? lead(top) : '') +
      (vids.length ? `<h4 class="news-day">Videos</h4><div class="news-vids">${vids.map(video).join('')}</div>` : '') +
      byDay(arts.filter(a => a !== top), mine ? null : lastVisitAt());
  }
  return `<div data-title="News">${toggle}${body}<p class="tt-note">Stories from ESPN; each opens on espn.com.</p></div>`;
}

/* My team tab: the newest few, with a way into the drawer for the rest. */
export function newsPanel(t){
  const f = news(t.id);
  const more = f.items?.length > 4 ? `<button class="chipbtn news-more" type="button" data-newsopen="mine">More ${esc(t.name)} news</button>` : '';
  const body = f.items?.length ? `<div class="news-list">${f.items.slice(0, 4).map(a => item(a, true)).join('')}</div>` : status(f, `No recent stories about ${esc(t.name)}.`);
  return panel('Latest news', body + more, ' data-tt="news"');
}
