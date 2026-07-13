(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const fmt = new Intl.NumberFormat('ja-JP');
const formatL = n => `${fmt.format(Math.max(0, Math.floor(n)))} L`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const dateKey = (d = new Date()) => {
  try { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit'}).format(d); }
  catch { return d.toISOString().slice(0,10); }
};
const cryptoFloat = () => {
  const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296;
};
const randomInt = max => Math.floor(cryptoFloat() * max);
const choice = arr => arr[randomInt(arr.length)];
const shuffled = arr => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ordinal = n => `${n}`;
const memoryStorage = Object.create(null);
const storage = {
  getItem(key){try{return window.localStorage.getItem(key)}catch{return Object.prototype.hasOwnProperty.call(memoryStorage,key)?memoryStorage[key]:null}},
  setItem(key,value){try{window.localStorage.setItem(key,String(value))}catch{memoryStorage[key]=String(value)}},
  removeItem(key){try{window.localStorage.removeItem(key)}catch{delete memoryStorage[key]}}
};

const ACTIVITY_IDENTITY = (() => {
  const identity = window.LUX_ACTIVITY_USER;
  if (!identity || typeof identity.id !== 'string' || typeof identity.displayName !== 'string') return null;
  const id = identity.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
  const displayName = identity.displayName.trim().slice(0, 18);
  return id && displayName ? {id, displayName} : null;
})();
const PROFILE_STORAGE_KEY = ACTIVITY_IDENTITY ? `lux-noctis-profile-v1-${ACTIVITY_IDENTITY.id}` : 'lux-noctis-profile-v1';
const PLAYER_STORAGE_KEY = ACTIVITY_IDENTITY ? `lux-noctis-player-id-${ACTIVITY_IDENTITY.id}` : 'lux-noctis-player-id';

class AudioEngine {
  constructor(){ this.ctx = null; this.enabled = true; this.master = null; }
  ensure(){
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain(); this.master.gain.value = .18; this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
    return this.ctx;
  }
  tone(freq, duration=.12, type='sine', gain=.18, when=0, slide=0){
    const ctx = this.ensure(); if (!ctx) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + when + duration);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + when + .012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration);
    osc.connect(g); g.connect(this.master); osc.start(ctx.currentTime + when); osc.stop(ctx.currentTime + when + duration + .03);
  }
  noise(duration=.13, gain=.08, when=0){
    const ctx = this.ensure(); if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), data = buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(cryptoFloat()*2-1)*(1-i/data.length);
    const src=ctx.createBufferSource(), g=ctx.createGain(); src.buffer=buffer; g.gain.value=gain; src.connect(g); g.connect(this.master); src.start(ctx.currentTime+when);
  }
  play(name){
    if (!this.enabled) return;
    const patterns = {
      click:()=>{this.tone(420,.05,'triangle',.08);},
      chip:()=>{this.tone(820,.05,'square',.07);this.tone(1180,.05,'triangle',.05,.045);},
      card:()=>{this.noise(.09,.06);this.tone(180,.06,'triangle',.025);},
      deal:()=>{[0,.08,.16].forEach((t,i)=>this.tone(390+i*55,.07,'triangle',.05,t));},
      spin:()=>{for(let i=0;i<11;i++)this.tone(150+i*18,.07,'triangle',.035,i*.055,40);},
      stop:()=>{this.tone(115,.18,'sawtooth',.09,0,-45);this.noise(.12,.04);},
      win:()=>{[523,659,784,1047].forEach((f,i)=>this.tone(f,.26,'triangle',.12,i*.075));},
      bigwin:()=>{[392,523,659,784,1047,1318].forEach((f,i)=>this.tone(f,.5,'triangle',.14,i*.09));},
      lose:()=>{this.tone(220,.3,'sine',.09,0,-100);},
      chime:()=>{[659,988,1318].forEach((f,i)=>this.tone(f,.55,'sine',.1,i*.12));},
      alert:()=>{this.tone(720,.08,'square',.08);this.tone(540,.13,'triangle',.07,.09);},
      hold:()=>{this.tone(900,.09,'triangle',.07);}
    };
    (patterns[name] || patterns.click)();
  }
}

class AmbientRenderer {
  constructor(canvas){
    this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.dpr=1; this.particles=[]; this.low=false; this.last=0;
    this.resize=()=>this.onResize(); window.addEventListener('resize',this.resize,{passive:true}); this.onResize(); this.loop=this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  onResize(){
    this.dpr=Math.min(devicePixelRatio||1,2); this.canvas.width=innerWidth*this.dpr; this.canvas.height=innerHeight*this.dpr; this.canvas.style.width=`${innerWidth}px`;this.canvas.style.height=`${innerHeight}px`;this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    const count=this.low?20:Math.min(90,Math.floor(innerWidth*innerHeight/15000));
    this.particles=Array.from({length:count},()=>({x:cryptoFloat()*innerWidth,y:cryptoFloat()*innerHeight,r:.3+cryptoFloat()*1.4,v:.05+cryptoFloat()*.22,a:.08+cryptoFloat()*.38,h:cryptoFloat()>.7?43:275}));
  }
  setLow(v){this.low=v;this.onResize()}
  loop(t){
    const ctx=this.ctx; ctx.clearRect(0,0,innerWidth,innerHeight);
    const grd=ctx.createRadialGradient(innerWidth*.73,innerHeight*.22,0,innerWidth*.73,innerHeight*.22,Math.max(innerWidth,innerHeight)*.72);grd.addColorStop(0,'rgba(112,56,158,.08)');grd.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grd;ctx.fillRect(0,0,innerWidth,innerHeight);
    if(!this.low){
      for(const p of this.particles){p.y-=p.v*(1+(t-this.last)/20);if(p.y<-5){p.y=innerHeight+5;p.x=cryptoFloat()*innerWidth}ctx.beginPath();ctx.fillStyle=`hsla(${p.h},70%,75%,${p.a})`;ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}
    }
    this.last=t;requestAnimationFrame(this.loop);
  }
}

class CelebrationRenderer {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.bits=[];this.dpr=1;this.running=false;window.addEventListener('resize',()=>this.resize(),{passive:true});this.resize()}
  resize(){this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=innerWidth*this.dpr;this.canvas.height=innerHeight*this.dpr;this.canvas.style.width=`${innerWidth}px`;this.canvas.style.height=`${innerHeight}px`;this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0)}
  burst(power=1){
    const colors=['#ffe38b','#b77bdc','#fff6d0','#58dbe5','#d64d67'];
    for(let i=0;i<Math.floor(90*power);i++)this.bits.push({x:innerWidth*.5+(cryptoFloat()-.5)*120,y:innerHeight*.44,vx:(cryptoFloat()-.5)*15*power,vy:-5-cryptoFloat()*13*power,g:.22+cryptoFloat()*.2,r:2+cryptoFloat()*5,a:1,rot:cryptoFloat()*6.28,vr:(cryptoFloat()-.5)*.3,color:choice(colors)});
    if(!this.running){this.running=true;requestAnimationFrame(()=>this.loop())}
  }
  loop(){
    const ctx=this.ctx;ctx.clearRect(0,0,innerWidth,innerHeight);
    this.bits=this.bits.filter(b=>b.a>.02&&b.y<innerHeight+30);
    for(const b of this.bits){b.x+=b.vx;b.y+=b.vy;b.vy+=b.g;b.vx*=.993;b.rot+=b.vr;b.a-=.007;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot);ctx.globalAlpha=b.a;ctx.fillStyle=b.color;ctx.fillRect(-b.r,-b.r/2,b.r*2,b.r);ctx.restore()}
    if(this.bits.length)requestAnimationFrame(()=>this.loop());else{this.running=false;ctx.clearRect(0,0,innerWidth,innerHeight)}
  }
}

const DEFAULT_PROFILE = () => ({
  version:2,id:ACTIVITY_IDENTITY ? `discord-${ACTIVITY_IDENTITY.id}` : (storage.getItem(PLAYER_STORAGE_KEY)||uid()),name:ACTIVITY_IDENTITY?.displayName||`Guest-${100+randomInt(900)}`,balance:50000,level:1,xp:0,totalXp:0,theme:'nocturne',createdAt:Date.now(),lastDaily:'',dailyStreak:0,lastRelief:0,lastGame:'roulette',
  settings:{sound:true,reducedMotion:false,lowQuality:false,breakReminder:true},
  stats:{rounds:0,wins:0,wagered:0,returned:0,biggestWin:0,blackjacks:0,rouletteStraights:0,rouletteZeros:0,freeSpins:0,slotCascades:0,maxCascade:0,pokerBest:'未プレイ',pokerBestRank:0,baccaratTies:0,sicboWins:0,sicboTriples:0,kenoBest:0,jackpots:0,bestStreak:0},
  streak:{current:0,best:0},
  jackpot:{pot:5000,fraction:0,charge:0,ready:false,claims:0},
  nightEvent:{active:null,remaining:0,nextIn:6},
  missions:{date:'',items:[]},achievements:{},relics:{},
  gameState:{rouletteHistory:[],kenoPicks:[]}
});

const MISSION_POOL = [
  {id:'rounds',icon:'♜',title:'テーブルを5回遊ぶ',event:'round',target:5,reward:600},
  {id:'wins',icon:'✦',title:'3回勝利する',event:'win',target:3,reward:900},
  {id:'wager',icon:'L',title:'合計10,000 Lを賭ける',event:'wager',target:10000,reward:750},
  {id:'blackjack',icon:'♠',title:'BLACKJACKを完成',event:'blackjack',target:1,reward:1200},
  {id:'roulette',icon:'◉',title:'ルーレットの数字を直撃',event:'rouletteStraight',target:1,reward:1400},
  {id:'free',icon:'☾',title:'フリースピンを獲得',event:'freeSpins',target:1,reward:1200},
  {id:'cascade',icon:'✧',title:'スロットで3連鎖する',event:'slotCascade',target:3,reward:1000},
  {id:'poker',icon:'♛',title:'ツーペア以上を作る',event:'pokerGood',target:1,reward:900},
  {id:'baccarat',icon:'♦',title:'バカラを3回遊ぶ',event:'baccaratRound',target:3,reward:650},
  {id:'sicbo',icon:'⚄',title:'SIC BOを3回遊ぶ',event:'sicboRound',target:3,reward:700},
  {id:'keno',icon:'◎',title:'KENOで4個以上一致',event:'kenoFour',target:1,reward:1000}
];
const ACHIEVEMENTS = [
  {id:'firstWin',icon:'✦',name:'宮殿の微笑み',desc:'初めて勝利する'},
  {id:'blackjack',icon:'♠',name:'夜の21',desc:'BLACKJACKを完成する'},
  {id:'rouletteStraight',icon:'◉',name:'ただ一つの星',desc:'ルーレットの数字を直撃する'},
  {id:'freeSpins',icon:'☾',name:'星界金庫の鍵',desc:'フリースピンを獲得する'},
  {id:'cascade',icon:'✧',name:'星の連鎖',desc:'スロットで3連鎖以上を達成する'},
  {id:'pokerFlush',icon:'♛',name:'ロイヤルへの階段',desc:'フラッシュ以上を作る'},
  {id:'sicboTriple',icon:'⚄',name:'三つの黒曜石',desc:'SIC BOでゾロ目を出す'},
  {id:'kenoSix',icon:'◎',name:'六星の予言',desc:'KENOで6個以上一致する'},
  {id:'jackpot',icon:'◇',name:'星蝕を開く者',desc:'ECLIPSE VAULTを開封する'},
  {id:'streakFive',icon:'🔥',name:'止まらない夜',desc:'5連勝を達成する'},
  {id:'highRoller',icon:'L',name:'金色の足跡',desc:'累計100,000 Lをプレイする'},
  {id:'millionaire',icon:'♦',name:'真夜中の百万長者',desc:'残高1,000,000 Lを達成する'},
  {id:'social',icon:'♟',name:'夜会の客人',desc:'リアクションを送る'}
];
const RELICS = [
  {id:'obsidianAce',icon:'♠',name:'黒曜のエース',desc:'BLACKJACKを完成した証'},
  {id:'zeroStar',icon:'0',name:'零番星',desc:'ルーレットの0へ玉を導いた証'},
  {id:'straightComet',icon:'◉',name:'直撃彗星',desc:'数字一点を射抜いた証'},
  {id:'cascadeCore',icon:'✧',name:'連鎖炉心',desc:'スロットで4連鎖以上を起こした証'},
  {id:'velvetKnot',icon:'♦',name:'絹夜の結び目',desc:'バカラのTIEを見届けた証'},
  {id:'royalSeal',icon:'♛',name:'王家の封蝋',desc:'ROYAL FLUSHを完成した証'},
  {id:'tripleObsidian',icon:'⚄',name:'黒曜三面体',desc:'SIC BOのゾロ目を出した証'},
  {id:'oracleLens',icon:'◎',name:'予言者のレンズ',desc:'KENOで6個以上一致した証'},
  {id:'eclipseKey',icon:'◇',name:'星蝕鍵',desc:'ECLIPSE VAULTを開いた証'},
  {id:'flameCrown',icon:'🔥',name:'連勝の火冠',desc:'5連勝を達成した証'},
  {id:'centuryTicket',icon:'100',name:'百夜の招待状',desc:'100ラウンド遊んだ証'},
  {id:'millionStar',icon:'✦',name:'百万星章',desc:'残高1,000,000 Lへ到達した証'}
];
const NIGHT_EVENTS = [
  {id:'stardust',icon:'✦',name:'STARDUST SURGE',jp:'星屑奔流',desc:'獲得XPが2倍になります。',rounds:4},
  {id:'vault',icon:'◇',name:'GILDED VAULT',jp:'黄金金庫',desc:'ECLIPSE VAULTのCHARGE獲得量が2倍になります。',rounds:4},
  {id:'echo',icon:'☾',name:'FORTUNE ECHO',jp:'幸運の残響',desc:'勝利時に純利益の3%を追加ボーナスとして獲得します。',rounds:3},
  {id:'crown',icon:'♛',name:'CROWN FEVER',jp:'王冠熱',desc:'勝利ストリークによるXPボーナスが強化されます。',rounds:4}
];
const RANKS = [
  {level:1,name:'SILVER I',medal:'I'},{level:3,name:'SILVER II',medal:'II'},{level:5,name:'GOLD I',medal:'I'},{level:8,name:'GOLD II',medal:'II'},{level:12,name:'PLATINUM',medal:'P'},{level:18,name:'DIAMOND',medal:'D'},{level:25,name:'MIDNIGHT CROWN',medal:'♛'}
];
const THEMES = [
  {id:'nocturne',name:'NOCTURNE',unlock:1,bg:'#1b0d27',glow:'#8248aa',desc:'紫紺と金の夜宮殿'},
  {id:'aurora',name:'AURORA',unlock:5,bg:'#07202b',glow:'#36b6d4',desc:'極光に包まれた青の間'},
  {id:'crimson',name:'CRIMSON',unlock:10,bg:'#26090f',glow:'#c32c4c',desc:'深紅のベルベットサロン'},
  {id:'celestial',name:'CELESTIAL',unlock:18,bg:'#071633',glow:'#536eea',desc:'星座が巡る天空宮殿'}
];

class ProfileStore {
  constructor(app){this.app=app;this.key=PROFILE_STORAGE_KEY;this.data=this.load();this.applyActivityIdentity();storage.setItem(PLAYER_STORAGE_KEY,this.data.id);this.ensureMissions()}
  load(){
    try{const saved=JSON.parse(storage.getItem(this.key)||'null');if(saved&&[1,2].includes(saved.version)){const merged=this.merge(DEFAULT_PROFILE(),saved);merged.version=2;return merged}}catch{}
    return DEFAULT_PROFILE()
  }
  merge(base,saved){
    const out={...base,...saved};out.settings={...base.settings,...saved.settings};out.stats={...base.stats,...saved.stats};out.achievements={...base.achievements,...saved.achievements};out.relics={...base.relics,...saved.relics};out.gameState={...base.gameState,...saved.gameState};out.streak={...base.streak,...saved.streak};out.jackpot={...base.jackpot,...saved.jackpot};out.nightEvent={...base.nightEvent,...saved.nightEvent};out.missions=saved.missions||base.missions;return out
  }
  save(){storage.setItem(this.key,JSON.stringify(this.data))}
  applyActivityIdentity(){if(!ACTIVITY_IDENTITY)return;this.data.id=`discord-${ACTIVITY_IDENTITY.id}`;this.data.name=ACTIVITY_IDENTITY.displayName;this.save()}
  ensureMissions(){
    const today=dateKey();if(this.data.missions.date===today&&this.data.missions.items?.length===3)return;
    let seed=[...today].reduce((a,c)=>((a*33)^c.charCodeAt(0))>>>0,5381),pool=[...MISSION_POOL],chosen=[];
    while(chosen.length<3&&pool.length){seed=(seed*1664525+1013904223)>>>0;chosen.push(pool.splice(seed%pool.length,1)[0])}
    this.data.missions={date:today,items:chosen.map(x=>({...x,progress:0,claimed:false}))};this.save()
  }
  xpNeed(level=this.data.level){return 500+level*350}
  addXp(amount){
    amount=Math.max(0,Math.floor(amount));if(!amount)return;this.data.xp+=amount;this.data.totalXp+=amount;let levels=0;
    while(this.data.xp>=this.xpNeed()){this.data.xp-=this.xpNeed();this.data.level++;levels++}
    if(levels){this.app.audio.play('chime');this.app.toast('レベルアップ',`Lv.${this.data.level}になりました。宮殿の光が強くなります。`,'♛');this.app.celebration.burst(.7)}this.save()
  }
  rank(){let r=RANKS[0];for(const item of RANKS)if(this.data.level>=item.level)r=item;return r}
  spend(amount,source='wager'){amount=Math.floor(amount);if(amount<=0||this.data.balance<amount)return false;this.data.balance-=amount;this.app.economy?.recordDebit?.(amount,source);this.save();this.app.updateHud();return true}
  credit(amount,source='bonus'){const requested=Math.max(0,Math.floor(amount));if(requested<=0)return 0;const settlement=this.app.economy?.settleCredit?.(requested,source)||{coins:requested,notes:0,requested};amount=Math.max(0,Math.floor(settlement.coins??requested));if(amount>0)this.data.balance+=amount;this.app.economy?.recordCredit?.(amount,source,{requested,notes:settlement.notes||0,converted:Math.max(0,requested-amount)});if(this.data.balance>=1000000){this.unlock('millionaire');this.unlockRelic('millionStar')}this.save();this.app.updateHud();return amount}
  progress(event,amount=1){
    for(const m of this.data.missions.items){if(m.event!==event||m.claimed)continue;m.progress=clamp((m.progress||0)+amount,0,m.target);if(m.progress>=m.target){m.claimed=true;const paid=this.credit(m.reward,'mission');this.app.audio.play('win');this.app.toast('依頼達成',`${m.title} — ${fmt.format(paid)} Lを獲得${paid<m.reward?'（残額はCROWN NOTES）':''}`,'✦');this.app.celebration.burst(.35)}}
    this.save();this.app.renderMissions();this.app.updateHud()
  }
  unlock(id){if(this.data.achievements[id])return;this.data.achievements[id]=Date.now();const a=ACHIEVEMENTS.find(x=>x.id===id);if(a){this.app.toast('称号を獲得',`${a.name} — ${a.desc}`,a.icon);this.app.audio.play('chime')}this.save()}
  unlockRelic(id){if(this.data.relics[id])return;this.data.relics[id]=Date.now();const r=RELICS.find(x=>x.id===id);if(r){this.app.toast('秘宝を発見',`${r.name} — ${r.desc}`,r.icon);this.app.audio.play('chime');this.app.celebration.burst(.35)}this.save()}
  reset(name){const id=this.data.id;this.data=DEFAULT_PROFILE();this.data.id=id;this.data.name=name||this.data.name;this.ensureMissions();this.save()}
}

