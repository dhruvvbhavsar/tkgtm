"use strict";
function setupViews(){
  const continuation=document.createElement('section');continuation.id='continue-listening';$('home-content').prepend(continuation);
  continuation.addEventListener('click',e=>{const button=e.target.closest('[data-resume]');if(button){const l=state.all.find(l=>l.id===Number(button.dataset.resume));if(l)play(l);}});
  const dialog=$('now-playing');
  $('np-heard').onclick=()=>{if(state.playing)toggleHeard(state.playing);};
  $('expand-player').onclick=(e)=>{e.stopPropagation();document.querySelectorAll('#player .player-progress,#player .player-layout').forEach(n=>$('expanded-content').append(n));dialog.showModal();};
  $('close-player').onclick=()=>dialog.close();
  document.querySelector('#player .player-episode').addEventListener('click',(e)=>{ if(e.target.closest('button'))return; if(!dialog.open){ document.querySelectorAll('#player .player-progress,#player .player-layout').forEach(n=>$('expanded-content').append(n)); dialog.showModal(); } });
  // One unified bottom dock on phones: player + tabs in a single card so
  // the two surfaces can never overlap. Desktop keeps them separate.
  const dock=document.createElement('div');dock.className='dock';dock.setAttribute('aria-hidden','false');
  const navEl=document.querySelector('.app-nav'),playerEl=$('player'),shellEl=document.querySelector('.shell'),audioEl=$('audio');
  const mq=window.matchMedia('(max-width:700px)');
  const placeDock=()=>{
    if(mq.matches){
      if(!dock.isConnected)document.body.append(dock);
      dock.append(playerEl,navEl);
    } else {
      if(dock.isConnected)dock.remove();
      shellEl.before(navEl);audioEl.before(playerEl);
    }
  };
  if(mq.addEventListener)mq.addEventListener('change',placeDock);
  placeDock();
  $('play').addEventListener('click',(e)=>e.stopPropagation());
  dialog.addEventListener('close',()=>{while($('expanded-content').firstChild)$('player').append($('expanded-content').firstChild);$('expand-player').focus();});
  $('library-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-library]');if(!b)return;state.libraryTab=b.dataset.library;document.querySelectorAll('[data-library]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
  const hero=document.createElement('section');hero.id='series-hero';hero.hidden=true;$('library').prepend(hero);
  const selections = ['How To Improve Your Chanting','Nectar of Instruction Series','Nectarean Glories of Vrndavana','Sri Isopanisad Series'];
  $('collections').innerHTML = selections.map((name,i)=>{
    const items=state.all.filter(l=>l.series===name);
    return `<a class="collection-card" href="#series?name=${encodeURIComponent(name)}"><div class="collection-art art-${i}" aria-hidden="true"><span>TKG / COLLECTION ${String(i+1).padStart(2,'0')}</span><i></i><b>${['The holy<br>name','A life of<br>devotion','The sacred<br>dhama','Wisdom<br>within'][i]}</b></div><h3>${esc(name)}</h3><p>${items.length} lectures · ${[...new Set(items.map(l=>l.year))].join(', ')}</p></a>`;
  }).join('');
  window.addEventListener('hashchange',()=>applyView(true));
  applyView(false);
}
function renderContinue(){
  // Only actual saved listening positions appear here.
  const target=$('continue-listening');if(!target)return;
  const items=Object.values(state.positions).filter(p=>p && p.position>5 && p.position<p.duration*.9 && state.all.some(l=>l.id===p.id)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,3);
  target.hidden=!items.length;
  target.innerHTML='<h2>Continue listening</h2><div class="resume-grid">'+items.map(p=>{const l=state.all.find(l=>l.id===p.id);return `<button class="resume-card" data-resume="${l.id}"><span class="resume-icon" aria-hidden="true">▶</span><span><b>${esc(l.title)}</b><small>${esc(l.series||l.year)} · ${fmtTime(p.position)} listened</small><progress max="${p.duration}" value="${p.position}" aria-label="Listening progress"></progress></span></button>`;}).join('')+'</div>';
}
function syncRoute(){
  if(!state.view)return;
  const p=new URLSearchParams();
  if(state.view==='series'){ if(state.seriesName)p.set('name',state.seriesName); }
  else {
    for(const key of ['q','series','year'])if(state[key])p.set(key,state[key]);
    if(state.sort!=='year')p.set('sort',state.sort);
    if(state.savedOnly)p.set('offline','1');if(state.heardOnly)p.set('heard','1');
    if(state.view==='library' && state.libraryTab!=='favourites')p.set('tab',state.libraryTab);
  }
  const hash='#'+state.view+(p.size?'?'+p.toString():'');
  if(location.hash!==hash)history.replaceState(null,'',hash);
}
function applyView(focus){
  // Restore the complete filter state when browser history changes.
  renderContinue();
  const [path,query] = location.hash.slice(1).split('?');
  state.view=['home','browse','library','search','series'].includes(path)?path:'home';
  const params=new URLSearchParams(query);
  state.seriesName=params.get('name')||'';
  state.series=params.get('series')||'';
  state.year=params.get('year')||'';state.q=params.get('q')||'';state.savedOnly=params.get('offline')==='1';state.heardOnly=params.get('heard')==='1';state.visible=200;
  state.sort=['year','title','length'].includes(params.get('sort'))?params.get('sort'):'year';
  state.libraryTab=['favourites','downloads','history'].includes(params.get('tab'))?params.get('tab'):'favourites';
  document.querySelectorAll('[data-library]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.library===state.libraryTab)));
  $('q').value=state.q;$('series').value=state.series;$('sort').value=state.sort;
  $('offline-filter').setAttribute('aria-pressed',String(state.savedOnly));$('heard-filter').setAttribute('aria-pressed',String(state.heardOnly));
  document.body.dataset.view=state.view;
  const seriesItems=state.view==='series'?state.all.filter(l=>l.series===state.seriesName):[];
  document.querySelector('h1').textContent=state.view==='series'?(state.seriesName||'Series'):state.view[0].toUpperCase()+state.view.slice(1);
  $('view-description').textContent=state.view==='series'?`${seriesItems.length} lectures, in the order they were given.`:{home:'Make a little room for listening.',browse:'A lifetime of teachings. Yours to explore.',library:'Your listening, gathered in one place.',search:'Find a teaching, a place, a moment.'}[state.view];
  document.querySelectorAll('.app-nav>a:not(.identity)').forEach(a=>{const target=state.view==='series'?'browse':state.view;if(a.hash==='#'+target)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('home-content').hidden=state.view!=='home';
  $('browse-all').hidden=state.view!=='home';
  $('library-tabs').hidden=state.view!=='library';
  document.querySelector('.search-wrap').hidden=state.view!=='search';
  document.querySelector('.controls').hidden=state.view==='home'||state.view==='series';
  $('offline-filter').hidden=state.view==='library';
  $('years').hidden=state.view==='home'||state.view==='library'||state.view==='series';
  document.querySelector('.library-heading h2').textContent=state.view==='home'?'From the archive':state.view==='series'?'Lectures in order':state.series||'All lectures';
  buildYears();render();
  if(focus){window.scrollTo(0,0);(state.view==='search'?$('q'):document.querySelector('h1')).focus();}
}
function seriesByName(name){
  return state.all.filter(l=>l.series===name).slice().sort(seriesSort);
}
function shortSeriesTitle(name){
  return String(name||'').replace(/\s+Series$/,'').replace(/\s+Vol(ume)?\.?\s+\d+$/,'');
}
function renderSeriesHero(){
  const hero=$('series-hero');if(!hero)return;
  if(state.view!=='series'){hero.hidden=true;return;}
  const name=state.seriesName||'';
  const items=seriesByName(name);
  const heard=items.filter(l=>state.heard.has(l.id)).length;
  const started=heard>0||items.some(l=>state.positions[l.id]&&state.positions[l.id].position>5);
  const next=started?(items.find(l=>!state.heard.has(l.id)&&state.positions[l.id]&&state.positions[l.id].position>5&&state.positions[l.id].position<state.positions[l.id].duration*.9)
    ||items.find(l=>!state.heard.has(l.id))||null):null;
  const years=[...new Set(items.map(l=>l.year))].join(', ');
  hero.hidden=false;
  hero.innerHTML='<a class="series-back" href="#browse">\u2190 Browse the archive</a>'
    +'<div class="series-head"><div class="collection-art art-'+(artIndexFor(name)%4)+'" aria-hidden="true"><span>TKG / SERIES</span><i></i><b>'+esc(shortSeriesTitle(name))+'</b></div>'
    +'<div class="series-info"><h2 class="series-title">'+esc(name)+'</h2><p class="series-meta">'+items.length+' lectures'+(years?' \u00b7 '+esc(years):'')+'</p>'
    +'<p id="series-progress" role="status">'+heard+' of '+items.length+' heard</p>'
    +'<progress class="series-bar" max="'+items.length+'" value="'+heard+'" aria-label="Series progress"></progress>'
    +'<div class="series-actions">'
    +(items.length?'<button id="series-play-all">'+(started?'Play from the beginning':'Play all, in order')+'</button>':'')
    +(next?'<button id="series-continue">Continue: '+esc(cleanedTitle(next).title)+'</button>':(items.length&&heard>=items.length?'<span class="series-done">Complete \u2713</span>':''))
    +'</div></div></div>';
  const all=$('series-play-all');if(all)all.onclick=()=>play(items[0]);
  const cont=$('series-continue');if(cont&&next)cont.onclick=()=>play(next);
}
