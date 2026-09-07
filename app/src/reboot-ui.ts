import { escapeHtml, type AppUser } from "./ui";
import { POWERED_BY_BGG_LOGO } from "./bgg-logo";

export function rebootPage(user: AppUser): string {
  const admin = user.role === "admin" ? '<a href="/app/invitations">Invitations</a>' : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tonight · BoardGameEngine</title><style>${styles}</style></head><body>
<header class="topbar"><div class="topbar-inner"><a class="brand" href="/app"><span class="die" aria-hidden="true">••<br>••</span><strong>BoardGame<span>Engine</span></strong></a><nav aria-label="Application"><a class="active" href="/app">Tonight</a><a href="/app/library">Library</a><a href="/app/account">Account</a>${admin}</nav><form action="/auth/logout" method="post"><button class="quiet" type="submit">Sign out</button></form></div></header>
<main class="shell">
<section class="intro"><p class="section-label">Tonight</p><h1>What should we play?</h1><p>Set the table and get five games from your own shelf, ranked with BoardGameGeek player-count data instead of a random draw.</p></section>

<section class="onboard" id="connect-panel"><div><p class="section-label">Connect your shelf</p><h2>Use your BoardGameGeek username</h2><p class="muted">We read the public collection for this username. Your BoardGameEngine login stays separate.</p></div><form id="connect-form"><label for="bgg-username">BGG username</label><div class="inline"><input id="bgg-username" name="username" autocomplete="off" maxlength="100" placeholder="killjoy00" required><button class="primary" type="submit">Connect shelf</button></div><p class="error" id="connect-error" role="alert"></p></form></section>

<section class="shelfbar" id="sync-panel" hidden><div class="shelf-main"><span class="status-dot" aria-hidden="true"></span><div><strong id="account-title">Your BGG shelf</strong><p id="shelf-summary">Collection connected</p></div></div><div class="shelf-actions"><span id="last-sync"></span><button class="secondary" id="sync-button" type="button">Refresh BGG</button><button class="text-button" id="change-user" type="button">Change username</button></div><div class="progress-wrap" id="progress-wrap" hidden><div class="progress-head"><strong id="progress-label">Preparing…</strong><span id="progress-count"></span></div><div class="progress"><i id="progress-bar"></i></div><small>You can leave this page while the collection finishes syncing.</small></div><p class="error" id="sync-error" role="alert"></p></section>

<section class="picker-card" id="picker-panel" hidden><header class="picker-header"><div><h2>Set the table</h2><p>Players, complexity, style, and time. Nothing else is required.</p></div><span id="picker-count" class="picker-count"></span></header><div class="notice" id="picker-notice" hidden></div>
<form id="picker-form">
<div class="control-grid">
<fieldset class="control players-control"><legend>Players</legend><div class="segments players" id="players"><button type="button" data-players="2">2</button><button type="button" data-players="3">3</button><button type="button" data-players="4" class="selected">4</button><button type="button" data-players="5">5</button><button type="button" data-players="6">6</button><button type="button" data-players="7">7</button><button type="button" data-players="8" data-band="8+">8+</button></div></fieldset>
<fieldset class="control"><legend>Complexity</legend><div class="segments weights" id="weights"><button type="button" data-min="0" data-max="2">Light</button><button type="button" data-min="2" data-max="3.25" class="selected">Medium</button><button type="button" data-min="3.25" data-max="5">Heavy</button><button type="button" data-min="0" data-max="5">Any</button></div></fieldset>
<fieldset class="control"><legend>Table style</legend><div class="segments modes" id="modes"><button type="button" data-mode="any" class="selected">Either</button><button type="button" data-mode="competitive">Competitive</button><button type="button" data-mode="cooperative">Cooperative</button></div></fieldset>
<div class="control time-control"><label class="control-title" for="time">Time available <output id="time-output">90 min</output></label><input id="time" type="range" min="30" max="300" step="15" value="90"><div class="range-labels"><span>30 min</span><span>5 hours</span></div></div>
</div>
<div class="form-footer"><label class="check"><input id="include-trade" type="checkbox"><span>Include games marked for trade</span></label><button class="primary find" type="submit">Pick five games</button></div>
</form><p class="error" id="picker-error" role="alert"></p>

<section class="results" id="results" hidden><div class="results-head"><div><p class="section-label">Shortlist</p><h2 id="results-title">Five games for this table</h2><p id="results-summary"></p></div><button class="secondary" id="rerun" type="button">Adjust table</button></div><div id="result-list"></div><div class="relax" id="relaxations" hidden><strong>Not enough choices?</strong><ul id="relax-list"></ul></div><p class="method">The ranking uses the BGG recommendation poll for the selected player count, penalizes “Not Recommended” votes, and discounts very small samples. Your time, complexity, style, and ownership filters are never silently relaxed.</p></section>
</section>
</main>
<footer><div><strong>${escapeHtml(user.email)}</strong><p>Independent, non-commercial, and not affiliated with BoardGameGeek.</p><a href="/app/library">Library tools</a></div><a class="bgg-credit" href="https://boardgamegeek.com/" target="_blank" rel="noopener noreferrer"><img src="${POWERED_BY_BGG_LOGO}" alt="Powered by BoardGameGeek"></a></footer>
<script>${clientScript}</script></body></html>`;
}

const clientScript = `(()=>{
const $=id=>document.getElementById(id),state={account:null,latestRun:null,status:null,syncing:false,players:4,playerBand:'4',minWeight:2,maxWeight:3.25,mode:'any'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,options={}){const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let data={};try{data=await response.json()}catch{}if(!response.ok){const error=new Error(data.error||('Request failed ('+response.status+')'));error.status=response.status;error.data=data;throw error}return data}
function text(id,value){$(id).textContent=value||''}
function show(id,visible){$(id).hidden=!visible}
function date(value){return value?new Date(value).toLocaleString():''}
async function load(){try{const[a,s]=await Promise.all([request('/api/bgg/account'),request('/api/picker/status')]);state.account=a.account;state.latestRun=a.latestRun;state.status=s;render()}catch(error){text('sync-error',error.message)}}
function render(){
  const connected=!!state.account;show('connect-panel',!connected);show('sync-panel',connected);
  if(!connected){show('picker-panel',false);return}
  text('account-title','@'+state.account.username);
  const owned=Number(state.status&&state.status.owned)||0,enriched=Number(state.status&&state.status.enriched)||0;
  text('shelf-summary',owned?owned+' owned game'+(owned===1?'':'s')+' · '+enriched+' with BGG detail':'Collection connected');
  text('picker-count',owned?owned+' games on shelf':'');
  const run=state.latestRun,full=!!state.account.lastFullSyncAt,partial=run&&run.status==='partial'&&Number(run.enrichedItems)>0,ready=full||partial;
  text('last-sync',state.account.lastFullSyncAt?'Synced '+date(state.account.lastFullSyncAt):'Not fully synced yet');
  $('sync-button').textContent=run&&run.status==='running'?'Continue sync':full?'Refresh BGG':'Sync collection';
  if(run){show('progress-wrap',true);progress(run)}else show('progress-wrap',false);
  show('picker-panel',ready);
  if(ready&&run&&run.status==='running'){show('picker-notice',true);text('picker-notice','A refresh is still running. Picks use the BGG data already saved for your shelf.')}else if(partial){show('picker-notice',true);text('picker-notice','The last sync finished with some missing BGG detail. Picks use the games that synced successfully.')}else show('picker-notice',false)
}
function progress(run){const total=Number(run.totalItems)||0,done=Number(run.enrichedItems)||0,failed=Number(run.failedItems)||0,pct=total?Math.min(100,Math.round((done+failed)/total*100)):0;text('progress-label',run.status==='running'?'Syncing BGG data':run.status==='complete'?'Collection ready':run.status==='partial'?'Sync finished with gaps':'Sync '+run.status);text('progress-count',done+' / '+total+(failed?' · '+failed+' failed':''));$('progress-bar').style.width=pct+'%'}
async function connect(event){event.preventDefault();text('connect-error','');const username=$('bgg-username').value.trim();try{const data=await request('/api/bgg/account',{method:'POST',body:JSON.stringify({username})});state.account=data.account;state.latestRun=null;render();await startSync()}catch(error){text('connect-error',error.message)}}
async function startSync(){if(state.syncing)return;state.syncing=true;$('sync-button').disabled=true;text('sync-error','');try{let payload;try{payload=await request('/api/bgg/sync/start',{method:'POST',body:'{}'})}catch(error){if(error.status===409&&error.data&&error.data.run)payload={run:error.data.run,nextRequestAfterMs:0};else if(error.status===429){await sleep(Number(error.data.retryAfterMs)||5000);state.syncing=false;$('sync-button').disabled=false;return startSync()}else throw error}state.latestRun=payload.run;render();await continueSync(payload.run,Number(payload.nextRequestAfterMs)||0);await load()}catch(error){text('sync-error',error.message)}finally{state.syncing=false;$('sync-button').disabled=false}}
async function continueSync(run,waitMs){let current=run,next=waitMs;while(current&&current.status==='running'){if(next>0)await sleep(next);let payload;try{payload=await request('/api/bgg/sync/'+encodeURIComponent(current.id)+'/enrich',{method:'POST',body:'{}'})}catch(error){if(error.status===429){next=Number(error.data.retryAfterMs)||5000;continue}throw error}current=payload.run;next=Number(payload.nextRequestAfterMs)||0;state.latestRun=current;progress(current)}return current}
function changeUser(){state.account=null;state.latestRun=null;render();$('bgg-username').focus()}
function selectButtons(container,button){container.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===button))}
$('players').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;state.players=Number(button.dataset.players);state.playerBand=button.dataset.band||String(state.players);selectButtons($('players'),button)});
$('weights').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;state.minWeight=Number(button.dataset.min);state.maxWeight=Number(button.dataset.max);selectButtons($('weights'),button)});
$('modes').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;state.mode=button.dataset.mode||'any';selectButtons($('modes'),button)});
$('time').addEventListener('input',()=>text('time-output',$('time').value+' min'));
async function pick(event){event.preventDefault();text('picker-error','');show('results',false);const submit=$('picker-form').querySelector('button[type=submit]');submit.disabled=true;submit.textContent='Ranking shelf…';try{const data=await request('/api/picker/recommend',{method:'POST',body:JSON.stringify({players:state.players,playerBand:state.playerBand,minutes:Number($('time').value),minWeight:state.minWeight,maxWeight:state.maxWeight,mode:state.mode,includeForTrade:$('include-trade').checked})});renderResults(data)}catch(error){text('picker-error',error.message)}finally{submit.disabled=false;submit.textContent='Pick five games'}}
function node(tag,className,content){const n=document.createElement(tag);if(className)n.className=className;if(content!==undefined)n.textContent=String(content);return n}
function weightLabel(weight){const n=Number(weight);if(n<2)return'Light';if(n<3.25)return'Medium';return'Heavy'}
function renderResults(data){
  const list=$('result-list');list.replaceChildren();const results=data.results||[],query=data.query||{};
  text('results-title',results.length===5?'Five games for this table':results.length+' qualifying game'+(results.length===1?'':'s'));
  const modeLabel=query.mode==='cooperative'?'cooperative':query.mode==='competitive'?'competitive':'any style';
  text('results-summary',(query.playerBand||query.players)+' players · '+query.minutes+' min · '+modeLabel);
  results.forEach((game,index)=>{
    const card=node('article','game'+(index===0?' top-pick':''));
    const rank=node('div','rank','#'+(index+1));
    const body=node('div','game-body');
    const titleRow=node('div','game-title');
    const titleBlock=node('div','title-block');
    const title=node('h3','',game.name);
    const sub=node('div','game-sub');
    sub.append(node('span','',game.minutes+' min'),node('span','',weightLabel(game.weight)+' '+Number(game.weight).toFixed(2)));
    if(game.cooperative)sub.append(node('span','','Cooperative'));
    titleBlock.append(title,sub);
    const score=node('div','positive-stat');score.append(node('strong','',game.positivePercent+'%'),node('span','','positive'));
    titleRow.append(titleBlock,score);body.append(titleRow);
    if(game.sourceName)body.append(node('p','source-name','On your shelf as “'+game.sourceName+'”'));
    const meter=node('div','meter');const fill=node('i','');fill.style.width=game.positivePercent+'%';meter.append(fill);body.append(meter);
    const evidence=node('div','evidence');evidence.append(node('span','',game.bestPercent+'% best'),node('span','',(game.positivePercent-game.bestPercent)+'% recommended'),node('span','',game.notRecommendedPercent+'% not recommended'),node('span','',game.votes+' votes'));body.append(evidence);
    body.append(node('p','reason',game.reason));
    if(game.warning)body.append(node('p','warning',game.warning));
    const link=node('a','bgg-link','View on BGG ↗');link.href='https://boardgamegeek.com/boardgame/'+Number(game.id);link.target='_blank';link.rel='noopener noreferrer';body.append(link);
    card.append(rank,body);list.append(card)
  });
  const relax=data.relaxations||[];show('relaxations',relax.length>0);const ul=$('relax-list');ul.replaceChildren();relax.forEach(value=>ul.append(node('li','',value)));show('results',true);$('results').scrollIntoView({behavior:'smooth',block:'start'})
}
$('connect-form').addEventListener('submit',connect);$('sync-button').addEventListener('click',startSync);$('change-user').addEventListener('click',changeUser);$('picker-form').addEventListener('submit',pick);$('rerun').addEventListener('click',()=>{$('picker-form').scrollIntoView({behavior:'smooth',block:'start'})});load()
})();`;

const styles = `
:root{--bg:#f3f1eb;--surface:#fdfcf8;--ink:#20231f;--muted:#6b6f68;--line:#d7d5ce;--line-strong:#bebcb5;--accent:#315744;--accent-soft:#e5ece7;--danger:#984b39;--focus:#8ba99a}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5}
button,input{font:inherit}
button,a{transition:background-color .15s ease,border-color .15s ease,color .15s ease,opacity .15s ease}
button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid color-mix(in srgb,var(--focus) 55%,transparent);outline-offset:2px}
[hidden]{display:none!important}
.topbar{border-bottom:1px solid var(--line);background:var(--surface)}
.topbar-inner{max-width:1120px;margin:0 auto;min-height:62px;padding:0 20px;display:flex;align-items:center;gap:28px}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);white-space:nowrap}
.brand strong{font-size:16px;letter-spacing:-.02em}.brand strong span{color:var(--accent)}
.die{display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--ink);border-radius:5px;font:8px/7px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:2px}
.topbar nav{display:flex;align-items:center;gap:22px;flex:1}
.topbar nav a,.quiet{color:var(--muted);text-decoration:none;background:none;border:0;padding:20px 0 17px;cursor:pointer;border-bottom:2px solid transparent}
.topbar nav a:hover,.quiet:hover{color:var(--ink)}.topbar nav a.active{color:var(--ink);border-bottom-color:var(--ink)}
.shell{max-width:1120px;margin:0 auto;padding:44px 20px 64px}
.intro{max-width:720px;margin-bottom:30px}.section-label{margin:0 0 5px;color:var(--accent);font-size:13px;font-weight:700}.intro h1{margin:0;font-size:38px;line-height:1.08;letter-spacing:-.045em;font-weight:650}.intro>p:last-child{margin:12px 0 0;color:var(--muted);font-size:16px;max-width:680px}
h2,h3{letter-spacing:-.025em}
.onboard{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:end;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:28px;margin-top:28px}
.onboard h2{margin:0;font-size:24px}.muted{margin:8px 0 0;color:var(--muted)}
label{font-weight:650}.inline{display:flex;gap:8px;margin-top:7px}
#bgg-username{width:100%;min-width:0;border:1px solid var(--line-strong);background:white;color:var(--ink);border-radius:7px;padding:11px 12px}
.primary,.secondary,.text-button{border-radius:7px;padding:10px 14px;font-weight:650;cursor:pointer}
.primary{background:var(--accent);color:white;border:1px solid var(--accent)}.primary:hover{background:#274938}.primary:disabled{opacity:.55;cursor:wait}
.secondary{background:transparent;color:var(--ink);border:1px solid var(--line-strong)}.secondary:hover{background:#f0eee8}
.text-button{background:none;border:1px solid transparent;color:var(--muted);padding-left:8px;padding-right:8px}.text-button:hover{color:var(--ink)}
.error{color:var(--danger);font-size:13px;margin:9px 0 0}
.shelfbar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:15px 2px;margin:20px 0 28px}
.shelf-main{display:flex;align-items:center;gap:10px}.status-dot{width:8px;height:8px;background:var(--accent);border-radius:50%;flex:0 0 auto}.shelf-main strong{display:block}.shelf-main p{margin:1px 0 0;color:var(--muted);font-size:12px}
.shelf-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}.shelf-actions>span{font-size:12px;color:var(--muted)}
.progress-wrap{position:absolute;left:0;right:0;top:100%;background:var(--surface);border:1px solid var(--line);border-top:0;padding:12px 14px;z-index:2}.progress-head{display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px}.progress{height:4px;background:#e5e3dc;overflow:hidden}.progress i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s ease}.progress-wrap small{display:block;margin-top:7px;color:var(--muted)}
.picker-card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:26px}
.picker-header{display:flex;align-items:start;justify-content:space-between;gap:20px;padding-bottom:20px;border-bottom:1px solid var(--line)}.picker-header h2{font-size:25px;margin:0}.picker-header p{margin:5px 0 0;color:var(--muted)}.picker-count{font-size:12px;color:var(--muted);white-space:nowrap;padding-top:4px}
.notice{margin:18px 0 0;padding:10px 12px;border-left:3px solid #b28b42;background:#f6f0e3;color:#66583b;font-size:13px}
.control-grid{display:grid;grid-template-columns:1fr 1fr;gap:26px 30px;padding:26px 0 24px}.control{border:0;padding:0;margin:0}.players-control{grid-column:1/-1}.control legend,.control-title{display:flex;justify-content:space-between;width:100%;font-size:13px;font-weight:700;margin:0 0 9px}.control-title output{color:var(--accent);font-weight:700}
.segments{display:grid;gap:6px}.segments.players{grid-template-columns:repeat(7,1fr)}.segments.weights{grid-template-columns:repeat(4,1fr)}.segments.modes{grid-template-columns:repeat(3,1fr)}
.segments button{min-height:40px;border:1px solid var(--line-strong);background:white;color:var(--ink);border-radius:7px;padding:8px 6px;cursor:pointer}.segments button:hover{border-color:#98968f}.segments button.selected{background:var(--ink);border-color:var(--ink);color:white}
.time-control input[type=range]{width:100%;accent-color:var(--accent)}.range-labels{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin-top:3px}
.form-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid var(--line);padding-top:20px}.check{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;font-weight:500}.check input{accent-color:var(--accent)}.find{min-width:180px}
.results{margin-top:34px;padding-top:30px;border-top:1px solid var(--line);scroll-margin-top:24px}.results-head{display:flex;align-items:start;justify-content:space-between;gap:20px;margin-bottom:16px}.results-head h2{font-size:25px;margin:0}.results-head p:not(.section-label){margin:5px 0 0;color:var(--muted);font-size:13px}
#result-list{display:grid;gap:10px}.game{display:grid;grid-template-columns:46px minmax(0,1fr);gap:10px;background:white;border:1px solid var(--line);border-radius:9px;padding:18px 18px 17px}.game.top-pick{border-color:#9caa9f}.rank{font-size:13px;color:var(--muted);padding-top:4px}.game-title{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.title-block{min-width:0}.game h3{font-size:20px;margin:0;line-height:1.2}.game-sub{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;color:var(--muted);font-size:12px}.game-sub span+span:before{content:"·";margin-right:7px;color:#aaa79f}.positive-stat{text-align:right;min-width:72px}.positive-stat strong{display:block;font-size:20px;line-height:1;color:var(--accent)}.positive-stat span{font-size:10px;color:var(--muted)}
.source-name{margin:7px 0 0;color:var(--muted);font-size:11px}.meter{height:5px;background:#eceae4;overflow:hidden;margin:14px 0 7px}.meter i{display:block;height:100%;background:var(--accent)}.evidence{display:flex;gap:6px 14px;flex-wrap:wrap;color:var(--muted);font-size:11px}.reason{margin:10px 0 0;font-size:12px}.warning{margin:6px 0 0;color:var(--danger);font-size:12px;font-weight:650}.bgg-link{display:inline-block;margin-top:10px;color:var(--accent);font-size:12px;font-weight:650;text-decoration:none}.bgg-link:hover{text-decoration:underline}
.relax{margin-top:16px;border:1px solid var(--line);background:#f5f3ed;padding:14px 16px;font-size:13px}.relax ul{margin:6px 0 0;padding-left:19px}.method{max-width:760px;margin:18px 0 0;color:var(--muted);font-size:11px;line-height:1.55}
footer{max-width:1120px;margin:0 auto;border-top:1px solid var(--line);padding:25px 20px 42px;display:flex;justify-content:space-between;gap:24px;align-items:center;color:var(--muted);font-size:11px}footer strong{color:var(--ink)}footer p{margin:3px 0}footer a{color:var(--muted)}.bgg-credit img{display:block;width:155px;height:auto;max-width:38vw}
@media(max-width:760px){.topbar-inner{padding:0 14px;gap:16px}.brand strong{display:none}.topbar nav{gap:15px;overflow:auto}.topbar nav a,.quiet{font-size:12px}.topbar form{display:none}.shell{padding:30px 14px 46px}.intro h1{font-size:32px}.onboard{grid-template-columns:1fr;gap:22px;padding:20px}.shelfbar{align-items:flex-start;flex-direction:column}.shelf-actions{justify-content:flex-start}.progress-wrap{position:static;width:100%;border:0;border-top:1px solid var(--line);padding:12px 0 0}.picker-card{padding:20px}.picker-header{flex-direction:column;gap:6px}.control-grid{grid-template-columns:1fr;gap:22px}.players-control{grid-column:auto}.segments.players{grid-template-columns:repeat(4,1fr)}.form-footer{align-items:stretch;flex-direction:column}.find{width:100%}.results-head{align-items:flex-start}.game{grid-template-columns:35px minmax(0,1fr);padding:15px 13px}.game-title{gap:10px}.game h3{font-size:18px}.positive-stat{min-width:58px}.positive-stat strong{font-size:18px}footer{margin:0 14px;padding-left:0;padding-right:0;align-items:flex-start;flex-direction:column}.inline{flex-direction:column}}
@media(max-width:430px){.topbar nav a[href="/app/account"]{display:none}.segments.players{grid-template-columns:repeat(4,1fr)}.segments.weights{grid-template-columns:repeat(2,1fr)}.segments.modes{grid-template-columns:1fr}.results-head{flex-direction:column}.results-head .secondary{width:100%}.evidence{gap:5px 10px}}
`;