class RoomClient {
  constructor(app){
    this.app=app;const params=new URLSearchParams(location.search);this.staticMode=window.LUX_STATIC_MODE===true||['file:','about:','data:'].includes(location.protocol);this.room=(params.get('room')||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,32);
    if(!this.room&&!this.staticMode){this.room=`night-${Math.random().toString(36).slice(2,8)}`;params.set('room',this.room);history.replaceState(null,'',`${location.pathname}?${params}${location.hash}`)}
    this.online=false;this.players=[];this.feed=[];this.crown=0;this.es=null;this.timer=null;this.claimedCrowns=new Set();
  }
  async start(){
    if(this.staticMode||!this.room){this.offline();return}
    try{
      const r=await fetch('/api/party/join',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({room:this.room,appearance:{level:this.app.profile.data.level,game:'ロビー',glyph:this.app.avatarGlyph()}})});
      if(!r.ok)throw new Error('join');const state=await r.json();this.online=true;this.players=state.players||[];this.crown=state.crown||0;this.feed=state.feed||[];this.connectEvents();this.render();this.timer=setInterval(()=>this.presence(),7000);this.presence();
    }catch{this.offline()}
  }
  offline(){this.online=false;this.players=[{id:this.app.profile.data.id,name:this.app.profile.data.name,level:this.app.profile.data.level,game:'ロビー',glyph:this.app.avatarGlyph()}];this.render()}
  connectEvents(){
    try{this.es=new EventSource(`/api/party/events?room=${encodeURIComponent(this.room)}`);this.es.onmessage=e=>{try{this.handle(JSON.parse(e.data))}catch{}};this.es.onerror=()=>{};}catch{}
  }
  handle(msg){
    if(msg.type==='state'){this.players=msg.players||this.players;this.crown=msg.crown??this.crown;this.feed=msg.feed||this.feed}
    if(msg.type==='feed'&&msg.item){this.feed.unshift(msg.item);this.feed=this.feed.slice(0,30);this.app.updateTicker()}
    if(msg.type==='crown'){this.crown=0;if(!this.claimedCrowns.has(msg.id)){this.claimedCrowns.add(msg.id);const paid=this.app.profile.credit(500,'party');if(paid>0)this.app.bigWin(paid,'PARTY CROWN','仲間全員に祝祭ボーナス');else this.app.toast('PARTY CROWN','報酬はCROWN NOTESとして保管されました。','♛')}}
    this.render();
  }
  async presence(){if(!this.online)return;try{await fetch('/api/party/presence',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({room:this.room,appearance:{level:this.app.profile.data.level,game:this.app.currentGame?this.app.gameMeta(this.app.currentGame).short:'ロビー',glyph:this.app.avatarGlyph()}})})}catch{}}
  async event(kind,payload={}){if(!this.online)return;try{await fetch('/api/party/events',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({room:this.room,kind,payload})})}catch{}}
  render(){
    const players=this.players.length?this.players:[{id:this.app.profile.data.id,name:this.app.profile.data.name,level:this.app.profile.data.level,game:'ロビー',glyph:this.app.avatarGlyph()}];
    $('#partyCount').textContent=players.length;$('#roomCodeLabel').textContent=this.online?this.room.toUpperCase():'OFFLINE';$('#roomCodeModal').textContent=this.online?this.room.toUpperCase():'OFFLINE';
    const compact=players.slice(0,7).map(p=>`<div class="party-person" title="${escapeHtml(p.name)} · ${escapeHtml(p.game||'ロビー')}">${escapeHtml(p.glyph||'♛')}</div>`).join('')+(players.length>7?`<div class="party-person more">+${players.length-7}</div>`:'');
    $('#partyPlayers').innerHTML=compact;
    $('#partyModalPlayers').innerHTML=players.map(p=>`<div class="party-modal-player"><i>${escapeHtml(p.glyph||'♛')}</i><div><b>${escapeHtml(p.name)}</b><small>Lv.${p.level||1} · ${escapeHtml(p.game||'ロビー')}</small></div></div>`).join('');
    $('#partyFeed').innerHTML=(this.feed.length?this.feed:[{text:'宮殿の扉が開きました。',time:Date.now()}]).map(x=>`<div class="feed-item">${x.html||escapeHtml(x.text||'')}<time>${this.app.timeAgo(x.time)}</time></div>`).join('');
    $('#partyMeterText').textContent=`${Math.floor(this.crown)} / 100`;$('#partyMeterFill').style.width=`${clamp(this.crown,0,100)}%`;
  }
  invite(){
    const url=new URL(location.href);if(!url.searchParams.get('room'))url.searchParams.set('room',this.room||`night-${Math.random().toString(36).slice(2,8)}`);
    navigator.clipboard?.writeText(url.toString()).then(()=>this.app.toast('招待リンクをコピーしました','Discordの友達に貼り付けてください。','♟')).catch(()=>this.app.toast('ROOM CODE',this.room||'OFFLINE','♟'));
  }
}

const SUITS = ['♠','♥','♦','♣'];
const RANK_VALUES = {A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:10,Q:10,K:10};
const RANKS_CARDS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const makeDeck = (decks=1) => {
  const cards=[];for(let d=0;d<decks;d++)for(const suit of SUITS)for(const rank of RANKS_CARDS)cards.push({rank,suit,id:`${d}-${suit}-${rank}-${uid().slice(0,5)}`});return shuffled(cards);
};
const cardHtml = (card, hidden=false, motion='') => {
  const safeCard = card || {rank:'?',suit:'',id:'empty'};
  const red = safeCard.suit === '♥' || safeCard.suit === '♦';
  const classes = ['playing-card', hidden ? 'face-down' : '', red && !hidden ? 'red' : '', motion].filter(Boolean).join(' ');
  const key = escapeHtml(String(safeCard.id || `${safeCard.rank}-${safeCard.suit}`));
  if (hidden) return `<div class="${classes}" data-card-id="${key}" data-card-hidden="true" aria-label="伏せられたカード"></div>`;
  return `<div class="${classes}" data-card-id="${key}" data-card-hidden="false" aria-label="${escapeHtml(String(safeCard.rank))}${escapeHtml(String(safeCard.suit))}"><span class="corner">${escapeHtml(String(safeCard.rank))}<i>${escapeHtml(String(safeCard.suit))}</i></span><span class="suit-big">${escapeHtml(String(safeCard.suit))}</span><span class="corner bottom">${escapeHtml(String(safeCard.rank))}<i>${escapeHtml(String(safeCard.suit))}</i></span></div>`;
};

// Keeps existing card nodes alive. Only a genuinely new/revealed card is replaced and animated.
// This prevents network polling and score/HUD renders from restarting every card animation.
const syncCardRow = (container, cards, options={}) => {
  if (!container) return;
  const hiddenIndices = new Set(
    Array.isArray(options.hiddenIndices)
      ? options.hiddenIndices.filter(Number.isInteger)
      : (Number.isInteger(options.hiddenIndex) ? [options.hiddenIndex] : [])
  );
  const animate = options.animate !== false && !$('#app')?.classList.contains('reduced-motion');
  const entries = (cards || []).map((card,index)=>({card,hidden:options.hidden === true || hiddenIndices.has(index)}));
  entries.forEach(({card,hidden},index)=>{
    const id = String(card?.id || `${card?.rank||'?'}-${card?.suit||''}-${index}`);
    const key = `${id}|${hidden?'down':'up'}`;
    const current = container.children[index];
    if (current?.dataset?.cardKey === key) return;
    const revealing = current?.dataset?.cardId === id && current?.dataset?.cardHidden === 'true' && !hidden;
    const motion = animate ? (revealing ? 'card-reveal' : 'card-enter') : '';
    const template = document.createElement('template');
    template.innerHTML = cardHtml(card, hidden, motion).trim();
    const next = template.content.firstElementChild;
    next.dataset.cardKey = key;
    if (current) current.replaceWith(next); else container.appendChild(next);
  });
  while (container.children.length > entries.length) container.lastElementChild.remove();
  container.dataset.cardCount = String(entries.length);
};
const handValue = cards => {
  let total=0,aces=0;for(const c of cards){total+=RANK_VALUES[c.rank];if(c.rank==='A')aces++}let soft=false;while(aces&&total+10<=21){total+=10;aces--;soft=true}return {total,soft};
};

const GAME_META = {
  blackjack:{short:'ブラックジャック',eyebrow:'CLASSIC TABLE · SIX DECK SHOE',title:'NOCTURNE BLACKJACK',help:`<h3>目標</h3><p>カードの合計を21に近づけ、21を超えずにディーラーを上回るゲームです。絵札は10、Aは1または11として数えます。</p><div class="rule-grid"><div class="rule"><b>BLACKJACK</b>最初の2枚がA＋10点札なら配当は3:2です。</div><div class="rule"><b>DOUBLE</b>同額を追加し、カードを1枚だけ引いて勝負します。</div><div class="rule"><b>SPLIT</b>同じランク2枚を2つの手に分けます。</div><div class="rule"><b>DEALER</b>ディーラーはソフト17でスタンドします。</div></div>`},
  roulette:{short:'ルーレット',eyebrow:'PRECISION EUROPEAN WHEEL',title:'STELLAR ROULETTE',help:`<h3>精密シングルゼロ・ホイール</h3><p>0〜36の欧州式ルーレットです。新しいSVGホイールでは盤・数字・玉を同じ座標系で計算し、玉は必ず当選ポケット中央へ停止します。</p><div class="rule-grid"><div class="rule"><b>数字1点</b>返却36倍（利益35倍＋賭け分）</div><div class="rule"><b>赤黒・奇偶・高低</b>返却2倍</div><div class="rule"><b>ダズン・列</b>返却3倍</div><div class="rule"><b>0</b>外側BETには含まれません。</div></div>`},
  slots:{short:'スロット',eyebrow:'TEN PAYLINES · CASCADE ENGINE',title:'CELESTIAL VAULT',help:`<h3>星界金庫</h3><p>5リール・10ライン。左端から同じ絵柄が3個以上つながると配当です。勝った絵柄は消えて新しい絵柄が落ち、連鎖するたび倍率が上がります。</p><div class="rule-grid"><div class="rule"><b>配当表</b>画面右側（スマホはPAY TABLEボタン）から常時確認できます。</div><div class="rule"><b>WILD</b>SCATTER以外の絵柄の代用です。</div><div class="rule"><b>SCATTER</b>3個以上で配当＋5〜15 FREE SPINS。</div><div class="rule"><b>CASCADE</b>通常は×1から、FREE SPIN中は×2から連鎖ごとに上昇します。</div></div>`},
  baccarat:{short:'バカラ',eyebrow:'GRAND SALON · EIGHT DECK SHOE',title:'VELVET BACCARAT',help:`<h3>目標</h3><p>PLAYERかBANKERのどちらが9に近づくかを予想します。10以上は一の位だけを使い、カードを引く規則は自動です。</p><div class="rule-grid"><div class="rule"><b>PLAYER</b>返却2倍</div><div class="rule"><b>BANKER</b>返却1.95倍</div><div class="rule"><b>TIE</b>返却9倍</div><div class="rule"><b>PAIR</b>返却12倍</div></div>`},
  poker:{short:'ビデオポーカー',eyebrow:'JACKS OR BETTER',title:'ROYAL DRAW',help:`<h3>JACKS OR BETTER</h3><p>最初の5枚から残したいカードをHOLDし、残りを一度だけ引き直します。Jのワンペア以上で配当です。</p><div class="rule-grid"><div class="rule"><b>ROYAL FLUSH</b>800倍</div><div class="rule"><b>STRAIGHT FLUSH</b>50倍</div><div class="rule"><b>FOUR OF A KIND</b>25倍</div><div class="rule"><b>JACKS OR BETTER</b>1倍</div></div>`},
  sicbo:{short:'SIC BO',eyebrow:'THREE DICE · OBSIDIAN SALON',title:'OBSIDIAN SIC BO',help:`<h3>3つの骰子</h3><p>3個の骰子の合計・大小・奇偶・数字・ダブル・トリプルを予想します。BIG/SMALLとODD/EVENはゾロ目の場合に不成立です。</p><div class="rule-grid"><div class="rule"><b>SMALL</b>合計4〜10（ゾロ目除外）返却2倍</div><div class="rule"><b>BIG</b>合計11〜17（ゾロ目除外）返却2倍</div><div class="rule"><b>ANY TRIPLE</b>いずれかのゾロ目で返却31倍</div><div class="rule"><b>SPECIFIC TRIPLE</b>指定ゾロ目で返却181倍</div></div>`},
  keno:{short:'KENO',eyebrow:'FORTY STARS · TEN ORACLE BALLS',title:'ORACLE KENO',help:`<h3>星の予言</h3><p>1〜40から5〜10個を選び、抽選される10個の数字との一致数で配当が決まります。選択数に応じて配当表が変化します。</p><div class="rule-grid"><div class="rule"><b>QUICK PICK</b>8個を自動選択します。</div><div class="rule"><b>5〜10 SPOTS</b>選択数が多いほど最高配当が大きくなります。</div><div class="rule"><b>HIT</b>選んだ数字と抽選数字の一致です。</div><div class="rule"><b>表示配当</b>賭け額に掛ける返却倍率です。</div></div>`}
};

