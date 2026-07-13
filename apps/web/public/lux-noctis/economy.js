(()=>{
'use strict';

const core=window.__LUX_CORE__,app=window.__LUX_NOCTIS__;
if(!core||!app)return;
const {$,$$,clamp,fmt,formatL,dateKey,escapeHtml,ProfileStore,CasinoApp}=core;
const VERSION=3;
const NET_RESERVE_RATE=.15;
const NET_VAULT_RATE=.10;
const SINK_RECYCLE=.25;
const RESERVE_CAP=10000;
const CAPPED_SOURCES=new Set(['bonus','daily','mission','weekly','mystery','season','album','raid','pvp','party','event','collection','odyssey','circuit','chest']);
const EXEMPT_SOURCES=new Set(['table','vault','relief','refund','migration','treasury-refund']);
const SOURCE_LABELS={daily:'MIDNIGHT GIFT',mission:'DAILY ORDER',weekly:'WEEKLY CONTRACT',mystery:'MYSTERY DOOR',season:'PALACE PASS',album:'ALBUM',raid:'PALACE RAID',pvp:'CROWN DUEL',party:'PARTY CROWN',event:'PALACE EVENT',collection:'COLLECTION',odyssey:'ODYSSEY',circuit:'CROWN CIRCUIT',chest:'SOVEREIGN CHEST',vault:'ECLIPSE VAULT',relief:'RELIEF',treasury:'TREASURY EXCHANGE'};

const blankFlow=()=>({wager:0,tableReturn:0,houseMargin:0,reserveFunded:0,vaultFunded:0,bonusRequested:0,bonusPaid:0,converted:0,vaultPaid:0,reliefPaid:0,sinkOut:0,sinkBurned:0,sinkRecycled:0,rounds:0});
const freshData=profile=>({
  version:VERSION,
  migratedAt:Date.now(),
  reserve:3000,
  reserveFraction:0,
  houseReserveAllocated:0,
  houseVaultAllocated:0,
  reserveCap:RESERVE_CAP,
  notes:0,
  noteRemainder:0,
  reliefUsed:!!profile.lastRelief,
  seals:0,
  purchases:{stardust:0,capsule:0,key:0,seal:0},
  legacy:{balance:Math.max(0,Math.floor(profile.balance||0)),wager:Math.max(0,Math.floor(profile.stats?.wagered||0)),returned:Math.max(0,Math.floor(profile.stats?.returned||0))},
  lifetime:blankFlow(),
  since:blankFlow(),
  daily:{date:dateKey(),...blankFlow()},
  ledger:[]
});
const mergeFlow=(saved={})=>({...blankFlow(),...saved});

class TreasuryEconomy{
  constructor(casino){
    this.app=casino;
    this.tab='overview';
    this.conversionPending={amount:0,notes:0};
    this.conversionTimer=0;
    this.ensureData();
    this.app.economy=this;
    this.patchCore();
    this.injectUi();
    this.applySealVisual();
    this.updateAll();
    this.app.updateDaily();
    this.app.updateTicker();
    window.__LUX_ECONOMY__=this;
  }
  get data(){return this.app.profile.data.economy}
  ensureData(){
    const p=this.app.profile.data,base=freshData(p),saved=p.economy||{};
    if(!saved.version){
      p.economy=base;
      const oldPot=Math.max(0,Math.floor(p.jackpot?.pot||0));
      if(oldPot>25000){const excess=oldPot-25000;p.jackpot.pot=25000;p.economy.notes+=Math.floor(excess/1000);p.economy.legacy.jackpotNormalized=excess;p.economy.ledger.unshift({id:`migration-${Date.now()}`,time:Date.now(),kind:'migration',amount:excess,label:`LEGACY VAULT NORMALIZED · +${Math.floor(excess/1000)} NOTES`,direction:'convert'})}
    }else{
      p.economy={...base,...saved,version:VERSION,reserveCap:RESERVE_CAP,purchases:{...base.purchases,...(saved.purchases||{})},legacy:{...base.legacy,...(saved.legacy||{})},lifetime:mergeFlow(saved.lifetime),since:mergeFlow(saved.since),daily:{date:saved.daily?.date||dateKey(),...mergeFlow(saved.daily)},ledger:Array.isArray(saved.ledger)?saved.ledger.slice(0,60):[]};
    }
    this.ensureDay();
    this.app.profile.save();
  }
  ensureDay(){
    const d=this.data,today=dateKey();
    if(d.daily.date===today)return false;
    d.daily={date:today,...blankFlow()};
    this.addLedger('period',0,`DAILY LEDGER RESET · ${today}`,'in');
    this.app.profile.save();
    return true;
  }
  addLedger(kind,amount,label,direction='in',meta={}){
    const d=this.data;d.ledger.unshift({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,time:Date.now(),kind,amount:Math.max(0,Math.floor(amount||0)),label:String(label||kind),direction,...meta});d.ledger=d.ledger.slice(0,60)
  }
  isCapped(source){return CAPPED_SOURCES.has(source)||(!EXEMPT_SOURCES.has(source)&&source!=='table')}
  settleCredit(requested,source='bonus'){
    requested=Math.max(0,Math.floor(requested));this.ensureDay();
    if(!requested)return{coins:0,notes:0,requested:0};
    if(!this.isCapped(source))return{coins:requested,notes:0,requested};
    const d=this.data,available=Math.max(0,Math.floor(d.reserve||0)),coins=Math.min(requested,available),remainder=requested-coins;
    d.reserve=Math.max(0,Number(d.reserve||0)-coins);
    d.noteRemainder=Number(d.noteRemainder||0)+remainder;
    const notes=Math.floor(d.noteRemainder/100);d.noteRemainder-=notes*100;d.notes=Math.max(0,Math.floor(d.notes||0)+notes);
    for(const flow of [d.lifetime,d.since,d.daily]){flow.bonusRequested+=requested;flow.bonusPaid+=coins;flow.converted+=remainder}
    this.addLedger('reward',coins,`${SOURCE_LABELS[source]||String(source).toUpperCase()} · ${requested} L REQUEST`,coins?'in':'convert',{requested,remainder,notes,source});
    if(remainder>0)this.queueConversion(remainder,notes);
    return{coins,notes,requested,converted:remainder}
  }
  queueConversion(amount,notes){
    this.conversionPending.amount+=amount;this.conversionPending.notes+=notes;clearTimeout(this.conversionTimer);
    this.conversionTimer=setTimeout(()=>{const p=this.conversionPending;this.conversionPending={amount:0,notes:0};if(!p.amount)return;this.app.toast('TREASURY SAFEGUARD',`${fmt.format(p.amount)} L分を${fmt.format(p.notes)} CROWN NOTESへ変換しました。Lの無制限発行を防ぐ収集通貨です。`,'▣');this.updateAll()},80)
  }
  recordCredit(amount,source='bonus',meta={}){
    amount=Math.max(0,Math.floor(amount));this.ensureDay();const d=this.data;
    if(source==='vault'){for(const flow of [d.lifetime,d.since,d.daily])flow.vaultPaid+=amount;this.addLedger('vault',amount,'ECLIPSE VAULT · FUNDED RETURN','in')}
    if(source==='relief'){for(const flow of [d.lifetime,d.since,d.daily])flow.reliefPaid+=amount;this.addLedger('relief',amount,'LOW-BALANCE RELIEF','in')}
    this.lastCredit={amount,source,requested:meta.requested??amount,notes:meta.notes||0,converted:meta.converted||0,time:Date.now()}
  }
  recordDebit(amount,source='wager'){
    amount=Math.max(0,Math.floor(amount));if(!amount)return;this.ensureDay();const d=this.data;
    if(source==='wager')return;
    if(source==='treasury'){
      const recycled=Math.floor(amount*SINK_RECYCLE),burned=amount-recycled,before=Math.max(0,Number(d.reserve||0)),accepted=Math.min(recycled,Math.max(0,RESERVE_CAP-before));
      for(const flow of [d.lifetime,d.since,d.daily]){flow.sinkOut+=amount;flow.sinkBurned+=burned;flow.sinkRecycled+=accepted}
      d.reserve=before+accepted;
      this.addLedger('sink',amount,`TREASURY EXCHANGE · ${burned} L BURNED · ${accepted} L RECYCLED`,'out',{recycled:accepted,burned})
    }
  }
  recordRound(payload={}){
    this.ensureDay();
    const d=this.data,wager=Math.max(0,Math.floor(payload.wager||0)),payout=Math.max(0,Math.floor(payload.payout||0)),delta=wager-payout;
    for(const flow of [d.lifetime,d.since,d.daily]){flow.wager+=wager;flow.tableReturn+=payout;flow.houseMargin+=delta;flow.rounds++}
    const netMargin=Math.max(0,d.lifetime.wager-d.lifetime.tableReturn),j=this.app.profile.data.jackpot;
    const targetReserve=Math.floor(netMargin*NET_RESERVE_RATE),targetVault=Math.floor(netMargin*NET_VAULT_RATE);
    const reserveDue=Math.max(0,targetReserve-Math.max(0,Number(d.houseReserveAllocated||0))),vaultDue=Math.max(0,targetVault-Math.max(0,Number(d.houseVaultAllocated||0)));
    const reserveAccepted=Math.min(reserveDue,Math.max(0,RESERVE_CAP-Number(d.reserve||0))),vaultAccepted=Math.min(vaultDue,Math.max(0,25000-Number(j.pot||0)));
    if(reserveAccepted>0){d.reserve=Math.min(RESERVE_CAP,Number(d.reserve||0)+reserveAccepted);d.houseReserveAllocated=Number(d.houseReserveAllocated||0)+reserveAccepted;for(const flow of [d.lifetime,d.since,d.daily])flow.reserveFunded+=reserveAccepted;this.addLedger('reserve',reserveAccepted,`${this.app.gameMeta(payload.game)?.short||payload.game} · NET MARGIN RECYCLE`,'in',{game:payload.game,netMargin})}
    if(vaultAccepted>0){const wasReady=!!j.ready;j.pot=Math.min(25000,Number(j.pot||0)+vaultAccepted);d.houseVaultAllocated=Number(d.houseVaultAllocated||0)+vaultAccepted;for(const flow of [d.lifetime,d.since,d.daily])flow.vaultFunded+=vaultAccepted;this.addLedger('vault-fund',vaultAccepted,'ECLIPSE VAULT · NET MARGIN RECYCLE','in',{game:payload.game,netMargin});j.ready=j.charge>=100&&j.pot>=100;if(j.ready&&!wasReady){this.app.toast('ECLIPSE VAULT 解放','宮殿側の累積純利益から既存Lを再循環した星蝕金庫を開けられます。','◇');this.app.audio.play('bigwin')}}
    if(wager>0)this.addLedger('round',Math.abs(delta),`${this.app.gameMeta(payload.game)?.short||payload.game} · ${delta<=0?'+':'−'}${fmt.format(Math.abs(delta))} NET`,delta<=0?'in':'out',{game:payload.game,wager,payout,delta,netMargin});
    this.app.profile.save();this.updateAll()
  }
  previewCredit(requested){
    requested=Math.max(0,Math.floor(requested));const coins=Math.min(requested,Math.max(0,Math.floor(this.data.reserve||0))),pending=Number(this.data.noteRemainder||0)+(requested-coins);return{requested,coins,converted:requested-coins,notes:Math.floor(pending/100)-Math.floor((this.data.noteRemainder||0)/100)}
  }
  rtp(flow=this.data.since){return flow.wager>0?flow.tableReturn/flow.wager:0}
  effectiveRtp(flow=this.data.since){return flow.wager>0?(flow.tableReturn+flow.bonusPaid+flow.vaultPaid+flow.reliefPaid)/flow.wager:0}
  status(){const f=this.data.since;if(f.wager<5000)return{id:'calibrating',label:'CALIBRATING',jp:'集計中',desc:'改革後5,000 L以上のプレイで安定度を判定します。'};const r=this.effectiveRtp(f);if(r<=1)return{id:'stable',label:'STABLE',jp:'安定',desc:'改革後の総流出が賭け金総額以内に収まっています。'};if(r<=1.03)return{id:'watch',label:'VARIANCE',jp:'短期上振れ',desc:'短期的な勝ち越しです。固定報酬は準備金で制御されています。'};return{id:'hot',label:'HOT STREAK',jp:'大幅上振れ',desc:'強い短期上振れです。報酬発行上限は維持されています。'} }
  rewardReserveLabel(){return`${fmt.format(Math.floor(this.data.reserve))} L`}
  applySealVisual(){const n=Math.max(0,Math.floor(this.data.seals||0));$('#app').dataset.treasurySeal=String(n);const b=$('#treasurySealCount');if(b)b.textContent=String(n)}
  injectUi(){
    document.title='LUX NOCTIS TREASURY REFORM — Stable Economy & Live PvP';
    const brand=$('.brand-text small');if(brand)brand.textContent='TREASURY REFORM · SOCIAL CASINO';
    const introEye=$('.intro-copy .eyebrow');if(introEye)introEye.textContent='TREASURY REFORM 6.0 · 23 TABLES · 5 LIVE PVP MODES';
    const introLead=$('.intro-copy .intro-lead');if(introLead)introLead.innerHTML='23のゲーム、120の蒐集品、115 TABLE STARS、36メダル、日替わりCROWN CIRCUIT。<br />配当監査・準備金・通貨交換所を備えた、長く遊べる深夜のソーシャル宮殿。';
    const hero=$('.hero-copy > p:not(.eyebrow)');if(hero)hero.textContent='勝敗はすべてプレイコインだけ。財務局が宮殿側の累積純利益と通貨消費だけを再循環し、遊び続けてもLが無限増殖しない宮殿へ。';
    const gameCount=$('.games-section .section-heading > span');if(gameCount)gameCount.textContent='23 GAMES · STABLE ECONOMY · 5 LIVE PVP MODES';
    const daily=$('#dailyButton');if(daily&&!$('#treasuryButton'))daily.insertAdjacentHTML('beforebegin',`<button id="treasuryButton" class="treasury-top-button" type="button" title="王宮財務局"><span>▣</span><i><small>TREASURY</small><b id="treasuryTopReserve">3,000 L</b></i></button>`);
    const anchor=$('#sovereignRibbon')||$('#nightEventBar');if(anchor&&!$('#treasuryRibbon'))anchor.insertAdjacentHTML('afterend',`<section id="treasuryRibbon" class="treasury-ribbon"><button type="button" data-open-treasury><span class="treasury-ribbon-sigil">▣</span><span><small>TREASURY REFORM 6.0</small><b>安定通貨システム稼働中</b><em>既存残高を維持し、今後の報酬発行だけを制御</em></span><i><small>REWARD RESERVE</small><strong id="treasuryRibbonReserve">3,000 L</strong></i><i><small>CROWN NOTES</small><strong id="treasuryRibbonNotes">0</strong></i><i><small>REFORM RTP</small><strong id="treasuryRibbonRtp">—</strong></i></button></section>`);
    const toast=$('#toastStack');if(toast&&!$('#treasuryModal'))toast.insertAdjacentHTML('beforebegin',`<section id="treasuryModal" class="modal palace-modal wide-modal treasury-modal" hidden aria-modal="true" role="dialog"><button id="closeTreasury" class="modal-close" type="button">×</button><div class="treasury-modal-head"><span>▣</span><div><p class="eyebrow">TREASURY REFORM · ECONOMY 6.0</p><h2>王宮財務局</h2><p>プレイコインの無制限発行を止め、勝負・成長・収集を長く楽しめる経済へ。</p></div></div><div class="treasury-tabs"><button data-treasury-tab="overview" class="active" type="button">安定度</button><button data-treasury-tab="exchange" type="button">交換所</button><button data-treasury-tab="ledger" type="button">台帳</button></div><div id="treasuryContent"></div></section>`);
    $('#treasuryButton')?.addEventListener('click',()=>this.open('overview'));$$('[data-open-treasury]').forEach(b=>b.addEventListener('click',()=>this.open('overview')));$('#closeTreasury')?.addEventListener('click',()=>this.app.closeModal());$$('[data-treasury-tab]').forEach(b=>b.addEventListener('click',()=>this.render(b.dataset.treasuryTab)));
  }
  open(tab='overview'){this.render(tab);this.app.openModal('treasuryModal')}
  render(tab=this.tab){this.tab=tab;$$('[data-treasury-tab]').forEach(b=>b.classList.toggle('active',b.dataset.treasuryTab===tab));const mount=$('#treasuryContent');if(!mount)return;if(tab==='overview')this.renderOverview(mount);if(tab==='exchange')this.renderExchange(mount);if(tab==='ledger')this.renderLedger(mount)}
  metric(value,suffix=''){return value?`${fmt.format(Math.floor(value))}${suffix}`:`0${suffix}`}
  renderOverview(mount){
    const d=this.data,s=this.status(),f=d.since,table=f.wager?`${(this.rtp(f)*100).toFixed(2)}%`:'—',effective=f.wager?`${(this.effectiveRtp(f)*100).toFixed(2)}%`:'—';
    mount.innerHTML=`<div class="treasury-status status-${s.id}"><span>▣</span><div><small>ECONOMY STATUS</small><h3>${s.label} · ${s.jp}</h3><p>${s.desc}</p></div><strong>${effective}</strong></div><div class="treasury-metrics"><article><small>改革後の賭け金</small><b>${formatL(f.wager)}</b><span>${f.rounds} ROUNDS</span></article><article><small>卓の実測返却率</small><b>${table}</b><span>短期変動を含む実績値</span></article><article><small>総合流出率</small><b>${effective}</b><span>卓＋報酬＋金庫</span></article><article><small>報酬準備金</small><b>${formatL(Math.floor(d.reserve))}</b><span>上限 ${formatL(RESERVE_CAP)}</span></article><article><small>報酬へ再循環</small><b>${formatL(f.reserveFunded)}</b><span>宮殿側の累積純利益の15%以内</span></article><article><small>金庫へ再循環</small><b>${formatL(f.vaultFunded)}</b><span>宮殿側の累積純利益の10%以内</span></article><article><small>CROWN NOTES</small><b>${fmt.format(d.notes)}</b><span>換金不能の収集通貨</span></article><article><small>焼却済みL</small><b>${formatL(f.sinkBurned)}</b><span>交換所で永久消滅</span></article></div><div class="treasury-policy-grid"><section><p class="eyebrow">MINTING CONTROL</p><h3>Lが増殖しない仕組み</h3><ul><li><b>固定報酬は準備金制</b><span>依頼・イベント・PvPなどは、積立済みLの範囲だけ支給。</span></li><li><b>超過分はCROWN NOTES</b><span>Lへ戻せない収集通貨へ変換し、成長報酬自体は失わせません。</span></li><li><b>プレイヤー側の累積純損失だけを再循環</b><span>宮殿側の改革後累積純利益を基準に、最大15%を報酬準備金、10%を金庫へ。先に出た負けだけを二重計上しません。</span></li><li><b>交換所で通貨を焼却</b><span>使用Lの75%を消滅、25%のみ次の報酬準備金へ循環。</span></li></ul></section><section><p class="eyebrow">AUDITED TABLES</p><h3>修正済みの代表値</h3><div class="treasury-audit-list"><span><b>LUNAR BINGO</b><i>約95% RTP</i><em>旧 約238%</em></span><span><b>MIDNIGHT SCRATCH</b><i>約91% RTP</i><em>旧 約1,200%</em></span><span><b>KENO · 5 SPOT</b><i>約92.0% RTP</i><em>旧 約122.7%</em></span><span><b>SKILL TABLES</b><i>最大0.95×返却</i><em>無限稼ぎを撤廃</em></span></div></section></div><div class="treasury-legacy-note"><span>既存残高</span><b>${formatL(d.legacy.balance)}</b><p>アップデート前に所持していた残高は没収していません。上の数値は改革導入後だけを別集計しています。</p></div>`
  }
  catalog(){const sealCost=Math.floor(50000*Math.pow(1.5,Math.min(8,this.data.seals||0))),sealNotes=150+50*(this.data.seals||0);return[
    {id:'stardust',icon:'✦',name:'STAR DUST CACHE',desc:'能力・収集に使えるSTAR DUST 250',coins:8000,notes:20,reward:'250 STAR DUST'},
    {id:'capsule',icon:'◆',name:'STAR CAPSULE',desc:'七十二運命図鑑のカプセルを1個',coins:15000,notes:40,reward:'CAPSULE ×1'},
    {id:'key',icon:'◇',name:'ETERNAL KEY',desc:'永夜秘宝庫を開く鍵を1本',coins:25000,notes:75,reward:'ETERNAL KEY ×1'},
    {id:'seal',icon:'♛',name:'ROYAL TREASURY SEAL',desc:'プロフィールを飾る累積王庫印。能力差なし',coins:sealCost,notes:sealNotes,reward:`ROYAL SEAL ${this.data.seals+1}`}
  ]}
  renderExchange(mount){
    const d=this.data;mount.innerHTML=`<div class="treasury-wallet-row"><span><small>PLAY COINS</small><b>${formatL(this.app.profile.data.balance)}</b></span><span><small>CROWN NOTES</small><b>${fmt.format(d.notes)}</b></span><span><small>REWARD RESERVE</small><b>${formatL(Math.floor(d.reserve))}</b></span></div><div class="treasury-exchange-intro"><div><p class="eyebrow">CURRENCY SINK</p><h3>王庫交換所</h3><p>Lで交換すると75%が永久消滅し、25%だけが既存通貨として将来の報酬準備金へ戻ります。CROWN NOTESでも同じ収集品を交換できます。</p></div><b>NO POWER SALE<br /><small>購入・換金なし</small></b></div><div class="treasury-shop">${this.catalog().map(item=>`<article><i>${item.icon}</i><div><small>${item.name}</small><h4>${item.reward}</h4><p>${item.desc}</p></div><button data-treasury-buy="${item.id}" data-pay="coins" type="button" ${this.app.profile.data.balance<item.coins?'disabled':''}><b>${formatL(item.coins)}</b><small>PLAY COINS</small></button><button data-treasury-buy="${item.id}" data-pay="notes" type="button" ${d.notes<item.notes?'disabled':''}><b>${fmt.format(item.notes)}</b><small>CROWN NOTES</small></button></article>`).join('')}</div><div class="treasury-purchase-stats">${Object.entries(d.purchases).map(([k,v])=>`<span><small>${k.toUpperCase()}</small><b>${fmt.format(v)}</b></span>`).join('')}</div>`;$$('[data-treasury-buy]',mount).forEach(b=>b.addEventListener('click',()=>this.confirmBuy(b.dataset.treasuryBuy,b.dataset.pay)))
  }
  confirmBuy(id,pay){const item=this.catalog().find(x=>x.id===id);if(!item)return;const cost=pay==='notes'?item.notes:item.coins,unit=pay==='notes'?'CROWN NOTES':'L';this.app.confirm(`${item.reward}へ交換`,`${fmt.format(cost)} ${unit}を使用します。PLAY COINSで支払った場合は75%が通貨流通から消滅します。`,()=>this.buy(id,pay))}
  buy(id,pay){
    const item=this.catalog().find(x=>x.id===id);if(!item)return;let ok=false;
    if(pay==='notes'){if(this.data.notes>=item.notes){this.data.notes-=item.notes;this.addLedger('notes',item.notes,`${item.name} · NOTES`,'out');ok=true}}
    else ok=this.app.profile.spend(item.coins,'treasury');
    if(!ok){this.app.toast('交換できません','通貨が不足しています。','▣');return}
    if(id==='stardust'&&this.app.ascension){this.app.ascension.data.stardust+=250}
    if(id==='capsule'&&this.app.ascension){this.app.ascension.data.capsules+=1}
    if(id==='key'&&this.app.eternal){this.app.eternal.data.keys+=1}
    if(id==='seal'){this.data.seals++;this.applySealVisual()}
    this.data.purchases[id]=(this.data.purchases[id]||0)+1;this.app.profile.save();this.app.ascension?.updateAll?.();this.app.eternal?.updateAll?.();this.app.audio.play('chime');this.app.celebration.burst(.28);this.app.toast('王庫交換 完了',`${item.reward}を獲得しました。`,item.icon);this.updateAll();setTimeout(()=>this.open('exchange'),0)
  }
  renderLedger(mount){
    const rows=this.data.ledger.length?this.data.ledger.map(x=>`<li class="ledger-${escapeHtml(x.direction)}"><i>${x.kind==='round'?'♜':x.kind==='sink'?'−':x.kind==='reward'?'＋':x.kind==='vault'?'◇':'▣'}</i><span><b>${escapeHtml(x.label)}</b><small>${new Date(x.time).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></span><strong>${x.direction==='out'?'−':x.direction==='convert'?'⇢':'＋'}${formatL(x.amount)}</strong></li>`).join(''):`<div class="treasury-empty">改革後の取引はまだありません。</div>`;
    mount.innerHTML=`<div class="treasury-ledger-head"><div><p class="eyebrow">LOCAL ECONOMY LEDGER</p><h3>直近60件</h3></div><span>この端末のプレイヤーデータに保存</span></div><ul class="treasury-ledger">${rows}</ul><div class="treasury-ledger-summary"><span><small>BONUS REQUESTED</small><b>${formatL(this.data.since.bonusRequested)}</b></span><span><small>BONUS PAID IN L</small><b>${formatL(this.data.since.bonusPaid)}</b></span><span><small>CONVERTED</small><b>${formatL(this.data.since.converted)}</b></span><span><small>CURRENCY BURNED</small><b>${formatL(this.data.since.sinkBurned)}</b></span></div>`
  }
  decorateDaily(){
    const ready=this.app.profile.data.lastDaily!==dateKey();if(!ready)return;const requested=this.app.dailyGiftAmount(),p=this.previewCredit(requested),amount=$('#dailyAmount'),desc=$('#dailyDescription');if(amount)amount.textContent=fmt.format(p.coins);if(desc)desc.textContent=p.converted?`申請額 ${fmt.format(requested)} Lのうち${fmt.format(p.coins)} Lを支給し、残りは約${fmt.format(p.notes)} CROWN NOTESになります。`:`財務準備金から${fmt.format(p.coins)} Lを受け取れます。`
  }
  patchCore(){
    const priorRound=CasinoApp.prototype.recordRound;CasinoApp.prototype.recordRound=function(payload){const net=priorRound.call(this,payload);this.economy?.recordRound({...payload,net});return net};
    const priorHud=CasinoApp.prototype.updateHud;CasinoApp.prototype.updateHud=function(){priorHud.call(this);this.economy?.updateAll()};
    const priorDaily=CasinoApp.prototype.updateDaily;CasinoApp.prototype.updateDaily=function(){priorDaily.call(this);this.economy?.decorateDaily()};
    const priorTicker=CasinoApp.prototype.updateTicker;CasinoApp.prototype.updateTicker=function(){priorTicker.call(this);const ticker=$('#liveTicker');if(ticker){const extra=`<span><b>TREASURY REFORM</b> 固定報酬は宮殿側の累積純利益・交換所で積み立てた準備金だけ</span><span><b>ECONOMY AUDIT</b> BINGO・SCRATCH・KENOの過剰配当を修正</span>`;ticker.innerHTML=extra+ticker.innerHTML+extra}};
    const priorReset=ProfileStore.prototype.reset;ProfileStore.prototype.reset=function(name){priorReset.call(this,name);this.data.economy=freshData(this.data);this.save();if(this.app.economy){this.app.economy.ensureData();this.app.economy.applySealVisual();this.app.economy.updateAll()}};
  }
  updateAll(){
    if(!this.app.profile?.data?.economy)return;this.ensureDay();const d=this.data,f=d.since,rtp=f.wager?`${(this.effectiveRtp(f)*100).toFixed(1)}%`:'—';const top=$('#treasuryTopReserve');if(top)top.textContent=this.rewardReserveLabel();const rr=$('#treasuryRibbonReserve');if(rr)rr.textContent=this.rewardReserveLabel();const rn=$('#treasuryRibbonNotes');if(rn)rn.textContent=fmt.format(d.notes);const rp=$('#treasuryRibbonRtp');if(rp)rp.textContent=rtp;this.applySealVisual();if(this.app.activeModal?.id==='treasuryModal')this.render(this.tab)
  }
}

new TreasuryEconomy(app);

})();