class CasinoApp {
  constructor(){
    this.audio=new AudioEngine();this.ambient=new AmbientRenderer($('#ambientCanvas'));this.celebration=new CelebrationRenderer($('#celebrationCanvas'));
    this.profile=new ProfileStore(this);this.room=new RoomClient(this);this.currentGame=null;this.gameInstance=null;this.activeModal=null;this.startedAt=Date.now();this.breakShownAt=0;this.bigWinTimer=null;this.confirmHandler=null;this.jackpotOffer=null;this.boot()
  }
  boot(){
    $('#app').classList.add('intro-mode');$('#playerNameInput').value=this.profile.data.name;this.applySettings();this.bindGlobal();this.updateHud();this.renderMissions();this.renderProfile('stats');this.updateDaily();this.updateTicker();this.showScreen('introScreen');this.room.start();this.sessionTimer=setInterval(()=>this.tickSession(),1000);window.__LUX_NOCTIS__=this
  }
  bindGlobal(){
    const wake=()=>this.audio.ensure();window.addEventListener('pointerdown',wake,{once:true});window.addEventListener('keydown',wake,{once:true});
    $('#enterButton').addEventListener('click',()=>this.enterPalace());$('#playerNameInput').addEventListener('keydown',e=>{if(e.key==='Enter')this.enterPalace()});$('#brandButton').addEventListener('click',()=>this.showLobby());$('#backLobbyButton').addEventListener('click',()=>this.showLobby());
    $('#profileButton').addEventListener('click',()=>this.openModal('profileModal'));$('#profileButton').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')this.openModal('profileModal')});$('#dailyButton').addEventListener('click',()=>this.openDaily());$('#partyButton').addEventListener('click',()=>this.openModal('partyModal'));$('#settingsButton').addEventListener('click',()=>this.openModal('settingsModal'));$('#jackpotButton').addEventListener('click',()=>this.openJackpot());$('#nightEventBar').addEventListener('click',()=>this.openNightEventHelp());
    $('#continueButton').addEventListener('click',()=>this.openGame(this.profile.data.lastGame||'roulette'));$('#inviteButton').addEventListener('click',()=>this.room.invite());$('#copyRoomButton').addEventListener('click',()=>this.room.invite());$$('.game-card').forEach(b=>b.addEventListener('click',()=>this.openGame(b.dataset.game)));$('#gameHelpButton').addEventListener('click',()=>this.openHelp(this.currentGame));
    $$('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>this.closeModal()));$('#modalBackdrop').addEventListener('click',()=>this.closeModal());$$('.modal-tabs [data-profile-tab]').forEach(b=>b.addEventListener('click',()=>{this.renderProfile(b.dataset.profileTab);$$('.modal-tabs [data-profile-tab]').forEach(x=>x.classList.toggle('active',x===b))}));
    $('#claimDailyButton').addEventListener('click',()=>this.claimDaily());$$('[data-jackpot-chest]').forEach(b=>b.addEventListener('click',()=>this.claimJackpot(Number(b.dataset.jackpotChest))));
    $('#soundToggle').addEventListener('change',e=>{this.profile.data.settings.sound=e.target.checked;this.applySettings(true)});$('#motionToggle').addEventListener('change',e=>{this.profile.data.settings.reducedMotion=e.target.checked;this.applySettings(true)});$('#qualityToggle').addEventListener('change',e=>{this.profile.data.settings.lowQuality=e.target.checked;this.applySettings(true)});$('#breakToggle').addEventListener('change',e=>{this.profile.data.settings.breakReminder=e.target.checked;this.applySettings(true)});
    $('#resetProfileButton').addEventListener('click',()=>this.confirm('プロフィールを完全リセット','コイン、レベル、記録、秘宝、金庫、実績、テーマをすべて消去します。この操作は元に戻せません。',()=>{const name=this.profile.data.name;this.profile.reset(name);this.jackpotOffer=null;this.applySettings();this.updateHud();this.renderMissions();this.renderProfile('stats');this.closeModal();this.toast('リセット完了','新しい夜が始まりました。','☾')}));
    $('#confirmCancel').addEventListener('click',()=>this.closeModal());$('#confirmOk').addEventListener('click',()=>{const fn=this.confirmHandler;this.closeModal();fn?.()});$('#missionsInfo').addEventListener('click',()=>{this.openModal('helpModal');$('#helpTitle').textContent='今夜の依頼';$('#helpContent').innerHTML='<p>毎日0:00（日本時間）に3つの依頼が更新されます。達成報酬は自動でプレイコイン残高へ加算されます。</p>'});
    $$('.reaction-row button').forEach(b=>b.addEventListener('click',()=>{this.profile.unlock('social');this.room.event('reaction',{emoji:b.dataset.reaction});this.toast('リアクションを送りました',b.dataset.reaction,b.dataset.reaction)}));$$('#mobileNav button').forEach(b=>b.addEventListener('click',()=>{const n=b.dataset.nav;if(n==='lobby')this.showLobby();if(n==='missions'){this.showLobby();setTimeout(()=>$('.mission-panel')?.scrollIntoView({behavior:'smooth'}),100)}if(n==='daily')this.openDaily();if(n==='party')this.openModal('partyModal');if(n==='profile')this.openModal('profileModal')}));
    $('#closeBreakReminder').addEventListener('click',()=>{$('#breakReminder').hidden=true;this.startedAt=Date.now()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(this.activeModal)this.closeModal();else if(this.currentGame)this.showLobby()}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.gameInstance?.pause)this.gameInstance.pause()})
  }
  applySettings(save=false){const s=this.profile.data.settings;this.audio.enabled=s.sound;$('#soundToggle').checked=s.sound;$('#motionToggle').checked=s.reducedMotion;$('#qualityToggle').checked=s.lowQuality;$('#breakToggle').checked=s.breakReminder;$('#app').classList.toggle('reduced-motion',s.reducedMotion);$('#app').classList.toggle('low-quality',s.lowQuality);this.ambient.setLow(s.lowQuality);$('#app').dataset.theme=this.profile.data.theme||'nocturne';if(save)this.profile.save()}
  enterPalace(){const name=$('#playerNameInput').value.trim().slice(0,18)||this.profile.data.name;this.profile.data.name=name;this.profile.save();$('#app').classList.remove('intro-mode');this.audio.play('chime');this.showLobby();this.updateHud();this.room.presence();this.toast(`ようこそ、${name}`,'23のテーブル、日替わり王冠巡回、収集、遠征と5種類の対戦があなたを待っています。','✦')}
  showScreen(id){$$('.screen').forEach(s=>s.classList.toggle('active',s.id===id))}
  showLobby(){if($('#app').classList.contains('intro-mode'))return;this.gameInstance?.unmount?.();this.gameInstance=null;this.currentGame=null;this.showScreen('lobbyScreen');this.updateMobileNav('lobby');this.room.presence();this.updateTicker();this.updateNightEventUi()}
  gameMeta(id){return GAME_META[id]||GAME_META.roulette}
  openGame(id){
    if(!GAME_META[id])return;this.closeModal();this.gameInstance?.unmount?.();this.currentGame=id;this.profile.data.lastGame=id;this.profile.save();const m=this.gameMeta(id);$('#gameEyebrow').textContent=m.eyebrow;$('#gameTitle').textContent=m.title;$('#gameMount').innerHTML='';this.showScreen('gameScreen');const activeGameScreen=$('#gameScreen');if(activeGameScreen)activeGameScreen.scrollTop=0;this.updateMobileNav('');const classes={blackjack:BlackjackGame,roulette:RouletteGame,slots:SlotsGame,baccarat:BaccaratGame,poker:PokerGame,sicbo:SicBoGame,keno:KenoGame};this.gameInstance=new classes[id](this,$('#gameMount'));this.gameInstance.mount();this.room.presence();this.audio.play('chime');this.updateNightEventUi()
  }
  updateMobileNav(active){$$('#mobileNav button').forEach(b=>b.classList.toggle('active',b.dataset.nav===active))}
  openModal(id){this.closeModal(false);const el=$(`#${id}`);if(!el)return;$('#modalBackdrop').hidden=false;el.hidden=false;this.activeModal=el;if(id==='profileModal')this.renderProfile('stats');if(id==='partyModal')this.room.render();if(id==='jackpotModal')this.renderJackpot();this.audio.play('click')}
  closeModal(hideBackdrop=true){if(this.activeModal)this.activeModal.hidden=true;this.activeModal=null;if(hideBackdrop)$('#modalBackdrop').hidden=true}
  openDaily(){this.updateDaily();this.openModal('dailyModal')}
  openHelp(game){const m=this.gameMeta(game);$('#helpTitle').textContent=m.title;$('#helpContent').innerHTML=m.help;this.openModal('helpModal')}
  openNightEventHelp(){const state=this.profile.data.nightEvent,event=NIGHT_EVENTS.find(x=>x.id===state.active);$('#helpTitle').textContent=event?event.jp:'宮殿現象';$('#helpContent').innerHTML=event?`<h3>${event.name}</h3><p>${event.desc}</p><div class="rule-grid"><div class="rule"><b>残り</b>${state.remaining}ラウンド</div><div class="rule"><b>対象</b>すべてのゲーム</div></div>`:`<p>数ラウンド遊ぶごとに、宮殿全体へ特別な現象が発生します。次の現象まであと${state.nextIn}ラウンドです。</p>`;this.openModal('helpModal')}
  confirm(title,text,handler){$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;this.confirmHandler=handler;this.openModal('confirmModal')}
  updateHud(){
    const p=this.profile.data,r=this.profile.rank(),need=this.profile.xpNeed();$('#playerNameTop').textContent=p.name;$('#levelTop').textContent=`Lv.${p.level}`;$('#rankTop').textContent=r.name;$('#balanceTop').textContent=fmt.format(p.balance);$('#balanceGame').textContent=formatL(p.balance);$('#xpMiniFill').style.width=`${clamp(p.xp/need*100,0,100)}%`;$('#avatarGlyph').textContent=this.avatarGlyph();$('#rankMedal').textContent=r.medal;$('#rankNameSide').textContent=r.name;$('#rankProgressText').textContent=`Lv.${p.level+1}まで ${fmt.format(need-p.xp)} XP`;$('#rankProgressFill').style.width=`${clamp(p.xp/need*100,0,100)}%`;$('#app').dataset.theme=p.theme||'nocturne';
    $('#jackpotPotTop').textContent=formatL(p.jackpot.pot);$('#jackpotChargeTop').style.width=`${clamp(p.jackpot.charge,0,100)}%`;$('#jackpotButton').classList.toggle('ready',!!p.jackpot.ready);$('#streakChip').hidden=!p.streak.current;$('#streakTop').textContent=`×${p.streak.current}`;this.updateNightEventUi()
  }
  avatarGlyph(){const rank=this.profile.rank().name;if(rank.includes('CROWN'))return'♛';if(rank==='DIAMOND')return'♦';if(rank==='PLATINUM')return'✦';if(rank.includes('GOLD'))return'♕';return'♜'}
  renderMissions(){this.profile.ensureMissions();const items=this.profile.data.missions.items;$('#missionList').innerHTML=items.map(m=>`<div class="mission ${m.claimed?'completed':''}"><div class="mission-icon">${m.claimed?'✓':escapeHtml(m.icon)}</div><div class="mission-copy"><b>${escapeHtml(m.title)}</b><small>${m.claimed?'達成済み':`${fmt.format(m.progress||0)} / ${fmt.format(m.target)}`}</small><div class="mission-progress"><i style="width:${clamp((m.progress||0)/m.target*100,0,100)}%"></i></div></div><div class="mission-reward">+${fmt.format(m.reward)} L</div></div>`).join('')}
  renderProfile(tab='stats'){
    const p=this.profile.data,r=this.profile.rank();$('#profileAvatar').textContent=this.avatarGlyph();$('#profileName').textContent=p.name;$('#profileRank').textContent=`${r.name} · Lv.${p.level}`;$('#profileBalance').textContent=fmt.format(p.balance);const mount=$('#profileTabContent');if(!mount)return;
    if(tab==='stats')mount.innerHTML=`<div class="stats-grid"><div class="stat-box"><small>PLAYED</small><strong>${fmt.format(p.stats.rounds)}</strong></div><div class="stat-box"><small>WINS</small><strong>${fmt.format(p.stats.wins)}</strong></div><div class="stat-box"><small>WIN RATE</small><strong>${p.stats.rounds?Math.round(p.stats.wins/p.stats.rounds*100):0}%</strong></div><div class="stat-box"><small>BEST STREAK</small><strong>×${fmt.format(p.streak.best)}</strong></div><div class="stat-box"><small>TOTAL WAGER</small><strong>${fmt.format(p.stats.wagered)} L</strong></div><div class="stat-box"><small>BIGGEST RETURN</small><strong>${fmt.format(p.stats.biggestWin)} L</strong></div><div class="stat-box"><small>STRAIGHT HITS</small><strong>${fmt.format(p.stats.rouletteStraights)}</strong></div><div class="stat-box"><small>MAX CASCADE</small><strong>×${fmt.format(p.stats.maxCascade)}</strong></div><div class="stat-box"><small>SIC BO TRIPLES</small><strong>${fmt.format(p.stats.sicboTriples)}</strong></div><div class="stat-box"><small>KENO BEST</small><strong>${fmt.format(p.stats.kenoBest)} HIT</strong></div><div class="stat-box"><small>VAULT OPENS</small><strong>${fmt.format(p.jackpot.claims)}</strong></div><div class="stat-box"><small>POKER BEST</small><strong>${escapeHtml(p.stats.pokerBest)}</strong></div></div>`;
    if(tab==='achievements')mount.innerHTML=`<div class="achievement-list">${ACHIEVEMENTS.map(a=>`<div class="achievement ${p.achievements[a.id]?'':'locked'}"><div class="achievement-icon">${p.achievements[a.id]?a.icon:'?'}</div><div><b>${p.achievements[a.id]?a.name:'？？？'}</b><small>${p.achievements[a.id]?a.desc:'条件を満たすと公開されます'}</small></div></div>`).join('')}</div>`;
    if(tab==='relics')mount.innerHTML=`<div class="relic-intro"><b>PALACE RELIQUARY</b><span>${Object.keys(p.relics).length} / ${RELICS.length}</span></div><div class="relic-grid">${RELICS.map(x=>`<div class="relic-card ${p.relics[x.id]?'':'locked'}"><i>${p.relics[x.id]?x.icon:'◇'}</i><b>${p.relics[x.id]?x.name:'？？？'}</b><small>${p.relics[x.id]?x.desc:'まだ封印されています'}</small></div>`).join('')}</div>`;
    if(tab==='themes')mount.innerHTML=`<div class="theme-grid">${THEMES.map(t=>`<button class="theme-card ${p.theme===t.id?'active':''} ${p.level<t.unlock?'locked':''}" data-theme-id="${t.id}" style="--theme-bg:${t.bg};--theme-glow:${t.glow}" type="button"><b>${p.level>=t.unlock?t.name:'？？？'}</b><small>${p.level>=t.unlock?t.desc:`Lv.${t.unlock}で解放`}</small></button>`).join('')}</div>`;
    if(tab==='themes')$$('.theme-card',mount).forEach(b=>b.addEventListener('click',()=>{const t=THEMES.find(x=>x.id===b.dataset.themeId);if(!t||p.level<t.unlock)return;this.profile.data.theme=t.id;this.profile.save();this.applySettings();this.renderProfile('themes');this.toast('宮殿テーマ変更',t.name,'✦')}))
  }
  dailyGiftAmount(){const p=this.profile.data,b=Math.max(0,p.balance||0),base=b>=250000?300:b>=100000?500:1000,rescue=Math.floor(clamp((30000-b)/30000,0,1)*1000/50)*50,streak=Math.min(250,Math.max(0,p.dailyStreak||0)*25);return base+rescue+streak}
  updateDaily(){const ready=this.profile.data.lastDaily!==dateKey(),amount=this.dailyGiftAmount();$('#dailyAmount').textContent=fmt.format(amount);$('#dailyDescription').textContent=ready?'今夜のプレイコインを受け取れます。':'今夜の贈り物は受け取り済みです。次の0:00に再び開きます。';$('#claimDailyButton').disabled=!ready;$('#claimDailyButton').querySelector('span').textContent=ready?'受け取る':'受け取り済み';$('#dailyButton').classList.toggle('claimed',!ready);$('#dailyDot').style.display=ready?'block':'none'}
  claimDaily(){if(this.profile.data.lastDaily===dateKey())return;const amount=this.dailyGiftAmount();this.profile.data.lastDaily=dateKey();this.profile.data.dailyStreak=(this.profile.data.dailyStreak||0)+1;const paid=this.profile.credit(amount,'daily');this.audio.play(paid?'bigwin':'chime');this.celebration.burst(paid?.55:.25);this.toast('ミッドナイトギフト',`${fmt.format(paid)} Lを受け取りました${paid<amount?'。残額はCROWN NOTESとして保管されています。':'。'}`,'🎁');this.updateDaily();setTimeout(()=>this.closeModal(),700)}
  activeNightEvent(){return NIGHT_EVENTS.find(x=>x.id===this.profile.data.nightEvent.active)||null}
  updateNightEventUi(){
    const st=this.profile.data.nightEvent,event=this.activeNightEvent(),bar=$('#nightEventBar');if(!bar)return;$('#nightEventIcon').textContent=event?.icon||'✦';$('#nightEventEyebrow').textContent=event?'PALACE PHENOMENON ACTIVE':'PALACE PHENOMENON';$('#nightEventName').textContent=event?`${event.jp} · ${event.name}`:`次の現象まで ${st.nextIn} ROUND`;$('#nightEventDesc').textContent=event?event.desc:'遊ぶほど、宮殿に特別な夜が訪れます。';$('#nightEventRounds').textContent=event?st.remaining:st.nextIn;bar.classList.toggle('active',!!event);const badge=$('#gameEventBadge');if(badge){badge.hidden=!event;$('#gameEventName').textContent=event?`${event.jp} · ${st.remaining}`:''}
  }
  advanceNightEvent(){
    const st=this.profile.data.nightEvent;if(st.active){st.remaining=Math.max(0,st.remaining-1);if(st.remaining===0){const ended=NIGHT_EVENTS.find(x=>x.id===st.active);st.active=null;st.nextIn=4+randomInt(4);this.toast('宮殿現象が静まりました',`${ended?.jp||'特別な夜'}は終了しました。`,'☾')}}else{st.nextIn=Math.max(0,(st.nextIn||1)-1);if(st.nextIn===0){const event=choice(NIGHT_EVENTS);st.active=event.id;st.remaining=event.rounds;this.toast('宮殿現象 発生',`${event.jp} — ${event.desc}`,event.icon);this.audio.play('chime');this.celebration.burst(.3)}}this.profile.save();this.updateNightEventUi()
  }
  addJackpotCharge(wager,payout,win,event){
    const j=this.profile.data.jackpot;let gain=clamp(2+Math.floor(wager/2500)+(win?1:0),1,10);if(event?.id==='vault')gain*=2;const wasReady=j.ready;j.charge=clamp(j.charge+gain,0,100);j.ready=j.charge>=100&&j.pot>=100;if(j.ready&&!wasReady){this.toast('ECLIPSE VAULT 解放','王宮財務局で積み立てた星蝕金庫を開けられます。','◇');this.audio.play('bigwin')}this.profile.save()
  }
  recordRound({game,wager=0,payout=0,label='',detail='',events=[],remote=false}){
    if(remote)return this.recordRemoteProgress({game,wager,payout,label,detail,events});
    const p=this.profile.data,event=this.activeNightEvent(),tablePayout=Math.max(0,Math.floor(payout));let requestedEventBonus=0,eventBonus=0;const baseNet=tablePayout-wager;if(event?.id==='echo'&&baseNet>0)requestedEventBonus=Math.min(500,Math.max(25,Math.floor(baseNet*.03)));if(tablePayout>0)this.profile.credit(tablePayout,'table');if(requestedEventBonus>0){eventBonus=this.profile.credit(requestedEventBonus,'event');this.toast('FORTUNE ECHO',eventBonus?`残響ボーナス +${formatL(eventBonus)}${eventBonus<requestedEventBonus?' · 残額はCROWN NOTES':''}`:'残響はCROWN NOTESとして保管されました。','☾')}const effectivePayout=tablePayout+eventBonus;
    p.stats.rounds++;p.stats.wagered+=Math.max(0,Math.floor(wager));p.stats.returned+=effectivePayout;p.stats.biggestWin=Math.max(p.stats.biggestWin,effectivePayout);const net=effectivePayout-wager,win=net>0;
    if(win){p.stats.wins++;p.streak.current++;p.streak.best=Math.max(p.streak.best,p.streak.current);p.stats.bestStreak=p.streak.best;this.profile.unlock('firstWin');this.profile.progress('win',1);if(p.streak.current>=5){this.profile.unlock('streakFive');this.profile.unlockRelic('flameCrown')}}else p.streak.current=0;
    this.profile.progress('round',1);this.profile.progress('wager',wager);events.forEach(e=>this.profile.progress(e.event,e.amount||1));if(p.stats.wagered>=100000)this.profile.unlock('highRoller');if(p.stats.rounds>=100)this.profile.unlockRelic('centuryTicket');
    this.addJackpotCharge(wager,tablePayout,win,event);const streakRate=event?.id==='crown' ? .1 : .05;
    let streakBoost=1+Math.min(p.streak.current,event?.id==='crown'?10:5)*streakRate;let xp=Math.max(20,Math.floor(wager*.018)+(win?80:20));if(event?.id==='stardust')xp*=2;xp=Math.floor(xp*streakBoost);this.profile.addXp(xp);this.advanceNightEvent();this.profile.save();this.updateHud();this.renderProfile('stats');
    if(win){this.audio.play(net>=Math.max(10000,wager*5)?'bigwin':'win');if(net>=Math.max(10000,wager*5))this.bigWin(net,label||'BIG WIN',detail||this.gameMeta(game).short);this.room.event('win',{game:this.gameMeta(game).short,amount:net,label})}else if(net<0)this.audio.play('lose');this.maybeRelief();return net
  }
  recordRemoteProgress({game,wager=0,payout=0,events=[]}){
    const p=this.profile.data,tablePayout=Math.max(0,Math.floor(payout)),safeWager=Math.max(0,Math.floor(wager)),net=tablePayout-safeWager,win=net>0;
    p.stats.rounds++;p.stats.wagered+=safeWager;p.stats.returned+=tablePayout;p.stats.biggestWin=Math.max(p.stats.biggestWin,tablePayout);
    if(win){p.stats.wins++;p.streak.current++;p.streak.best=Math.max(p.streak.best,p.streak.current);p.stats.bestStreak=p.streak.best;this.profile.unlock('firstWin');this.profile.progress('win',1);if(p.streak.current>=5){this.profile.unlock('streakFive');this.profile.unlockRelic('flameCrown')}}else p.streak.current=0;
    this.profile.progress('round',1);this.profile.progress('wager',safeWager);events.forEach(e=>this.profile.progress(e.event,e.amount||1));if(p.stats.wagered>=100000)this.profile.unlock('highRoller');if(p.stats.rounds>=100)this.profile.unlockRelic('centuryTicket');
    const xp=Math.max(20,Math.floor(safeWager*.018)+(win?80:20));this.profile.addXp(xp);this.profile.save();this.updateHud();this.renderProfile('stats');return net
  }
  openJackpot(){this.jackpotOffer=null;this.openModal('jackpotModal')}
  renderJackpot(){
    const j=this.profile.data.jackpot;$('#jackpotPotModal').textContent=formatL(j.pot);$('#jackpotChargeText').textContent=`${Math.floor(j.charge)} / 100`;$('#jackpotChargeFill').style.width=`${clamp(j.charge,0,100)}%`;$('#jackpotLocked').hidden=j.ready;$('#jackpotChests').hidden=!j.ready;$('#jackpotReveal').hidden=true;$('#jackpotHint').textContent=`あと${Math.max(0,100-Math.floor(j.charge))} CHARGE`;$$('[data-jackpot-chest]').forEach(b=>{b.disabled=false;b.className='';b.querySelector('b').textContent=['STAR CHEST','MOON CHEST','CROWN CHEST'][Number(b.dataset.jackpotChest)];b.querySelector('i').textContent=['✦','☾','♛'][Number(b.dataset.jackpotChest)]});if(j.ready&&!this.jackpotOffer){const rare=cryptoFloat()<.05?1:.5;this.jackpotOffer=shuffled([.1,.25,rare])}
  }
  claimJackpot(index){
    const j=this.profile.data.jackpot;if(!j.ready||!this.jackpotOffer)return;const mult=this.jackpotOffer[index],reward=Math.min(j.pot,Math.max(100,Math.floor(j.pot*mult)));$$('[data-jackpot-chest]').forEach((b,i)=>{b.disabled=true;b.classList.add(i===index?'opened':'faded');b.querySelector('b').textContent=i===index?`+${formatL(reward)}`:'SEALED'});$('#jackpotReveal').hidden=false;$('#jackpotRevealAmount').textContent=`+${formatL(reward)}`;$('#jackpotRevealText').textContent=mult>=1?'ECLIPSE JACKPOT — 金庫の全星光を獲得しました。':`${Math.round(mult*100)}%の星光を獲得しました。`;this.profile.credit(reward,'vault');j.pot=Math.max(0,Math.floor(j.pot-reward));j.charge=0;j.ready=false;j.claims++;this.profile.data.stats.jackpots++;this.profile.unlock('jackpot');this.profile.unlockRelic('eclipseKey');this.profile.save();this.audio.play('bigwin');this.bigWin(reward,mult>=1?'ECLIPSE JACKPOT':'VAULT PRIZE','星蝕の金庫');this.updateHud();this.jackpotOffer=null
  }
  maybeRelief(){const p=this.profile.data;if(p.balance>=100||p.economy?.reliefUsed)return;const grant=Math.max(0,2500-p.balance);if(!grant)return;p.lastRelief=Date.now();if(p.economy)p.economy.reliefUsed=true;const paid=this.profile.credit(grant,'relief');this.toast('一度限りの宮殿救済',`残高を2,500 Lまで補填しました（+${fmt.format(paid)} L）。同じキャラクターでは再発行されません。`,'☾')}
  toast(title,text,icon='✦'){const el=document.createElement('div');el.className='toast';el.innerHTML=`<div class="toast-icon">${escapeHtml(icon)}</div><div><b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></div>`;$('#toastStack').appendChild(el);setTimeout(()=>el.remove(),4200)}
  bigWin(amount,label='BIG WIN',sub='THE PALACE REMEMBERS'){clearTimeout(this.bigWinTimer);$('#bigWinLabel').textContent=label;$('#bigWinAmount').textContent=`+${formatL(amount)}`;$('#bigWinSub').textContent=sub;$('#bigWinOverlay').hidden=false;this.celebration.burst(amount>=50000?1.5:1);navigator.vibrate?.([80,40,100]);this.bigWinTimer=setTimeout(()=>{$('#bigWinOverlay').hidden=true},2600)}
  updateTicker(){const event=this.activeNightEvent(),local=[`<span><b>NEW</b> 精密ルーレットと配当内訳付きCASCADE SLOT</span>`,`<span><b>23 GAMES</b> 王冠巡回と5 LIVE PVPが開場</span>`,`<span><b>VAULT</b> 全ゲームでECLIPSE CHARGEが上昇</span>`,event?`<span><b>${event.name}</b> ${event.desc}</span>`:`<span><b>PLAY MONEY</b> 購入・換金・譲渡はできません</span>`];const room=(this.room?.feed||[]).slice(0,5).map(x=>`<span>${x.html||escapeHtml(x.text||'')}</span>`);$('#liveTicker').innerHTML=[...room,...local,...room,...local].join('')}
  tickSession(){const sec=Math.floor((Date.now()-this.startedAt)/1000),m=Math.floor(sec/60),ss=sec%60;$('#sessionTime').textContent=`SESSION ${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;if(this.profile.data.settings.breakReminder&&sec>=1800&&Date.now()-this.breakShownAt>25*60*1000){this.breakShownAt=Date.now();$('#breakReminder').hidden=false;this.audio.play('alert')}}
  timeAgo(ts){const d=Math.max(0,Math.floor((Date.now()-(ts||Date.now()))/1000));if(d<10)return'NOW';if(d<60)return`${d}s`;if(d<3600)return`${Math.floor(d/60)}m`;return`${Math.floor(d/3600)}h`}
}

class GameBase {
  constructor(app,mount){this.app=app;this.root=mount;this.busy=false;this.timers=[];this.intervals=[];this.frames=[];this.disposed=false}
  setTimeout(fn,ms){const id=setTimeout(()=>{if(!this.disposed)fn()},ms);this.timers.push(id);return id}
  setInterval(fn,ms){const id=setInterval(()=>{if(!this.disposed)fn()},ms);this.intervals.push(id);return id}
  frame(fn){const id=requestAnimationFrame(t=>{if(!this.disposed)fn(t)});this.frames.push(id);return id}
  unmount(){this.disposed=true;this.timers.forEach(clearTimeout);this.intervals.forEach(clearInterval);this.frames.forEach(cancelAnimationFrame);this.timers=[];this.intervals=[];this.frames=[];this.root.innerHTML=''}
  canAfford(amount){if(this.app.profile.data.balance<amount){this.app.toast('プレイコイン不足',`${fmt.format(amount)} Lが必要です。`,'L');this.app.audio.play('alert');return false}return true}
  chipSelector(selected,onSelect,values=[100,500,1000,5000,10000]){return `<div class="chip-selector">${values.map(v=>`<button class="chip-button ${v===selected?'active':''}" data-chip="${v}" type="button">${v>=1000?`${v/1000}K`:v}</button>`).join('')}</div>`}
  bindChips(container,callback){$$('[data-chip]',container).forEach(b=>b.addEventListener('click',()=>{callback(Number(b.dataset.chip));this.app.audio.play('chip')}))}
}

class BlackjackGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=1000;this.phase='betting';this.shoe=makeDeck(6);this.dealer=[];this.hands=[];this.active=0;this.totalWager=0}
  mount(){
    this.root.innerHTML=`<div class="game-stage blackjack-stage">
      <div class="table-status"><b id="bjStatus">BETを選んでDEAL</b><small id="bjSub">BLACKJACK PAYS 3 TO 2</small></div>
      <div class="hand-zone dealer-zone"><h3>DEALER</h3><div id="dealerCards" class="card-row"></div><span id="dealerScore" class="hand-score">—</span></div>
      <div id="playerHands" class="player-hands"></div>
      <div class="blackjack-actions"><button id="bjHit" class="table-button" type="button">HIT</button><button id="bjStand" class="table-button" type="button">STAND</button><button id="bjDouble" class="table-button" type="button">DOUBLE</button><button id="bjSplit" class="table-button" type="button">SPLIT</button></div>
      <div class="bet-dock">${this.chipSelector(this.bet)}<div class="bet-readout"><small>YOUR BET</small><strong id="bjBet">${formatL(this.bet)}</strong></div><button id="bjDeal" class="table-button primary" type="button">DEAL</button></div>
    </div>`;
    this.bindChips(this.root,v=>{if(this.phase!=='betting')return;this.bet=v;this.render()});
    $('#bjDeal',this.root).addEventListener('click',()=>this.deal());$('#bjHit',this.root).addEventListener('click',()=>this.hit());$('#bjStand',this.root).addEventListener('click',()=>this.stand());$('#bjDouble',this.root).addEventListener('click',()=>this.double());$('#bjSplit',this.root).addEventListener('click',()=>this.split());this.render();
  }
  draw(){if(this.shoe.length<70)this.shoe=makeDeck(6);return this.shoe.pop()}
  async deal(){
    if(this.busy||this.phase!=='betting'||!this.canAfford(this.bet))return;this.busy=true;if(!this.app.profile.spend(this.bet)){this.busy=false;return}this.shoe=makeDeck(6);this.totalWager=this.bet;this.dealer=[this.draw(),this.draw()];this.hands=[{cards:[this.draw(),this.draw()],bet:this.bet,status:'active',result:'',split:false}];this.active=0;this.phase='player';this.app.audio.play('deal');this.render();await wait(this.app.profile.data.settings.reducedMotion?30:500);
    if(this.disposed)return;const pBJ=this.isBlackjack(this.hands[0]),dBJ=this.isBlackjack({cards:this.dealer,split:false});if(pBJ||dBJ){await this.finishDealer(true)}if(this.disposed)return;this.busy=false;this.render();
  }
  isBlackjack(hand){return hand.cards.length===2&&!hand.split&&handValue(hand.cards).total===21}
  current(){return this.hands[this.active]}
  hit(){if(this.busy||this.phase!=='player')return;const h=this.current();if(!h||h.status!=='active')return;h.cards.push(this.draw());this.app.audio.play('card');const v=handValue(h.cards).total;if(v>21){h.status='bust';h.result='BUST';this.advance()}else if(v===21){h.status='stand';this.advance()}this.render()}
  stand(){if(this.busy||this.phase!=='player')return;const h=this.current();if(!h)return;h.status='stand';this.app.audio.play('click');this.advance();this.render()}
  double(){
    if(this.busy||this.phase!=='player')return;const h=this.current();if(!h||h.cards.length!==2||!this.canAfford(h.bet))return;if(!this.app.profile.spend(h.bet))return;this.totalWager+=h.bet;h.bet*=2;h.cards.push(this.draw());h.status=handValue(h.cards).total>21?'bust':'stand';if(h.status==='bust')h.result='BUST';this.app.audio.play('chip');this.app.audio.play('card');this.advance();this.render()
  }
  split(){
    if(this.busy||this.phase!=='player'||this.hands.length!==1)return;const h=this.current();if(!h||h.cards.length!==2||h.cards[0].rank!==h.cards[1].rank||!this.canAfford(h.bet))return;if(!this.app.profile.spend(h.bet))return;this.totalWager+=h.bet;const c1=h.cards[0],c2=h.cards[1],aces=c1.rank==='A';this.hands=[{cards:[c1,this.draw()],bet:h.bet,status:aces?'stand':'active',result:'',split:true},{cards:[c2,this.draw()],bet:h.bet,status:aces?'stand':'active',result:'',split:true}];this.active=0;this.app.audio.play('deal');if(aces)this.advance();this.render()
  }
  advance(){
    let next=this.active+1;while(next<this.hands.length&&this.hands[next].status!=='active')next++;if(next<this.hands.length){this.active=next;return}this.phase='dealer';this.setTimeout(()=>this.finishDealer(false),this.app.profile.data.settings.reducedMotion?40:420)
  }
  async finishDealer(naturalCheck=false){
    if(this.disposed||(this.busy&&this.phase==='settled'))return;this.busy=true;this.phase='dealer';this.render();if(!naturalCheck){let v=handValue(this.dealer);while(v.total<17){await wait(this.app.profile.data.settings.reducedMotion?40:430);if(this.disposed)return;this.dealer.push(this.draw());this.app.audio.play('card');this.render();v=handValue(this.dealer)}}
    await wait(this.app.profile.data.settings.reducedMotion?20:350);if(this.disposed)return;const dv=handValue(this.dealer).total,dBJ=this.dealer.length===2&&dv===21;let payout=0,labels=[];let blackjackEvent=false;
    for(const h of this.hands){const pv=handValue(h.cards).total;if(pv>21){h.result='BUST';labels.push('敗北');continue}if(this.isBlackjack(h)&&!dBJ){const ret=Math.floor(h.bet*2.5);payout+=ret;h.result='BLACKJACK';labels.push('BLACKJACK');blackjackEvent=true;continue}if(dBJ&&!this.isBlackjack(h)){h.result='DEALER BJ';labels.push('敗北');continue}if(dv>21||pv>dv){payout+=h.bet*2;h.result='WIN';labels.push('勝利')}else if(pv===dv){payout+=h.bet;h.result='PUSH';labels.push('引分')}else{h.result='LOSE';labels.push('敗北')}}
    if(blackjackEvent){this.app.profile.data.stats.blackjacks++;this.app.profile.unlock('blackjack');this.app.profile.unlockRelic('obsidianAce')}
    this.app.recordRound({game:'blackjack',wager:this.totalWager,payout,label:blackjackEvent?'BLACKJACK':'TABLE WIN',detail:labels.join(' · '),events:blackjackEvent?[{event:'blackjack'}]:[]});this.phase='settled';this.busy=false;this.render();this.setTimeout(()=>{this.phase='betting';this.dealer=[];this.hands=[];this.totalWager=0;this.render()},this.app.profile.data.settings.reducedMotion?500:2200)
  }
  render(){
    if(!$('#bjStatus',this.root))return;const reveal=this.phase==='dealer'||this.phase==='settled';
    syncCardRow($('#dealerCards',this.root),this.dealer,{hiddenIndex:reveal?-1:1});
    const dv=this.dealer.length?(reveal?handValue(this.dealer).total:RANK_VALUES[this.dealer[0].rank]):'—';$('#dealerScore',this.root).textContent=dv;
    const hands=this.hands.length?this.hands:[{cards:[],bet:this.bet,status:'',result:'',split:false}];
    const handsMount=$('#playerHands',this.root);
    while(handsMount.children.length<hands.length){const el=document.createElement('div');el.className='player-hand';el.innerHTML='<h3></h3><div class="card-row"></div><span class="hand-score"></span><div class="hand-result"></div>';handsMount.appendChild(el)}
    while(handsMount.children.length>hands.length)handsMount.lastElementChild.remove();
    hands.forEach((h,i)=>{const el=handsMount.children[i];el.className=`player-hand ${this.phase==='player'&&i===this.active?'active':''}`;el.querySelector('h3').textContent=`${this.hands.length>1?`HAND ${i+1}`:'PLAYER'} · ${formatL(h.bet||this.bet)}`;syncCardRow(el.querySelector('.card-row'),h.cards);const score=el.querySelector('.hand-score');score.textContent=h.cards.length?handValue(h.cards).total:'';score.hidden=!h.cards.length;const result=el.querySelector('.hand-result');result.textContent=h.result||'';result.hidden=!h.result});
    const h=this.current(),play=this.phase==='player'&&h?.status==='active';$('#bjHit',this.root).disabled=!play;$('#bjStand',this.root).disabled=!play;$('#bjDouble',this.root).disabled=!play||h.cards.length!==2||this.app.profile.data.balance<h.bet;$('#bjSplit',this.root).disabled=!play||this.hands.length!==1||h.cards.length!==2||h.cards[0].rank!==h.cards[1].rank||this.app.profile.data.balance<h.bet;$('#bjDeal',this.root).disabled=this.phase!=='betting'||this.busy;$('#bjBet',this.root).textContent=formatL(this.bet);$$('[data-chip]',this.root).forEach(b=>b.classList.toggle('active',Number(b.dataset.chip)===this.bet));
    const messages={betting:['BETを選んでDEAL','BLACKJACK PAYS 3 TO 2'],player:[`HAND ${this.active+1} — 行動を選択`,`現在 ${h?handValue(h.cards).total:'—'}`],dealer:['DEALER TURN','カードを公開しています'],settled:['ROUND COMPLETE','次のラウンドを準備中']};const msg=messages[this.phase]||messages.betting;$('#bjStatus',this.root).textContent=msg[0];$('#bjSub',this.root).textContent=msg[1]
  }
}

const WHEEL_ORDER=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_NUMBERS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const normalizeAngle=a=>((a%360)+360)%360;
const polarPoint=(cx,cy,r,deg)=>{const a=deg*Math.PI/180;return{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r}};
function rouletteArcPath(cx,cy,rOuter,rInner,start,end){const a=polarPoint(cx,cy,rOuter,start),b=polarPoint(cx,cy,rOuter,end),c=polarPoint(cx,cy,rInner,end),d=polarPoint(cx,cy,rInner,start);return`M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${rOuter} ${rOuter} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} L${c.x.toFixed(2)} ${c.y.toFixed(2)} A${rInner} ${rInner} 0 0 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)}Z`}
function precisionRouletteSvg(){
  const step=360/37,pockets=WHEEL_ORDER.map((n,i)=>{const center=-90+i*step,start=center-step/2,end=center+step/2,pos=polarPoint(250,250,188,center),fill=n===0?'#177552':RED_NUMBERS.has(n)?'#9d2840':'#17141a';return`<g class="roulette-pocket" data-wheel-number="${n}"><path d="${rouletteArcPath(250,250,222,154,start,end)}" fill="${fill}"/><line x1="${polarPoint(250,250,154,start).x}" y1="${polarPoint(250,250,154,start).y}" x2="${polarPoint(250,250,222,start).x}" y2="${polarPoint(250,250,222,start).y}"/><text x="${pos.x}" y="${pos.y}" transform="rotate(${center+90} ${pos.x} ${pos.y})">${n}</text></g>`}).join('');
  return`<svg id="roulettePrecisionSvg" class="roulette-precision-svg" viewBox="0 0 500 500" role="img" aria-label="欧州式ルーレットホイール"><defs><radialGradient id="rwWood"><stop stop-color="#e0b25d"/><stop offset=".35" stop-color="#8a4a19"/><stop offset=".7" stop-color="#3d180d"/><stop offset="1" stop-color="#14070a"/></radialGradient><radialGradient id="rwHub"><stop stop-color="#fff0ae"/><stop offset=".25" stop-color="#c7842d"/><stop offset=".58" stop-color="#4c210f"/><stop offset="1" stop-color="#16090b"/></radialGradient><radialGradient id="rwBall"><stop stop-color="#fff"/><stop offset=".4" stop-color="#fff6cf"/><stop offset=".72" stop-color="#b8a77e"/><stop offset="1" stop-color="#595044"/></radialGradient><filter id="rwShadow"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-opacity=".6"/></filter><filter id="rwGlow"><feGaussianBlur stdDeviation="5"/></filter></defs><circle cx="250" cy="250" r="244" fill="url(#rwWood)" stroke="#f0ca76" stroke-width="4"/><circle cx="250" cy="250" r="230" fill="#25100c" stroke="#7a421a" stroke-width="6"/><g id="rouletteRotor" filter="url(#rwShadow)">${pockets}<circle cx="250" cy="250" r="150" fill="url(#rwHub)" stroke="#e5bd67" stroke-width="5"/><circle cx="250" cy="250" r="101" fill="#180b11" stroke="#5f3318" stroke-width="13"/><circle cx="250" cy="250" r="72" fill="url(#rwHub)"/><path d="M250 187 264 227 307 250 264 273 250 313 236 273 193 250 236 227Z" fill="#2b130d" stroke="#f0cf7e" stroke-width="4"/><circle cx="250" cy="250" r="20" fill="#d7a94e" stroke="#fff0ad" stroke-width="4"/></g><g id="rouletteBallLayer"><circle id="rouletteBallGlow" cx="250" cy="29" r="18" fill="#fff1a8" opacity=".22" filter="url(#rwGlow)"/><circle id="rouletteBallSvg" cx="250" cy="29" r="10" fill="url(#rwBall)" stroke="#fff7d0" stroke-width="2" filter="url(#rwShadow)"/></g><path class="roulette-pointer" d="M250 1 238 26H262Z" fill="#fff2aa" stroke="#8e501b" stroke-width="2"/></svg>`
}
class RouletteGame extends GameBase {
  constructor(app,mount){super(app,mount);this.chip=500;this.bets=new Map();this.betOrder=[];this.spinning=false;this.history=[...(app.profile.data.gameState.rouletteHistory||[])].slice(0,20);this.lastBets=null;this.wheelAngle=0;this.ballAngle=-90;this.ballRadius=221;this.spinFrame=0;this.lastResult=null}
  mount(){
    this.root.innerHTML=`<div class="game-stage roulette-stage precision"><div class="table-status"><b id="rouletteStatus">チップをテーブルへ置いてください</b><small>PRECISION SVG WHEEL · SINGLE ZERO</small></div><section class="roulette-left"><div class="roulette-machine precision-machine">${precisionRouletteSvg()}</div><div class="roulette-result"><strong id="rouletteResult">—</strong><span id="rouletteResultSub">THE WHEEL IS WAITING</span></div><div id="rouletteHistory" class="roulette-history"></div><div id="rouletteStats" class="roulette-stats"></div></section><section class="roulette-board-wrap"><div id="rouletteBoard" class="roulette-board"></div><div id="rouletteOutside" class="outside-board"></div><div id="rouletteBetSummary" class="roulette-bet-summary">BETを置くと内訳が表示されます</div><div class="roulette-controls"><button id="rouletteClear" class="table-button" type="button">CLEAR</button><button id="rouletteUndo" class="table-button" type="button">UNDO</button><button id="rouletteRepeat" class="table-button" type="button">REPEAT</button><button id="rouletteSpin" class="table-button primary" type="button">SPIN THE WHEEL</button></div></section><div class="bet-dock">${this.chipSelector(this.chip)}<div class="bet-readout"><small>ON TABLE</small><strong id="rouletteBet">0 L</strong></div></div></div>`;
    this.buildBoard();this.bindChips(this.root,v=>{if(this.spinning)return;this.chip=v;this.render()});$('#rouletteClear',this.root).addEventListener('click',()=>this.clear());$('#rouletteUndo',this.root).addEventListener('click',()=>this.undo());$('#rouletteRepeat',this.root).addEventListener('click',()=>this.repeat());$('#rouletteSpin',this.root).addEventListener('click',()=>this.spin());this.setWheel(this.wheelAngle);this.setBall(this.ballAngle,this.ballRadius);this.render()
  }
  buildBoard(){
    const board=$('#rouletteBoard',this.root);board.innerHTML=`<button class="roulette-cell green zero-cell" data-bet="n:0" type="button">0</button>`;for(let n=1;n<=36;n++){const cell=document.createElement('button');cell.type='button';cell.className=`roulette-cell ${RED_NUMBERS.has(n)?'red':'black'}`;cell.textContent=n;cell.dataset.bet=`n:${n}`;cell.style.gridColumn=String(Math.ceil(n/3)+1);cell.style.gridRow=String(4-(((n-1)%3)+1));board.appendChild(cell)}
    const outs=[['dozen:1','1st 12'],['dozen:2','2nd 12'],['dozen:3','3rd 12'],['column:1','COLUMN 1'],['column:2','COLUMN 2'],['column:3','COLUMN 3'],['range:low','1–18'],['parity:even','EVEN'],['color:red','RED','redbet'],['color:black','BLACK','blackbet'],['parity:odd','ODD'],['range:high','19–36']];$('#rouletteOutside',this.root).innerHTML=outs.map(x=>`<button data-bet="${x[0]}" class="${x[2]||''}" type="button">${x[1]}</button>`).join('');$$('[data-bet]',this.root).forEach(b=>b.addEventListener('click',()=>this.place(b.dataset.bet)))
  }
  total(){return[...this.bets.values()].reduce((a,b)=>a+b,0)}
  place(key){if(this.spinning)return;if(this.total()+this.chip>this.app.profile.data.balance){this.app.toast('プレイコイン不足','テーブル上の合計が残高を超えています。','L');return}this.bets.set(key,(this.bets.get(key)||0)+this.chip);this.betOrder.push({key,amount:this.chip});this.app.audio.play('chip');this.render()}
  clear(){if(this.spinning)return;this.bets.clear();this.betOrder=[];this.app.audio.play('click');this.render()}
  undo(){if(this.spinning||!this.betOrder.length)return;const item=this.betOrder.pop(),next=(this.bets.get(item.key)||0)-item.amount;if(next>0)this.bets.set(item.key,next);else this.bets.delete(item.key);this.app.audio.play('chip');this.render()}
  repeat(){if(this.spinning||!this.lastBets)return;const total=[...this.lastBets.values()].reduce((a,b)=>a+b,0);if(total>this.app.profile.data.balance){this.app.toast('REPEATできません','前回のBET合計が現在の残高を超えています。','L');return}this.bets=new Map(this.lastBets);this.betOrder=[...this.bets].flatMap(([key,amount])=>[{key,amount}]);this.render()}
  wins(key,n){if(key.startsWith('n:'))return Number(key.split(':')[1])===n?36:0;if(n===0)return 0;const[type,val]=key.split(':');if(type==='color')return(val==='red')===RED_NUMBERS.has(n)?2:0;if(type==='parity')return(n%2===0?'even':'odd')===val?2:0;if(type==='range')return(val==='low'?n<=18:n>=19)?2:0;if(type==='dozen')return Math.ceil(n/12)===Number(val)?3:0;if(type==='column')return((n-1)%3)+1===Number(val)?3:0;return 0}
  setWheel(angle){const rotor=$('#rouletteRotor',this.root);if(rotor)rotor.setAttribute('transform',`rotate(${angle} 250 250)`)}
  setBall(angle,radius){const p=polarPoint(250,250,radius,angle);for(const id of ['#rouletteBallSvg','#rouletteBallGlow']){const el=$(id,this.root);if(el){el.setAttribute('cx',p.x.toFixed(2));el.setAttribute('cy',p.y.toFixed(2))}}}
  animateWheel(idx,duration){
    return new Promise(resolve=>{const step=360/37,startTime=performance.now(),startWheel=this.wheelAngle,startBall=this.ballAngle,endWheel=startWheel+(this.app.profile.data.settings.reducedMotion?720:2520+randomInt(3)*360)+randomInt(37)*step,pocketLocal=-90+idx*step,targetMod=normalizeAngle(pocketLocal+endWheel);let endBall=targetMod;const turns=this.app.profile.data.settings.reducedMotion?2:9;while(endBall>startBall-turns*360)endBall-=360;const frame=now=>{if(this.disposed)return resolve();const t=clamp((now-startTime)/duration,0,1),wheelEase=1-Math.pow(1-t,4),ballEase=1-Math.pow(1-t,3),wheel=startWheel+(endWheel-startWheel)*wheelEase,ball=startBall+(endBall-startBall)*ballEase,settle=1-Math.pow(1-t,2),bounce=t>.82?Math.sin((t-.82)/.18*Math.PI*3)*(1-t)*12:0,radius=221-(33*settle)+bounce;this.setWheel(wheel);this.setBall(ball,radius);if(t<1){this.spinFrame=requestAnimationFrame(frame)}else{this.wheelAngle=normalizeAngle(endWheel);this.ballAngle=targetMod;this.ballRadius=188;this.setWheel(this.wheelAngle);this.setBall(this.ballAngle,this.ballRadius);resolve()}};this.spinFrame=requestAnimationFrame(frame)})
  }
  async spin(){
    if(this.spinning)return;const wager=this.total();if(!wager){this.app.toast('BETがありません','数字または外側のエリアへチップを置いてください。','◉');return}if(!this.app.profile.spend(wager))return;this.spinning=true;this.lastBets=new Map(this.bets);this.clearHighlight();const result=randomInt(37),idx=WHEEL_ORDER.indexOf(result),duration=this.app.profile.data.settings.reducedMotion?700:5200;$('#rouletteStatus',this.root).textContent='ホイールと玉が運命を選んでいます';$('#rouletteSpin',this.root).disabled=true;this.app.audio.play('spin');await this.animateWheel(idx,duration);if(this.disposed)return;this.app.audio.play('stop');navigator.vibrate?.(35);let payout=0,straight=false;for(const[key,amt]of this.bets){const multi=this.wins(key,result);if(multi){payout+=Math.floor(amt*multi);if(key===`n:${result}`)straight=true}}
    if(straight){this.app.profile.data.stats.rouletteStraights++;this.app.profile.unlock('rouletteStraight');this.app.profile.unlockRelic('straightComet')}if(result===0){this.app.profile.data.stats.rouletteZeros++;this.app.profile.unlockRelic('zeroStar')}const color=result===0?'GREEN':RED_NUMBERS.has(result)?'RED':'BLACK';$('#rouletteResult',this.root).textContent=`${result} · ${color}`;$('#rouletteResultSub',this.root).textContent=payout?`${formatL(payout)} RETURN`:'THE HOUSE TAKES THIS ROUND';$('#rouletteStatus',this.root).textContent=`RESULT · ${result} ${color}`;this.history.unshift(result);this.history=this.history.slice(0,20);this.app.profile.data.gameState.rouletteHistory=this.history;this.lastResult=result;this.highlightResult(result);this.app.recordRound({game:'roulette',wager,payout,label:straight?'STRAIGHT UP!':'ROULETTE WIN',detail:`${result} ${color}`,events:straight?[{event:'rouletteStraight'}]:[]});this.bets.clear();this.betOrder=[];this.spinning=false;this.render();this.setTimeout(()=>{$('#rouletteStatus',this.root).textContent='次のBETを置いてください'},1500)
  }
  clearHighlight(){$$('.roulette-pocket.win-pocket',this.root).forEach(x=>x.classList.remove('win-pocket'));$$('.roulette-cell.winner',this.root).forEach(x=>x.classList.remove('winner'))}
  highlightResult(n){this.clearHighlight();$(`.roulette-pocket[data-wheel-number="${n}"]`,this.root)?.classList.add('win-pocket');$(`[data-bet="n:${n}"]`,this.root)?.classList.add('winner')}
  betLabel(key){if(key.startsWith('n:'))return`NUMBER ${key.split(':')[1]}`;const map={'dozen:1':'1st 12','dozen:2':'2nd 12','dozen:3':'3rd 12','column:1':'COLUMN 1','column:2':'COLUMN 2','column:3':'COLUMN 3','range:low':'1–18','range:high':'19–36','parity:even':'EVEN','parity:odd':'ODD','color:red':'RED','color:black':'BLACK'};return map[key]||key}
  render(){
    const total=this.total();$('#rouletteBet',this.root).textContent=formatL(total);$$('[data-chip]',this.root).forEach(b=>b.classList.toggle('active',Number(b.dataset.chip)===this.chip));$$('[data-bet]',this.root).forEach(b=>{b.querySelector('.bet-marker')?.remove();const amt=this.bets.get(b.dataset.bet);if(amt){const m=document.createElement('span');m.className='bet-marker';m.textContent=amt>=1000?`${amt/1000}K`:amt;b.appendChild(m)}});$('#rouletteClear',this.root).disabled=this.spinning||!total;$('#rouletteUndo',this.root).disabled=this.spinning||!this.betOrder.length;$('#rouletteRepeat',this.root).disabled=this.spinning||!this.lastBets;$('#rouletteSpin',this.root).disabled=this.spinning||!total;$('#rouletteHistory',this.root).innerHTML=this.history.slice(0,12).map(n=>`<span class="history-ball ${n===0?'green':RED_NUMBERS.has(n)?'red':''}">${n}</span>`).join('');const counts=new Map();this.history.forEach(n=>counts.set(n,(counts.get(n)||0)+1));const hot=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,3);$('#rouletteStats',this.root).innerHTML=`<span>HOT</span>${hot.length?hot.map(([n,c])=>`<b>${n}<i>×${c}</i></b>`).join(''):'<small>履歴なし</small>'}`;$('#rouletteBetSummary',this.root).innerHTML=this.bets.size?[...this.bets].map(([k,v])=>`<span><b>${this.betLabel(k)}</b>${formatL(v)}</span>`).join(''):'BETを置くと内訳が表示されます';if(this.lastResult!=null)this.highlightResult(this.lastResult)
  }
  unmount(){cancelAnimationFrame(this.spinFrame);super.unmount()}
}

const SLOT_SYMBOLS = [
  {id:'WILD',name:'WILD',weight:2},{id:'SCATTER',name:'SCATTER',weight:3},{id:'CROWN',name:'王冠',weight:6},{id:'MOON',name:'月',weight:8},{id:'DIAMOND',name:'蒼玉',weight:10},{id:'ROSE',name:'薔薇',weight:13},{id:'BELL',name:'鐘',weight:16},{id:'STAR',name:'星',weight:20}
];
const SLOT_PAY={WILD:{3:15,4:60,5:250},CROWN:{3:8,4:30,5:120},MOON:{3:6,4:20,5:80},DIAMOND:{3:5,4:15,5:55},ROSE:{3:4,4:12,5:40},BELL:{3:3,4:9,5:30},STAR:{3:2,4:6,5:20}};
const PAYLINES=[[0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0]];
const slotName=id=>SLOT_SYMBOLS.find(x=>x.id===id)?.name||id;
function slotSymbolSvg(symbol){
  const id=`g${uid().replace(/-/g,'').slice(0,8)}`,common=`xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true"`;
  if(symbol==='WILD')return`<svg ${common}><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff7c4"/><stop offset=".45" stop-color="#eab65b"/><stop offset="1" stop-color="#7e3d93"/></linearGradient></defs><circle cx="50" cy="50" r="42" fill="#3f1c59" stroke="url(#${id})" stroke-width="5"/><path d="M18 29 31 73 46 38 60 73 82 27" fill="none" stroke="url(#${id})" stroke-width="10" stroke-linejoin="round"/><circle cx="76" cy="20" r="6" fill="#fff4a2"/><text x="50" y="91" text-anchor="middle" font-family="Georgia" font-size="10" fill="#fff1b0" letter-spacing="3">WILD</text></svg>`;
  if(symbol==='SCATTER')return`<svg ${common}><defs><radialGradient id="${id}"><stop stop-color="#fff"/><stop offset=".25" stop-color="#c8fbff"/><stop offset="1" stop-color="#3484aa"/></radialGradient></defs><circle cx="50" cy="50" r="37" fill="none" stroke="#d9fbff" stroke-width="3" stroke-dasharray="5 7"/><path d="M50 7 59 38 91 50 59 61 50 93 40 61 9 50 40 38Z" fill="url(#${id})" stroke="#fffbd3" stroke-width="2"/><circle cx="50" cy="50" r="8" fill="#fff"/><text x="50" y="88" text-anchor="middle" font-family="Georgia" font-size="8" fill="#174b70" letter-spacing="2">SCATTER</text></svg>`;
  if(symbol==='CROWN')return`<svg ${common}><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff6b6"/><stop offset=".55" stop-color="#dfad43"/><stop offset="1" stop-color="#8a4f16"/></linearGradient></defs><path d="M14 32 34 51 50 18 66 51 87 31 78 75H22Z" fill="url(#${id})" stroke="#7d4513" stroke-width="3"/><path d="M24 67H76L73 80H27Z" fill="#f5d77e" stroke="#7d4513" stroke-width="3"/><circle cx="50" cy="51" r="7" fill="#a84a84"/><circle cx="28" cy="57" r="5" fill="#4e8fbd"/><circle cx="72" cy="57" r="5" fill="#4e8fbd"/></svg>`;
  if(symbol==='MOON')return`<svg ${common}><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffad5"/><stop offset=".5" stop-color="#cdbdf1"/><stop offset="1" stop-color="#71549f"/></linearGradient></defs><path d="M70 14A39 39 0 1 0 79 76 31 31 0 1 1 70 14Z" fill="url(#${id})" stroke="#5f447f" stroke-width="3"/><circle cx="34" cy="35" r="4" fill="#927cb1"/><circle cx="45" cy="67" r="6" fill="#927cb1"/><path d="M72 15 76 26 88 30 77 34 73 45 69 34 58 30 69 26Z" fill="#ffe478"/></svg>`;
  if(symbol==='DIAMOND')return`<svg ${common}><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4ffff"/><stop offset=".35" stop-color="#78dce7"/><stop offset="1" stop-color="#4769c1"/></linearGradient></defs><path d="M22 34 37 15H64L80 34 50 86Z" fill="url(#${id})" stroke="#275990" stroke-width="3"/><path d="M22 34H80M37 15 50 34 64 15M50 34V86M22 34 50 86 80 34" fill="none" stroke="#e6ffff" stroke-opacity=".7" stroke-width="2"/></svg>`;
  if(symbol==='ROSE')return`<svg ${common}><defs><radialGradient id="${id}"><stop stop-color="#ff9fb1"/><stop offset=".55" stop-color="#c63255"/><stop offset="1" stop-color="#63162b"/></radialGradient></defs><path d="M49 89C42 72 43 57 50 43" fill="none" stroke="#277244" stroke-width="6"/><path d="M47 70C32 66 29 57 28 50 41 51 48 58 47 70ZM49 77C62 72 68 66 72 55 58 56 51 64 49 77Z" fill="#3c9a5d"/><circle cx="50" cy="38" r="23" fill="url(#${id})"/><path d="M50 17C58 28 58 48 50 60M28 38C40 32 60 32 72 38M34 24C47 29 59 46 64 55M66 24C53 29 41 46 36 55" fill="none" stroke="#ffb8c4" stroke-opacity=".55" stroke-width="3"/></svg>`;
  if(symbol==='BELL')return`<svg ${common}><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff3a6"/><stop offset=".55" stop-color="#d69b2f"/><stop offset="1" stop-color="#754214"/></linearGradient></defs><path d="M27 68C35 56 31 42 36 29 42 13 59 13 65 29 70 42 66 56 75 68Z" fill="url(#${id})" stroke="#754214" stroke-width="3"/><path d="M21 68H81L75 78H27Z" fill="#eab74f" stroke="#754214" stroke-width="3"/><circle cx="51" cy="81" r="8" fill="#9c5d1d"/><path d="M44 17C45 8 58 8 59 17" fill="none" stroke="#d9a746" stroke-width="6"/></svg>`;
  return`<svg ${common}><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff9bc"/><stop offset=".5" stop-color="#f2c74f"/><stop offset="1" stop-color="#bd6b24"/></linearGradient></defs><path d="M50 8 61 37 92 39 68 58 76 89 50 72 23 89 32 58 8 39 39 37Z" fill="url(#${id})" stroke="#995219" stroke-width="3"/><path d="M50 24 57 43 76 45 61 56 66 75 50 65 34 75 39 56 24 45 43 43Z" fill="#fff1a2" opacity=".7"/></svg>`
}
class SlotsGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=500;this.freeSpins=0;this.spinning=false;this.grid=this.randomGrid();this.lastWin=0;this.winningLines=[];this.winPositions=new Set();this.breakdown=[];this.turbo=false;this.autoRemaining=0;this.paytableOpen=false}
  randomSymbol(){const total=SLOT_SYMBOLS.reduce((a,x)=>a+x.weight,0);let r=cryptoFloat()*total;for(const x of SLOT_SYMBOLS){r-=x.weight;if(r<=0)return x.id}return'STAR'}
  randomGrid(){return Array.from({length:5},()=>Array.from({length:3},()=>this.randomSymbol()))}
  paytableHtml(){return`<aside id="slotPaytable" class="slot-paytable"><div class="slot-pay-head"><div><small>CELESTIAL ODDS</small><h3>配当表</h3></div><button id="slotPayClose" type="button">×</button></div><p>倍率 × 1ラインBET（TOTAL BET ÷ 10）</p><div class="slot-pay-columns"><span>絵柄</span><b>3</b><b>4</b><b>5</b></div>${['WILD','CROWN','MOON','DIAMOND','ROSE','BELL','STAR'].map(id=>`<div class="slot-pay-row"><i>${slotSymbolSvg(id)}</i><span>${slotName(id)}</span><b>×${SLOT_PAY[id][3]}</b><b>×${SLOT_PAY[id][4]}</b><b>×${SLOT_PAY[id][5]}</b></div>`).join('')}<div class="scatter-pay"><i>${slotSymbolSvg('SCATTER')}</i><div><b>SCATTER</b><span>3個: ×2＋5 FREE</span><span>4個: ×8＋10 FREE</span><span>5個: ×25＋15 FREE</span></div></div><div class="cascade-help"><b>CASCADE</b><span>当選絵柄が消え、次の連鎖は倍率アップ。FREE SPINは×2から開始。</span></div></aside>`}
  mount(){
    const lineSvg=PAYLINES.map((line,i)=>`<polyline id="payline-${i}" class="payline" points="${line.map((r,c)=>`${10+c*20},${16.7+r*33.3}`).join(' ')}" fill="none"/>`).join('');this.root.innerHTML=`<div class="game-stage slots-stage upgraded"><div class="table-status"><b id="slotStatus">星界金庫が目覚めています</b><small>CASCADE · WILD · SCATTER · FREE SPINS</small></div><div class="slots-layout"><div class="slot-cabinet"><div class="slot-marquee"><small>LUX NOCTIS PRESENTS</small><h3>CELESTIAL VAULT</h3><div class="slot-tool-row"><button id="slotPayToggle" type="button">PAY TABLE</button><button id="slotTurbo" type="button">TURBO OFF</button><button id="slotAuto" type="button">AUTO ×10</button></div></div><div class="reel-window"><div id="reelsGrid" class="reels-grid"></div><svg class="payline-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">${lineSvg}</svg><div id="cascadeBadge" class="cascade-badge" hidden>CASCADE ×1</div></div><div id="slotWinBanner" class="slot-win-banner"></div><div id="slotBreakdown" class="slot-breakdown"><span>当選するとライン別の内訳を表示します</span></div><div class="slot-info-bar"><div><small>TOTAL BET</small><strong id="slotBetText">${formatL(this.bet)}</strong></div><div><small>LINE BET</small><strong id="slotLineBet">${formatL(this.bet/10)}</strong></div><div><small>FREE SPINS</small><strong id="slotFreeText">0</strong></div><button id="slotSpin" class="spin-button" type="button">SPIN</button><div class="bet-stepper"><button id="slotBetDown" type="button">−</button><div><small>BET LEVEL</small><strong id="slotBetLevel">${formatL(this.bet)}</strong></div><button id="slotBetUp" type="button">＋</button></div></div></div>${this.paytableHtml()}</div></div>`;
    $('#slotSpin',this.root).addEventListener('click',()=>this.spin());$('#slotBetDown',this.root).addEventListener('click',()=>this.stepBet(-1));$('#slotBetUp',this.root).addEventListener('click',()=>this.stepBet(1));$('#slotTurbo',this.root).addEventListener('click',()=>{if(this.spinning)return;this.turbo=!this.turbo;this.renderInfo()});$('#slotAuto',this.root).addEventListener('click',()=>this.toggleAuto());$('#slotPayToggle',this.root).addEventListener('click',()=>this.togglePaytable());$('#slotPayClose',this.root).addEventListener('click',()=>this.togglePaytable(false));this.renderGrid();this.renderInfo()
  }
  stepBet(dir){if(this.spinning||this.autoRemaining)return;const vals=[100,500,1000,2500,5000],i=vals.indexOf(this.bet);this.bet=vals[clamp(i+dir,0,vals.length-1)];this.app.audio.play('chip');this.renderInfo()}
  togglePaytable(force){this.paytableOpen=force??!this.paytableOpen;$('#slotPaytable',this.root).classList.toggle('open',this.paytableOpen)}
  toggleAuto(){if(this.spinning&&this.autoRemaining){this.autoRemaining=0;this.renderInfo();return}if(this.autoRemaining){this.autoRemaining=0}else{this.autoRemaining=10;this.spin()}this.renderInfo()}
  renderReel(col,values=this.grid[col],spinning=false){const reel=$(`#slotReel${col}`,this.root);if(!reel)return;reel.classList.toggle('spinning',spinning);reel.innerHTML=values.map((x,r)=>`<div class="slot-symbol ${x==='WILD'?'wild':x==='SCATTER'?'scatter':''} ${this.winPositions.has(`${col}-${r}`)?'win':''}" data-pos="${col}-${r}">${slotSymbolSvg(x)}</div>`).join('')}
  renderGrid(){const mount=$('#reelsGrid',this.root);if(!mount)return;mount.innerHTML=this.grid.map((col,c)=>`<div id="slotReel${c}" class="slot-reel">${col.map((x,r)=>`<div class="slot-symbol ${x==='WILD'?'wild':x==='SCATTER'?'scatter':''} ${this.winPositions.has(`${c}-${r}`)?'win':''}">${slotSymbolSvg(x)}</div>`).join('')}</div>`).join('');for(let i=0;i<PAYLINES.length;i++)$(`#payline-${i}`,this.root)?.classList.toggle('show',this.winningLines.includes(i))}
  evaluateLines(grid){
    const lineBet=this.bet/PAYLINES.length,wins=[],positions=new Set();PAYLINES.forEach((rows,index)=>{const seq=rows.map((r,c)=>grid[c][r]);let base=seq[0];if(base==='SCATTER')return;if(base==='WILD'){const non=seq.find(x=>x!=='WILD'&&x!=='SCATTER');base=non||'WILD'}let count=0;for(let c=0;c<5;c++){const x=seq[c];if(x===base||x==='WILD')count++;else break}if(count>=3&&SLOT_PAY[base]?.[count]){const raw=Math.floor(lineBet*SLOT_PAY[base][count]);const pos=[];for(let c=0;c<count;c++){const key=`${c}-${rows[c]}`;positions.add(key);pos.push(key)}wins.push({line:index+1,index,symbol:base,count,raw,positions:pos})}});return{wins,positions}
  }
  evaluateScatter(grid){const positions=[];for(let c=0;c<5;c++)for(let r=0;r<3;r++)if(grid[c][r]==='SCATTER')positions.push(`${c}-${r}`);const count=positions.length;if(count<3)return{count,positions,payout:0,free:0};return{count,positions,payout:this.bet*({3:2,4:8,5:25}[Math.min(5,count)]),free:{3:5,4:10,5:15}[Math.min(5,count)]}}
  cascadeGrid(positions){for(let c=0;c<5;c++){const kept=this.grid[c].filter((_,r)=>!positions.has(`${c}-${r}`));while(kept.length<3)kept.unshift(this.randomSymbol());this.grid[c]=kept}}
  async animateReels(finalGrid){const intervals=[];for(let c=0;c<5;c++){const reel=$(`#slotReel${c}`,this.root);reel.classList.add('spinning');intervals[c]=this.setInterval(()=>this.renderReel(c,Array.from({length:3},()=>this.randomSymbol()),true),this.turbo?45:70)}for(let c=0;c<5;c++){await wait(this.app.profile.data.settings.reducedMotion?45:this.turbo?110+c*50:400+c*160);if(this.disposed)return;clearInterval(intervals[c]);this.grid[c]=finalGrid[c];this.renderReel(c,this.grid[c],false);this.app.audio.play('stop')}}
  renderBreakdown(){const el=$('#slotBreakdown',this.root);if(!this.breakdown.length){el.innerHTML='<span>当選するとライン別の内訳を表示します</span>';return}el.innerHTML=this.breakdown.map(x=>x.type==='scatter'?`<div class="slot-win-row scatter"><b>SCATTER ×${x.count}</b><span>FREE ${x.free}</span><strong>${formatL(x.pay)}</strong></div>`:`<div class="slot-win-row"><b>LINE ${x.line} · ${slotName(x.symbol)} ×${x.count}</b><span>基本 ${formatL(x.raw)} · CASCADE ×${x.mult}</span><strong>${formatL(x.pay)}</strong></div>`).join('')}
  async spin(){
    if(this.spinning)return;const isFree=this.freeSpins>0;if(!isFree&&!this.canAfford(this.bet)){this.autoRemaining=0;this.renderInfo();return}if(!isFree&&!this.app.profile.spend(this.bet)){this.autoRemaining=0;return}if(isFree)this.freeSpins--;else if(this.autoRemaining>0)this.autoRemaining--;this.spinning=true;this.winningLines=[];this.winPositions.clear();this.breakdown=[];this.lastWin=0;this.renderInfo();$('#slotWinBanner',this.root).textContent='';$('#slotStatus',this.root).textContent=isFree?'FREE SPIN — 星が落ち始めました':'金庫の輪が回り始めました';this.app.audio.play('spin');await this.animateReels(this.randomGrid());if(this.disposed)return;
    const scatter=this.evaluateScatter(this.grid);let payout=scatter.payout;if(scatter.payout)this.breakdown.push({type:'scatter',count:scatter.count,free:scatter.free,pay:scatter.payout});if(scatter.free){this.freeSpins+=scatter.free;this.app.profile.data.stats.freeSpins+=scatter.free;this.app.profile.unlock('freeSpins');this.app.profile.progress('freeSpins',1);this.app.toast('FREE SPINS',`${scatter.free}回の無料回転を獲得しました。`,'☾')}
    let cascade=0,maxCascade=0;while(cascade<5){const result=this.evaluateLines(this.grid);if(!result.wins.length)break;const mult=(isFree?2:1)+cascade;maxCascade=Math.max(maxCascade,mult);this.winningLines=result.wins.map(x=>x.index);this.winPositions=result.positions;let stepPay=0;for(const w of result.wins){const pay=w.raw*mult;stepPay+=pay;this.breakdown.push({...w,mult,pay})}payout+=stepPay;$('#cascadeBadge',this.root).hidden=false;$('#cascadeBadge',this.root).textContent=`CASCADE ×${mult}`;this.renderGrid();this.renderBreakdown();this.app.audio.play(cascade>=2?'bigwin':'win');await wait(this.app.profile.data.settings.reducedMotion?80:this.turbo?220:720);if(this.disposed)return;cascade++;if(cascade>=5)break;this.cascadeGrid(result.positions);this.winningLines=[];this.winPositions.clear();this.renderGrid();await wait(this.turbo?80:260)}
    $('#cascadeBadge',this.root).hidden=true;this.lastWin=payout;this.app.profile.data.stats.slotCascades+=cascade;this.app.profile.data.stats.maxCascade=Math.max(this.app.profile.data.stats.maxCascade,maxCascade);if(cascade>=3)this.app.profile.unlock('cascade');if(cascade>=4)this.app.profile.unlockRelic('cascadeCore');if(cascade)this.app.profile.progress('slotCascade',cascade);this.winningLines=[];this.winPositions=new Set(scatter.payout?scatter.positions:[]);this.renderGrid();this.renderBreakdown();const wager=isFree?0:this.bet;this.app.recordRound({game:'slots',wager,payout,label:scatter.free?'SCATTER BONUS':payout>=this.bet*10?'MEGA CASCADE':'VAULT WIN',detail:cascade?`${cascade} CASCADES`:'SCATTER',events:[]});
    if(payout){$('#slotWinBanner',this.root).textContent=`WIN  ${formatL(payout)}`;$('#slotStatus',this.root).textContent=cascade>=3?'星々が連鎖し、金庫が崩れ落ちました！':'配当ラインが輝いています'}else{$('#slotWinBanner',this.root).textContent='NO WIN';$('#slotStatus',this.root).textContent='次の星を探してください'}this.spinning=false;this.renderInfo();if(this.freeSpins>0||this.autoRemaining>0)this.setTimeout(()=>this.spin(),this.app.profile.data.settings.reducedMotion?100:this.turbo?260:900)
  }
  renderInfo(){if(!$('#slotBetText',this.root))return;$('#slotBetText',this.root).textContent=formatL(this.bet);$('#slotLineBet',this.root).textContent=formatL(this.bet/10);$('#slotBetLevel',this.root).textContent=formatL(this.bet);$('#slotFreeText',this.root).textContent=this.freeSpins;$('#slotSpin',this.root).textContent=this.freeSpins>0?'FREE':'SPIN';$('#slotSpin',this.root).disabled=this.spinning;$('#slotBetDown',this.root).disabled=this.spinning||this.autoRemaining||this.bet===100;$('#slotBetUp',this.root).disabled=this.spinning||this.autoRemaining||this.bet===5000;$('#slotTurbo',this.root).textContent=`TURBO ${this.turbo?'ON':'OFF'}`;$('#slotTurbo',this.root).classList.toggle('active',this.turbo);$('#slotAuto',this.root).textContent=this.autoRemaining?`STOP · ${this.autoRemaining}`:'AUTO ×10';$('#slotAuto',this.root).classList.toggle('active',!!this.autoRemaining)}
}

const SICBO_TOTAL_PAY={4:51,5:31,6:19,7:13,8:9,9:7,10:6,11:6,12:7,13:9,14:13,15:19,16:31,17:51};
const DICE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function dieHtml(value){return`<div class="sic-die" data-value="${value}">${Array.from({length:9},(_,i)=>`<i class="${DICE_PIPS[value].includes(i)?'on':''}"></i>`).join('')}</div>`}
class SicBoGame extends GameBase {
  constructor(app,mount){super(app,mount);this.chip=500;this.bets=new Map();this.order=[];this.rolling=false;this.dice=[1,2,3];this.lastBreakdown=[]}
  mount(){
    const totals=Array.from({length:14},(_,i)=>i+4).map(n=>`<button data-sic-bet="total:${n}" type="button"><b>${n}</b><small>×${SICBO_TOTAL_PAY[n]}</small></button>`).join(''),doubles=Array.from({length:6},(_,i)=>i+1).map(n=>`<button data-sic-bet="double:${n}" type="button"><b>${n}${n}</b><small>×11</small></button>`).join(''),triples=Array.from({length:6},(_,i)=>i+1).map(n=>`<button data-sic-bet="triple:${n}" type="button"><b>${n}${n}${n}</b><small>×181</small></button>`).join(''),singles=Array.from({length:6},(_,i)=>i+1).map(n=>`<button data-sic-bet="single:${n}" type="button"><b>${n}</b><small>×2–4</small></button>`).join('');
    this.root.innerHTML=`<div class="game-stage sicbo-stage"><div class="table-status"><b id="sicStatus">黒曜石のテーブルへBETしてください</b><small>THREE DICE · BIG · SMALL · TOTAL · TRIPLES</small></div><section class="sicbo-display"><div id="sicDice" class="sic-dice">${this.dice.map(dieHtml).join('')}</div><div class="sic-result"><strong id="sicTotal">TOTAL 6</strong><span id="sicPattern">1 · 2 · 3</span></div><div id="sicBreakdown" class="sic-breakdown"></div></section><section class="sicbo-board"><div class="sic-main-bets"><button data-sic-bet="small" type="button"><b>SMALL</b><small>4–10 · ×2</small></button><button data-sic-bet="odd" type="button"><b>ODD</b><small>×2</small></button><button data-sic-bet="even" type="button"><b>EVEN</b><small>×2</small></button><button data-sic-bet="big" type="button"><b>BIG</b><small>11–17 · ×2</small></button></div><div class="sic-section"><h3>TOTAL</h3><div class="sic-total-grid">${totals}</div></div><div class="sic-section split"><div><h3>DOUBLE</h3><div class="sic-six-grid">${doubles}</div></div><div><h3>SPECIFIC TRIPLE</h3><div class="sic-six-grid">${triples}</div></div></div><div class="sic-section"><h3>ANY TRIPLE</h3><button class="sic-any-triple" data-sic-bet="anyTriple" type="button"><b>ANY TRIPLE</b><small>×31</small></button></div><div class="sic-section"><h3>SINGLE NUMBER</h3><div class="sic-six-grid singles">${singles}</div></div><div class="sic-controls"><button id="sicClear" class="table-button" type="button">CLEAR</button><button id="sicUndo" class="table-button" type="button">UNDO</button><button id="sicRoll" class="table-button primary" type="button">ROLL THE DICE</button></div></section><div class="bet-dock">${this.chipSelector(this.chip)}<div class="bet-readout"><small>ON TABLE</small><strong id="sicBetTotal">0 L</strong></div></div></div>`;
    this.bindChips(this.root,v=>{if(!this.rolling){this.chip=v;this.render()}});$$('[data-sic-bet]',this.root).forEach(b=>b.addEventListener('click',()=>this.place(b.dataset.sicBet)));$('#sicClear',this.root).addEventListener('click',()=>this.clear());$('#sicUndo',this.root).addEventListener('click',()=>this.undo());$('#sicRoll',this.root).addEventListener('click',()=>this.roll());this.render()
  }
  total(){return[...this.bets.values()].reduce((a,b)=>a+b,0)}
  place(key){if(this.rolling)return;if(this.total()+this.chip>this.app.profile.data.balance){this.app.toast('プレイコイン不足','BET合計が残高を超えています。','L');return}this.bets.set(key,(this.bets.get(key)||0)+this.chip);this.order.push({key,amount:this.chip});this.app.audio.play('chip');this.render()}
  clear(){if(this.rolling)return;this.bets.clear();this.order=[];this.render()}
  undo(){if(this.rolling||!this.order.length)return;const x=this.order.pop(),v=(this.bets.get(x.key)||0)-x.amount;if(v>0)this.bets.set(x.key,v);else this.bets.delete(x.key);this.render()}
  multiplier(key,dice){const sum=dice.reduce((a,b)=>a+b,0),triple=dice[0]===dice[1]&&dice[1]===dice[2];if(key==='small')return!triple&&sum>=4&&sum<=10?2:0;if(key==='big')return!triple&&sum>=11&&sum<=17?2:0;if(key==='odd')return!triple&&sum%2?2:0;if(key==='even')return!triple&&sum%2===0?2:0;if(key==='anyTriple')return triple?31:0;const[type,valRaw]=key.split(':'),val=Number(valRaw);if(type==='total')return sum===val?SICBO_TOTAL_PAY[val]:0;if(type==='double')return dice.filter(x=>x===val).length>=2?11:0;if(type==='triple')return triple&&dice[0]===val?181:0;if(type==='single'){const count=dice.filter(x=>x===val).length;return count?count+1:0}return 0}
  async roll(){
    if(this.rolling)return;const wager=this.total();if(!wager){this.app.toast('BETがありません','テーブルへチップを置いてください。','⚄');return}if(!this.app.profile.spend(wager))return;this.rolling=true;this.lastBreakdown=[];$('#sicStatus',this.root).textContent='黒曜石の骰子が転がっています';this.render();const final=[1+randomInt(6),1+randomInt(6),1+randomInt(6)],ticks=this.app.profile.data.settings.reducedMotion?2:18;for(let i=0;i<ticks;i++){this.dice=[1+randomInt(6),1+randomInt(6),1+randomInt(6)];this.renderDice();this.app.audio.play('chip');await wait(this.app.profile.data.settings.reducedMotion?40:60+i*3);if(this.disposed)return}for(let i=0;i<3;i++){this.dice[i]=final[i];this.renderDice();this.app.audio.play('stop');await wait(this.app.profile.data.settings.reducedMotion?30:180)}
    const sum=final.reduce((a,b)=>a+b,0),triple=final[0]===final[1]&&final[1]===final[2];let payout=0;for(const[key,amt]of this.bets){const multi=this.multiplier(key,final);if(multi){const pay=amt*multi;payout+=pay;this.lastBreakdown.push({key,amt,multi,pay})}}if(payout)this.app.profile.data.stats.sicboWins++;if(triple){this.app.profile.data.stats.sicboTriples++;this.app.profile.unlock('sicboTriple');this.app.profile.unlockRelic('tripleObsidian')}this.app.recordRound({game:'sicbo',wager,payout,label:triple?'OBSIDIAN TRIPLE':'SIC BO WIN',detail:`${final.join(' · ')} = ${sum}`,events:[{event:'sicboRound'}]});$('#sicStatus',this.root).textContent=payout?`${formatL(payout)} RETURN`:'次の運命を選んでください';this.bets.clear();this.order=[];this.rolling=false;this.render()
  }
  label(key){const map={small:'SMALL',big:'BIG',odd:'ODD',even:'EVEN',anyTriple:'ANY TRIPLE'};if(map[key])return map[key];const[t,v]=key.split(':');return`${t.toUpperCase()} ${v}`}
  renderDice(){$('#sicDice',this.root).innerHTML=this.dice.map(dieHtml).join('');$('#sicTotal',this.root).textContent=`TOTAL ${this.dice.reduce((a,b)=>a+b,0)}`;$('#sicPattern',this.root).textContent=this.dice.join(' · ')}
  render(){this.renderDice();const total=this.total();$('#sicBetTotal',this.root).textContent=formatL(total);$$('[data-chip]',this.root).forEach(b=>b.classList.toggle('active',Number(b.dataset.chip)===this.chip));$$('[data-sic-bet]',this.root).forEach(b=>{b.querySelector('.bet-marker')?.remove();const amt=this.bets.get(b.dataset.sicBet);if(amt){const m=document.createElement('span');m.className='bet-marker';m.textContent=amt>=1000?`${amt/1000}K`:amt;b.appendChild(m)}b.disabled=this.rolling});$('#sicClear',this.root).disabled=this.rolling||!total;$('#sicUndo',this.root).disabled=this.rolling||!this.order.length;$('#sicRoll',this.root).disabled=this.rolling||!total;$('#sicBreakdown',this.root).innerHTML=this.lastBreakdown.length?this.lastBreakdown.map(x=>`<span><b>${this.label(x.key)} ×${x.multi}</b>${formatL(x.pay)}</span>`).join(''):'<small>当選内訳はここに表示されます</small>'}
}

const KENO_PAY={5:{2:2,3:3,4:10,5:80},6:{3:3,4:14,5:80,6:800},7:{3:2,4:6,5:35,6:200,7:1500},8:{4:3,5:28,6:200,7:1500,8:10000},9:{4:2,5:14,6:80,7:500,8:4000,9:20000},10:{4:1,5:5,6:40,7:300,8:4000,9:20000,10:100000}};
class KenoGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=500;this.picks=new Set((app.profile.data.gameState.kenoPicks||[]).filter(n=>n>=1&&n<=40).slice(0,10));this.drawn=[];this.revealed=new Set();this.busy=false;this.lastMatches=0;this.lastPayout=0}
  mount(){
    this.root.innerHTML=`<div class="game-stage keno-stage"><div class="table-status"><b id="kenoStatus">5〜10個の星を選んでください</b><small>FORTY STARS · TEN ORACLE BALLS</small></div><section class="keno-console"><div class="keno-draw"><p class="eyebrow">ORACLE DRAW</p><div id="kenoBalls" class="keno-balls">${Array.from({length:10},()=>'<span>—</span>').join('')}</div><div class="keno-result"><strong id="kenoHits">0 HIT</strong><span id="kenoReturn">THE ORACLE IS SILENT</span></div></div><div id="kenoBoard" class="keno-board">${Array.from({length:40},(_,i)=>`<button data-keno-number="${i+1}" type="button">${i+1}</button>`).join('')}</div><div class="keno-actions"><button id="kenoQuick" class="table-button" type="button">QUICK PICK 8</button><button id="kenoClear" class="table-button" type="button">CLEAR</button><button id="kenoDraw" class="table-button primary" type="button">DRAW 10 BALLS</button></div></section><aside class="keno-paytable"><div><p class="eyebrow">CURRENT TICKET</p><h3 id="kenoSpotTitle">0 SPOTS</h3><small id="kenoPickHint">あと5個選択</small></div><div id="kenoPayRows" class="keno-pay-rows"></div></aside><div class="bet-dock">${this.chipSelector(this.bet,null,[100,500,1000,2500,5000])}<div class="bet-readout"><small>YOUR BET</small><strong id="kenoBetText">${formatL(this.bet)}</strong></div></div></div>`;
    this.bindChips(this.root,v=>{if(!this.busy){this.bet=v;this.render()}});$$('[data-keno-number]',this.root).forEach(b=>b.addEventListener('click',()=>this.toggle(Number(b.dataset.kenoNumber))));$('#kenoQuick',this.root).addEventListener('click',()=>this.quickPick());$('#kenoClear',this.root).addEventListener('click',()=>{if(!this.busy){this.picks.clear();this.drawn=[];this.revealed.clear();this.savePicks();this.render()}});$('#kenoDraw',this.root).addEventListener('click',()=>this.draw());this.render()
  }
  savePicks(){this.app.profile.data.gameState.kenoPicks=[...this.picks];this.app.profile.save()}
  toggle(n){if(this.busy)return;if(this.picks.has(n))this.picks.delete(n);else{if(this.picks.size>=10){this.app.toast('最大10個です','選択中の数字を1つ外してください。','◎');return}this.picks.add(n)}this.drawn=[];this.revealed.clear();this.savePicks();this.app.audio.play('click');this.render()}
  quickPick(){if(this.busy)return;this.picks=new Set(shuffled(Array.from({length:40},(_,i)=>i+1)).slice(0,8));this.drawn=[];this.revealed.clear();this.savePicks();this.app.audio.play('chime');this.render()}
  async draw(){
    if(this.busy)return;const spots=this.picks.size;if(spots<5||spots>10){this.app.toast('5〜10個選んでください',`現在は${spots}個です。`,'◎');return}if(!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.busy=true;this.drawn=shuffled(Array.from({length:40},(_,i)=>i+1)).slice(0,10);this.revealed.clear();this.lastMatches=0;this.lastPayout=0;$('#kenoStatus',this.root).textContent='予言球を読み上げています';this.render();for(const n of this.drawn){await wait(this.app.profile.data.settings.reducedMotion?45:220);if(this.disposed)return;this.revealed.add(n);this.app.audio.play('stop');this.render()}
    const matches=this.drawn.filter(n=>this.picks.has(n)).length,multi=KENO_PAY[spots]?.[matches]||0,payout=this.bet*multi;this.lastMatches=matches;this.lastPayout=payout;this.app.profile.data.stats.kenoBest=Math.max(this.app.profile.data.stats.kenoBest,matches);if(matches>=4)this.app.profile.progress('kenoFour',1);if(matches>=6){this.app.profile.unlock('kenoSix');this.app.profile.unlockRelic('oracleLens')}this.app.recordRound({game:'keno',wager:this.bet,payout,label:matches>=7?'ORACLE REVELATION':'KENO WIN',detail:`${matches} / ${spots} HIT`,events:[]});$('#kenoStatus',this.root).textContent=payout?`${matches} HIT · ${formatL(payout)} RETURN`:`${matches} HIT · 次の予言へ`;this.busy=false;this.render()
  }
  render(){
    $$('[data-keno-number]',this.root).forEach(b=>{const n=Number(b.dataset.kenoNumber),picked=this.picks.has(n),drawn=this.revealed.has(n);b.classList.toggle('picked',picked);b.classList.toggle('drawn',drawn);b.classList.toggle('hit',picked&&drawn);b.disabled=this.busy});const balls=$$('#kenoBalls span',this.root);balls.forEach((b,i)=>{const n=this.drawn[i];b.textContent=n&&this.revealed.has(n)?n:'—';b.className=n&&this.revealed.has(n)?(this.picks.has(n)?'hit':'drawn'):''});const spots=this.picks.size;$('#kenoSpotTitle',this.root).textContent=`${spots} SPOTS`;$('#kenoPickHint',this.root).textContent=spots<5?`あと${5-spots}個選択`:spots<=10?'抽選可能':'最大10個';$('#kenoHits',this.root).textContent=`${this.lastMatches} HIT`;$('#kenoReturn',this.root).textContent=this.lastPayout?`${formatL(this.lastPayout)} RETURN`:'THE ORACLE IS SILENT';$('#kenoBetText',this.root).textContent=formatL(this.bet);$$('[data-chip]',this.root).forEach(b=>b.classList.toggle('active',Number(b.dataset.chip)===this.bet));$('#kenoQuick',this.root).disabled=this.busy;$('#kenoClear',this.root).disabled=this.busy||!spots;$('#kenoDraw',this.root).disabled=this.busy||spots<5||spots>10;const pay=KENO_PAY[spots];$('#kenoPayRows',this.root).innerHTML=pay?Object.entries(pay).map(([hits,m])=>`<div class="${Number(hits)===this.lastMatches&&this.lastPayout?'active':''}"><span>${hits} HIT</span><b>×${m}</b><strong>${formatL(this.bet*m)}</strong></div>`).join(''):'<p>5個以上選ぶと配当表を表示します。</p>'
  }
}

const baccaratCardValue = card => card.rank==='A'?1:['10','J','Q','K'].includes(card.rank)?0:Number(card.rank);
const baccaratTotal = cards => cards.reduce((a,c)=>a+baccaratCardValue(c),0)%10;
class BaccaratGame extends GameBase {
  constructor(app,mount){super(app,mount);this.chip=500;this.bets=new Map();this.phase='betting';this.shoe=makeDeck(8);this.player=[];this.banker=[];this.resultText=''}
  mount(){
    this.root.innerHTML=`<div class="game-stage baccarat-stage"><div class="table-status"><b id="bacStatus">賭け先を選んでください</b><small>PLAYER · BANKER · TIE · PAIRS</small></div><div class="baccarat-table"><section class="baccarat-hand player-hand-b"><h3>PLAYER</h3><div id="bacPlayerCards" class="card-row"></div><span id="bacPlayerScore" class="score-orb">—</span></section><div class="baccarat-center">VS</div><section class="baccarat-hand banker-hand-b"><h3>BANKER</h3><div id="bacBankerCards" class="card-row"></div><span id="bacBankerScore" class="score-orb">—</span></section><div id="bacResultBanner" class="baccarat-result-banner" hidden></div></div><div id="baccaratBets" class="baccarat-bets"><button class="baccarat-bet player" data-bac-bet="player" type="button"><b>PLAYER</b><small>PAYS 1:1</small></button><button class="baccarat-bet" data-bac-bet="playerPair" type="button"><b>PLAYER PAIR</b><small>PAYS 11:1</small></button><button class="baccarat-bet tie" data-bac-bet="tie" type="button"><b>TIE</b><small>PAYS 8:1</small></button><button class="baccarat-bet" data-bac-bet="bankerPair" type="button"><b>BANKER PAIR</b><small>PAYS 11:1</small></button><button class="baccarat-bet banker" data-bac-bet="banker" type="button"><b>BANKER</b><small>PAYS 0.95:1</small></button></div><div class="bet-dock">${this.chipSelector(this.chip)}<div class="bet-readout"><small>ON TABLE</small><strong id="bacBetTotal">0 L</strong></div><button id="bacClear" class="table-button" type="button">CLEAR</button><button id="bacDeal" class="table-button primary" type="button">DEAL</button></div></div>`;
    this.bindChips(this.root,v=>{if(this.phase!=='betting')return;this.chip=v;this.render()});$$('[data-bac-bet]',this.root).forEach(b=>b.addEventListener('click',()=>this.place(b.dataset.bacBet)));$('#bacClear',this.root).addEventListener('click',()=>{if(this.phase==='betting'){this.bets.clear();this.app.audio.play('click');this.render()}});$('#bacDeal',this.root).addEventListener('click',()=>this.deal());this.render()
  }
  draw(){if(this.shoe.length<70)this.shoe=makeDeck(8);return this.shoe.pop()}
  totalBet(){return [...this.bets.values()].reduce((a,b)=>a+b,0)}
  place(key){if(this.phase!=='betting')return;if(this.totalBet()+this.chip>this.app.profile.data.balance){this.app.toast('プレイコイン不足','テーブル上のBET合計が残高を超えています。','L');return}this.bets.set(key,(this.bets.get(key)||0)+this.chip);this.app.audio.play('chip');this.render()}
  bankerDraws(b,pThird){const t=baccaratTotal(b);if(pThird==null)return t<=5;const v=baccaratCardValue(pThird);if(t<=2)return true;if(t===3)return v!==8;if(t===4)return v>=2&&v<=7;if(t===5)return v>=4&&v<=7;if(t===6)return v===6||v===7;return false}
  async addCard(side){if(this.disposed)return null;const card=this.draw();this[side].push(card);this.app.audio.play('card');this.renderHands();await wait(this.app.profile.data.settings.reducedMotion?35:360);return this.disposed?null:card}
  async deal(){
    if(this.phase!=='betting'||this.busy)return;const wager=this.totalBet();if(!wager){this.app.toast('BETがありません','PLAYER、BANKER、TIEなどを選んでください。','♦');return}if(!this.app.profile.spend(wager))return;this.phase='dealing';this.busy=true;this.shoe=makeDeck(8);this.player=[];this.banker=[];this.resultText='';$('#bacResultBanner',this.root).hidden=true;$('#bacStatus',this.root).textContent='カードを配っています';this.render();
    await this.addCard('player');if(this.disposed)return;await this.addCard('banker');if(this.disposed)return;await this.addCard('player');if(this.disposed)return;await this.addCard('banker');if(this.disposed)return;let pt=baccaratTotal(this.player),bt=baccaratTotal(this.banker),pThird=null;
    if(pt<8&&bt<8){if(pt<=5){pThird=await this.addCard('player');if(this.disposed)return}if(this.bankerDraws(this.banker,pThird)){await this.addCard('banker');if(this.disposed)return}}
    pt=baccaratTotal(this.player);bt=baccaratTotal(this.banker);const outcome=pt===bt?'tie':pt>bt?'player':'banker';const playerPair=this.player[0].rank===this.player[1].rank,bankerPair=this.banker[0].rank===this.banker[1].rank;let payout=0;
    for(const [key,amt] of this.bets){if(key==='player'){if(outcome==='player')payout+=amt*2;else if(outcome==='tie')payout+=amt}if(key==='banker'){if(outcome==='banker')payout+=Math.floor(amt*1.95);else if(outcome==='tie')payout+=amt}if(key==='tie'&&outcome==='tie')payout+=amt*9;if(key==='playerPair'&&playerPair)payout+=amt*12;if(key==='bankerPair'&&bankerPair)payout+=amt*12}
    if(outcome==='tie'){this.app.profile.data.stats.baccaratTies++;this.app.profile.unlockRelic('velvetKnot')}this.resultText=outcome==='player'?'PLAYER WINS':outcome==='banker'?'BANKER WINS':'TIE';$('#bacResultBanner',this.root).textContent=this.resultText;$('#bacResultBanner',this.root).hidden=false;$('#bacStatus',this.root).textContent=`${this.resultText} · ${pt} : ${bt}`;this.phase='result';this.app.recordRound({game:'baccarat',wager,payout,label:outcome==='tie'?'VELVET TIE':'BACCARAT WIN',detail:`PLAYER ${pt} · BANKER ${bt}`,events:[{event:'baccaratRound'}]});this.busy=false;this.render();this.setTimeout(()=>{this.bets.clear();this.player=[];this.banker=[];this.resultText='';this.phase='betting';$('#bacResultBanner',this.root).hidden=true;this.render();$('#bacStatus',this.root).textContent='賭け先を選んでください'},this.app.profile.data.settings.reducedMotion?600:2600)
  }
  renderHands(){if(!$('#bacPlayerCards',this.root))return;syncCardRow($('#bacPlayerCards',this.root),this.player);syncCardRow($('#bacBankerCards',this.root),this.banker);$('#bacPlayerScore',this.root).textContent=this.player.length?baccaratTotal(this.player):'—';$('#bacBankerScore',this.root).textContent=this.banker.length?baccaratTotal(this.banker):'—'}
  render(){
    if(!$('#bacBetTotal',this.root))return;this.renderHands();const total=this.totalBet();$('#bacBetTotal',this.root).textContent=formatL(total);$$('[data-chip]',this.root).forEach(b=>b.classList.toggle('active',Number(b.dataset.chip)===this.chip));$$('[data-bac-bet]',this.root).forEach(b=>{b.querySelector('.bet-marker')?.remove();const amt=this.bets.get(b.dataset.bacBet);if(amt){const m=document.createElement('span');m.className='bet-marker';m.textContent=amt>=1000?`${amt/1000}K`:amt;b.appendChild(m)}});$('#bacClear',this.root).disabled=this.phase!=='betting'||!total;$('#bacDeal',this.root).disabled=this.phase!=='betting'||!total;$$('[data-bac-bet]',this.root).forEach(b=>b.disabled=this.phase!=='betting')
  }
}

const POKER_HANDS=[
  {id:'royal',name:'ROYAL FLUSH',jp:'ロイヤルフラッシュ',pay:800,rank:9},
  {id:'straightFlush',name:'STRAIGHT FLUSH',jp:'ストレートフラッシュ',pay:50,rank:8},
  {id:'four',name:'FOUR OF A KIND',jp:'フォーカード',pay:25,rank:7},
  {id:'fullHouse',name:'FULL HOUSE',jp:'フルハウス',pay:9,rank:6},
  {id:'flush',name:'FLUSH',jp:'フラッシュ',pay:6,rank:5},
  {id:'straight',name:'STRAIGHT',jp:'ストレート',pay:4,rank:4},
  {id:'three',name:'THREE OF A KIND',jp:'スリーカード',pay:3,rank:3},
  {id:'twoPair',name:'TWO PAIR',jp:'ツーペア',pay:2,rank:2},
  {id:'jacks',name:'JACKS OR BETTER',jp:'ジャックス・オア・ベター',pay:1,rank:1},
  {id:'none',name:'NO WIN',jp:'役なし',pay:0,rank:0}
];
function evaluatePoker(cards){
  const vals=cards.map(c=>c.rank==='A'?14:RANKS_CARDS.indexOf(c.rank)+1).sort((a,b)=>a-b), suits=new Set(cards.map(c=>c.suit)), counts=new Map();vals.forEach(v=>counts.set(v,(counts.get(v)||0)+1));const groups=[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);const flush=suits.size===1;let unique=[...new Set(vals)],straight=false,high=0;if(unique.length===5){if(unique[4]-unique[0]===4){straight=true;high=unique[4]}else if(unique.join(',')==='2,3,4,5,14'){straight=true;high=5}}
  let id='none';if(flush&&straight&&high===14&&unique.includes(10))id='royal';else if(flush&&straight)id='straightFlush';else if(groups[0][1]===4)id='four';else if(groups[0][1]===3&&groups[1][1]===2)id='fullHouse';else if(flush)id='flush';else if(straight)id='straight';else if(groups[0][1]===3)id='three';else if(groups[0][1]===2&&groups[1][1]===2)id='twoPair';else if(groups[0][1]===2&&groups[0][0]>=11)id='jacks';return POKER_HANDS.find(h=>h.id===id)
}
class PokerGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=500;this.phase='betting';this.deck=[];this.cards=[];this.held=[false,false,false,false,false];this.result=null}
  paytableHtml(cls='poker-paytable'){return `<div class="${cls}"><h3>PAY TABLE</h3>${POKER_HANDS.filter(x=>x.pay).map(x=>`<div><span>${x.name}</span><b>x${x.pay}</b></div>`).join('')}</div>`}
  mount(){
    this.root.innerHTML=`<div class="game-stage poker-stage"><div class="table-status"><b id="pokerStatus">BETを選んでDEAL</b><small>JACKS OR BETTER · ONE DRAW</small></div>${this.paytableHtml()}${this.paytableHtml('poker-paytable-mobile')}<div id="pokerHand" class="poker-hand"></div><div class="poker-message"><strong id="pokerMessage">ROYAL DRAW</strong><small id="pokerSub">カードを5枚配ります</small></div><div class="poker-controls"><button id="pokerAction" class="table-button primary" type="button">DEAL</button></div><div class="bet-dock">${this.chipSelector(this.bet,null,[100,500,1000,2500,5000])}<div class="bet-readout"><small>YOUR BET</small><strong id="pokerBetText">${formatL(this.bet)}</strong></div></div></div>`;
    this.bindChips(this.root,v=>{if(this.phase!=='betting')return;this.bet=v;this.render()});$('#pokerAction',this.root).addEventListener('click',()=>{if(this.phase==='betting')this.deal();else if(this.phase==='holding')this.draw();else if(this.phase==='result')this.resetRound()});this.render()
  }
  async deal(){
    if(this.phase!=='betting'||this.busy||!this.canAfford(this.bet))return;if(!this.app.profile.spend(this.bet))return;this.busy=true;this.deck=makeDeck(1);this.cards=[];this.held=[false,false,false,false,false];this.result=null;this.phase='dealing';this.render();for(let i=0;i<5;i++){this.cards.push(this.deck.pop());this.app.audio.play('card');this.renderCards();await wait(this.app.profile.data.settings.reducedMotion?35:160);if(this.disposed)return}this.phase='holding';this.busy=false;this.render()
  }
  toggleHold(i){if(this.phase!=='holding')return;this.held[i]=!this.held[i];this.app.audio.play('hold');this.renderCards()}
  async draw(){
    if(this.phase!=='holding'||this.busy)return;this.busy=true;this.phase='drawing';this.render();for(let i=0;i<5;i++){if(!this.held[i]){this.cards[i]=this.deck.pop();this.app.audio.play('card');this.renderCards();await wait(this.app.profile.data.settings.reducedMotion?35:180);if(this.disposed)return}}this.result=evaluatePoker(this.cards);const payout=this.bet*this.result.pay;const priorRank=this.app.profile.data.stats.pokerBestRank||0;if(this.result.rank>priorRank){this.app.profile.data.stats.pokerBestRank=this.result.rank;this.app.profile.data.stats.pokerBest=this.result.jp}const events=[];if(this.result.rank>=2)events.push({event:'pokerGood'});if(this.result.rank>=5)this.app.profile.unlock('pokerFlush');if(this.result.id==='royal')this.app.profile.unlockRelic('royalSeal');this.phase='result';this.busy=false;this.app.recordRound({game:'poker',wager:this.bet,payout,label:this.result.rank>=8?this.result.name:'ROYAL DRAW WIN',detail:this.result.jp,events});this.render();
  }
  resetRound(){this.phase='betting';this.cards=[];this.held=[false,false,false,false,false];this.result=null;this.render()}
  renderCards(){
    const mount=$('#pokerHand',this.root);if(!mount)return;
    while(mount.children.length<5){const wrap=document.createElement('div');wrap.className='poker-card-wrap';wrap.dataset.cardIndex=String(mount.children.length);wrap.addEventListener('click',()=>this.toggleHold(Number(wrap.dataset.cardIndex)));mount.appendChild(wrap)}
    [...mount.children].forEach((wrap,i)=>{wrap.classList.toggle('held',Boolean(this.held[i]));const card=this.cards[i];if(card)syncCardRow(wrap,[card]);else{const placeholderKey='placeholder';if(wrap.firstElementChild?.dataset?.cardKey!==placeholderKey){wrap.innerHTML='<div class="playing-card face-down card-placeholder" data-card-key="placeholder" aria-hidden="true"></div>'}}})
  }
  render(){
    if(!$('#pokerAction',this.root))return;this.renderCards();$$('[data-chip]',this.root).forEach(b=>b.classList.toggle('active',Number(b.dataset.chip)===this.bet));$('#pokerBetText',this.root).textContent=formatL(this.bet);const action=$('#pokerAction',this.root),status=$('#pokerStatus',this.root),msg=$('#pokerMessage',this.root),sub=$('#pokerSub',this.root);action.disabled=this.busy;
    if(this.phase==='betting'){action.textContent='DEAL';status.textContent='BETを選んでDEAL';msg.textContent='ROYAL DRAW';sub.textContent='カードを5枚配ります'}
    if(this.phase==='dealing'){action.textContent='DEALING…';status.textContent='カードを配っています';msg.textContent='THE DECK IS OPENING';sub.textContent='';}
    if(this.phase==='holding'){action.textContent='DRAW';status.textContent='残すカードを選んでDRAW';msg.textContent='SELECT YOUR HOLD';sub.textContent='カードをタップするとHOLDできます'}
    if(this.phase==='drawing'){action.textContent='DRAWING…';status.textContent='カードを引き直しています';msg.textContent='ONE FINAL DRAW';sub.textContent='';}
    if(this.phase==='result'){action.textContent='NEW HAND';status.textContent=this.result.name;msg.textContent=this.result.name;sub.textContent=this.result.pay?`${formatL(this.bet*this.result.pay)} RETURN`:'次のハンドへ'}
  }
}

// Public bridge for optional first-party expansion modules.
window.__LUX_CORE__ = {
  $, $$, clamp, wait, fmt, formatL, dateKey, cryptoFloat, randomInt, choice, shuffled, escapeHtml,
  NIGHT_EVENTS, RANKS_CARDS, makeDeck, cardHtml, syncCardRow, handValue, GAME_META,
  ProfileStore, RoomClient, CasinoApp, GameBase,
  BlackjackGame, RouletteGame, SlotsGame, BaccaratGame, PokerGame, SicBoGame, KenoGame,
  WHEEL_ORDER, RED_NUMBERS, DICE_PIPS
};

// App start
const app = new CasinoApp();
window.__LUX_CORE__.app = app;

})();
