(() => {
'use strict';

const core = window.__LUX_CORE__;
const app = window.__LUX_NOCTIS__;
if (!core || !app) return;

const {
  $, $$, clamp, wait, fmt, formatL, dateKey, cryptoFloat, randomInt, choice, shuffled, escapeHtml,
  RANKS_CARDS, makeDeck, syncCardRow, GAME_META, ProfileStore, CasinoApp, GameBase
} = core;

const SOVEREIGN_VERSION = 6;
const NEW_GAME_IDS = ['threecard','derby','ascent','arcana','moonshot'];
const NEW_GAME_NAMES = {
  threecard:'SERAPH THREE CARD',
  derby:'PHANTOM DERBY',
  ascent:'ECLIPSE ASCENT',
  arcana:'ARCANA MATCH',
  moonshot:'MOONSHOT DARTS'
};
const NEW_GAME_JP = {
  threecard:'3カードポーカー',derby:'ファントム競馬',ascent:'エクリプス・アセント',arcana:'アルカナ記憶札',moonshot:'ムーンショット'
};
const NEW_GAME_ICONS = {threecard:'3',derby:'♞',ascent:'▲',arcana:'▦',moonshot:'◎'};
const BASE_GAME_IDS = ['blackjack','roulette','slots','baccarat','poker','sicbo','keno','craps','dragon','wheel','mines','plinko','hilo','holdem','war','bingo','tower','scratch'];
const ALL_GAMES = [...BASE_GAME_IDS,...NEW_GAME_IDS];
const ALL_NAMES = {
  blackjack:'NOCTURNE BLACKJACK',roulette:'STELLAR ROULETTE',slots:'CELESTIAL VAULT',baccarat:'VELVET BACCARAT',poker:'ROYAL DRAW',sicbo:'OBSIDIAN SIC BO',keno:'ORACLE KENO',craps:'MOONSTONE CRAPS',dragon:'DRAGON & TIGER',wheel:'FORTUNE CONSTELLATION',mines:'ABYSSAL MINES',plinko:'STARFALL PLINKO',hilo:'MIDNIGHT HI-LO',holdem:"ECLIPSE HOLD'EM",war:'CROWN WAR',bingo:'LUNAR BINGO',tower:'OBSIDIAN TOWER',scratch:'MIDNIGHT SCRATCH',
  ...NEW_GAME_NAMES
};
const ALL_JP = {
  blackjack:'ブラックジャック',roulette:'ルーレット',slots:'スロット',baccarat:'バカラ',poker:'ビデオポーカー',sicbo:'SIC BO',keno:'KENO',craps:'クラップス',dragon:'ドラゴンタイガー',wheel:'星座ホイール',mines:'マインズ',plinko:'PLINKO',hilo:'HI-LO',holdem:'ホールデム',war:'カジノ・ウォー',bingo:'ビンゴ',tower:'タワー',scratch:'スクラッチ',
  ...NEW_GAME_JP
};
const ALL_ICONS = {
  blackjack:'♠',roulette:'◉',slots:'☾',baccarat:'B',poker:'♛',sicbo:'⚄',keno:'◎',craps:'⚂',dragon:'龍',wheel:'✺',mines:'◇',plinko:'✦',hilo:'↕',holdem:'H',war:'⚔',bingo:'▦',tower:'♜',scratch:'✧',
  ...NEW_GAME_ICONS
};
const GAME_CATEGORIES = {
  blackjack:'cards',baccarat:'cards',poker:'cards',dragon:'cards',hilo:'cards',holdem:'cards',war:'cards',threecard:'cards',
  roulette:'wheels',wheel:'wheels',derby:'wheels',
  sicbo:'dice',craps:'dice',keno:'dice',
  slots:'arcade',mines:'arcade',plinko:'arcade',bingo:'arcade',tower:'arcade',scratch:'arcade',ascent:'arcade',arcana:'arcade',moonshot:'arcade'
};

Object.assign(GAME_META, {
  threecard:{short:'3 CARD',eyebrow:'ANTE · PLAY · PAIR PLUS',title:'SERAPH THREE CARD',help:`<h3>セラフ・スリーカード</h3><p>3枚だけで役を作る高速ポーカーです。ANTEを置き、手札を見てPLAYまたはFOLD。PAIR PLUSはディーラーに関係なく自分の役だけで決まります。</p><div class="rule-grid"><div class="rule"><b>DEALER QUALIFY</b>Qハイ以上で成立</div><div class="rule"><b>PLAY</b>ANTEと同額を追加</div><div class="rule"><b>PAIR PLUS</b>ペア以上で独立配当</div><div class="rule"><b>HAND ORDER</b>ストレートフラッシュ ＞ スリーカード ＞ ストレート ＞ フラッシュ ＞ ペア</div></div>`},
  derby:{short:'DERBY',eyebrow:'SIX PHANTOMS · LIVE ODDS',title:'PHANTOM DERBY',help:`<h3>亡霊競走</h3><p>6頭のファントムから勝者を選ぶレースです。各馬のLIVE ODDSとFORMを確認してBETし、最後の直線を見届けます。</p><div class="rule-grid"><div class="rule"><b>WIN BET</b>選んだ馬が1着なら表示オッズで返却</div><div class="rule"><b>FORM</b>そのレースでの相対的な調子</div><div class="rule"><b>UNDERDOG</b>高オッズほど勝率は低いが高配当</div><div class="rule"><b>PHOTO FINISH</b>着順はスタート時に一度だけ確定</div></div>`},
  ascent:{short:'ASCENT',eyebrow:'RISING MULTIPLIER · CASH OUT',title:'ECLIPSE ASCENT',help:`<h3>星蝕上昇</h3><p>倍率が上昇している間にCASH OUTします。星蝕が崩壊すると、そのラウンドのBETは失われます。</p><div class="rule-grid"><div class="rule"><b>START</b>崩壊倍率はラウンド開始時に内部確定</div><div class="rule"><b>CASH OUT</b>表示中の倍率で即時確定</div><div class="rule"><b>AUTO</b>指定倍率へ到達すると自動回収</div><div class="rule"><b>PLAY MONEY</b>購入・換金・譲渡はできません</div></div>`},
  arcana:{short:'ARCANA',eyebrow:'MEMORY · SIXTEEN SEALED CARDS',title:'ARCANA MATCH',help:`<h3>アルカナ記憶札</h3><p>16枚に隠れた8組の紋章を制限時間内にそろえる、技量型の宮殿ゲームです。</p><div class="rule-grid"><div class="rule"><b>PREVIEW</b>開始時に短時間だけ全札を公開</div><div class="rule"><b>MATCH</b>同じ紋章を2枚選ぶ</div><div class="rule"><b>RETURN</b>残り時間と少ない手数ほど高配当</div><div class="rule"><b>TIME OUT</b>45秒で未完成なら敗北</div></div>`},
  moonshot:{short:'DARTS',eyebrow:'THREE THROWS · SCORE TABLE SKILL',title:'MOONSHOT DARTS',help:`<h3>月輪ダーツ</h3><p>動く照準を見てTHROW。3投の合計点で配当が決まるタイミングゲームです。</p><div class="rule-grid"><div class="rule"><b>BULL</b>中心へ近いほど高得点</div><div class="rule"><b>THREE THROWS</b>1ラウンド3投</div><div class="rule"><b>300 SCORE</b>完全試合で最大配当</div><div class="rule"><b>TOUCH</b>盤面タップまたはTHROWボタン</div></div>`}
});

const seededHash = text => [...String(text)].reduce((a,c)=>Math.imul(a^c.charCodeAt(0),16777619)>>>0,2166136261);
const seededRandom = seed => () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed), ((seed ^ seed >>> 14) >>> 0) / 4294967296));
const rankValue = rank => rank==='A'?14:rank==='K'?13:rank==='Q'?12:rank==='J'?11:Number(rank);
const weightedPick = list => {const total=list.reduce((a,x)=>a+Number(x.weight||1),0);let r=cryptoFloat()*total;for(const x of list){r-=Number(x.weight||1);if(r<=0)return x}return list.at(-1)};

// ---------- SERAPH THREE CARD ----------
const THREE_HANDS = [
  {id:'straightFlush',name:'STRAIGHT FLUSH',rank:6,pairPay:40,anteBonus:5},
  {id:'three',name:'THREE OF A KIND',rank:5,pairPay:30,anteBonus:4},
  {id:'straight',name:'STRAIGHT',rank:4,pairPay:6,anteBonus:1},
  {id:'flush',name:'FLUSH',rank:3,pairPay:3,anteBonus:0},
  {id:'pair',name:'PAIR',rank:2,pairPay:1,anteBonus:0},
  {id:'high',name:'HIGH CARD',rank:1,pairPay:0,anteBonus:0}
];
function evaluateThree(cards){
  const values=cards.map(c=>rankValue(c.rank)).sort((a,b)=>a-b),counts=new Map();values.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  const groups=[...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);const flush=new Set(cards.map(c=>c.suit)).size===1;
  let straight=false,straightHigh=values.at(-1);if(new Set(values).size===3){if(values[2]-values[0]===2)straight=true;else if(values.join(',')==='2,3,14'){straight=true;straightHigh=3}}
  let id='high';if(straight&&flush)id='straightFlush';else if(groups[0][1]===3)id='three';else if(straight)id='straight';else if(flush)id='flush';else if(groups[0][1]===2)id='pair';
  const def=THREE_HANDS.find(x=>x.id===id);let tie=[];
  if(id==='straightFlush'||id==='straight')tie=[straightHigh];
  else if(id==='three')tie=[groups[0][0]];
  else if(id==='pair'){const pair=groups.find(x=>x[1]===2)[0],kick=groups.find(x=>x[1]===1)[0];tie=[pair,kick]}
  else tie=[...values].sort((a,b)=>b-a);
  return {...def,tie,qualifies:def.rank>1||tie[0]>=12};
}
function compareThree(a,b){if(a.rank!==b.rank)return Math.sign(a.rank-b.rank);for(let i=0;i<Math.max(a.tie.length,b.tie.length);i++){const d=(a.tie[i]||0)-(b.tie[i]||0);if(d)return Math.sign(d)}return 0}

class ThreeCardGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=500;this.pairPlus=true;this.phase='betting';this.deck=makeDeck(1);this.player=[];this.dealer=[];this.playerEval=null;this.dealerEval=null;this.status='ANTEを選んでDEAL'}
  draw(){if(this.deck.length<12)this.deck=makeDeck(1);return this.deck.pop()}
  mount(){
    this.root.innerHTML=`<div class="game-stage threecard-stage sovereign-game-stage"><div class="table-status"><b id="threeStatus">${this.status}</b><small>ANTE · PLAY · OPTIONAL PAIR PLUS</small></div><div class="threecard-table"><section><header><small>DEALER</small><b id="threeDealerHand">SEALED</b></header><div id="threeDealerCards" class="card-row three-card-row"></div></section><div class="seraph-seal"><i>翼</i><b>VS</b><span>Q HIGH TO QUALIFY</span></div><section><header><small>PLAYER</small><b id="threePlayerHand">—</b></header><div id="threePlayerCards" class="card-row three-card-row"></div></section></div><div id="threeDecision" class="threecard-decision" hidden><button id="threeFold" type="button">FOLD<small>ANTEを失う</small></button><button id="threePlay" type="button">PLAY<small id="threePlayCost">+${formatL(this.bet)}</small></button></div><div class="threecard-pair"><button id="threePairToggle" class="active" type="button"><i>✦</i><span><b>PAIR PLUS</b><small>自分の役だけで独立判定</small></span><strong id="threePairCost">+${formatL(this.bet)}</strong></button><div class="three-pay-mini">${THREE_HANDS.slice(0,5).map(h=>`<span><b>${h.name}</b><i>${h.pairPay}:1</i></span>`).join('')}</div></div><div class="bet-dock eternal-bet-dock">${this.chipSelector(this.bet,null,[100,500,1000,2500,5000])}<div class="bet-readout"><small>ANTE</small><strong id="threeBet">${formatL(this.bet)}</strong></div><button id="threeDeal" class="table-button primary" type="button">DEAL</button></div></div>`;
    this.bindChips(this.root,v=>{if(this.phase!=='betting')return;this.bet=v;this.render()});$('#threePairToggle',this.root).addEventListener('click',()=>{if(this.phase!=='betting')return;this.pairPlus=!this.pairPlus;this.app.audio.play('chip');this.render()});$('#threeDeal',this.root).addEventListener('click',()=>this.deal());$('#threeFold',this.root).addEventListener('click',()=>this.fold());$('#threePlay',this.root).addEventListener('click',()=>this.play());this.render();
  }
  async deal(){
    if(this.phase!=='betting'||this.busy)return;const wager=this.bet+(this.pairPlus?this.bet:0);if(!this.canAfford(wager)||!this.app.profile.spend(wager))return;this.deck=makeDeck(1);this.busy=true;this.phase='dealing';this.player=[];this.dealer=[];this.playerEval=null;this.dealerEval=null;this.status='熾天の札を配っています';this.render();
    for(let i=0;i<3;i++){this.player.push(this.draw());this.app.audio.play('card');this.render();await wait(this.app.profile.data.settings.reducedMotion?25:145);if(this.disposed)return;this.dealer.push(this.draw());this.app.audio.play('card');this.render();await wait(this.app.profile.data.settings.reducedMotion?25:145);if(this.disposed)return}
    this.playerEval=evaluateThree(this.player);this.phase='decision';this.busy=false;this.status=`${this.playerEval.name} · PLAYかFOLD`;this.render();
  }
  pairReturn(){if(!this.pairPlus||!this.playerEval?.pairPay)return 0;return this.bet*(this.playerEval.pairPay+1)}
  fold(){if(this.phase!=='decision'||this.busy)return;const pair=this.pairReturn(),wager=this.bet+(this.pairPlus?this.bet:0);this.finish(pair,'FOLD',wager)}
  async play(){
    if(this.phase!=='decision'||this.busy||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.busy=true;this.phase='revealing';this.status='ディーラーの封印を解除';this.render();await wait(this.app.profile.data.settings.reducedMotion?40:500);if(this.disposed)return;
    this.dealerEval=evaluateThree(this.dealer);const cmp=compareThree(this.playerEval,this.dealerEval),pair=this.pairReturn(),totalWager=this.bet*2+(this.pairPlus?this.bet:0);let main=0,label='DEALER WINS';
    if(!this.dealerEval.qualifies){main=this.bet*3;label='DEALER NOT QUALIFIED'}
    else if(cmp>0){main=this.bet*4;label='PLAYER WINS'}
    else if(cmp===0){main=this.bet*2;label='PUSH'}
    if(this.playerEval.anteBonus)main+=this.bet*this.playerEval.anteBonus;
    this.busy=false;this.finish(main+pair,label,totalWager);
  }
  finish(payout,label,wager){this.phase='result';this.status=`${label} · ${this.playerEval?.name||'FOLD'}`;const special=this.playerEval?.id==='straightFlush';this.app.recordRound({game:'threecard',wager,payout,label:special?'SERAPH STRAIGHT FLUSH':label,detail:`PLAYER ${this.playerEval?.name||'FOLD'}${this.dealerEval?` · DEALER ${this.dealerEval.name}`:''}`,events:special?[{event:'threecardSF'}]:[]});this.render();this.setTimeout(()=>{this.phase='betting';this.player=[];this.dealer=[];this.playerEval=null;this.dealerEval=null;this.status='ANTEを選んでDEAL';this.render()},this.app.profile.data.settings.reducedMotion?650:2300)}
  render(){
    if(!$('#threeStatus',this.root))return;$('#threeStatus',this.root).textContent=this.status;$('#threeBet',this.root).textContent=formatL(this.bet);$('#threePairCost',this.root).textContent=`+${formatL(this.bet)}`;$('#threePlayCost',this.root).textContent=`+${formatL(this.bet)}`;$('#threePairToggle',this.root).classList.toggle('active',this.pairPlus);$('#threePairToggle',this.root).disabled=this.phase!=='betting';
    const dealerHidden=this.phase==='dealing'||this.phase==='decision';syncCardRow($('#threeDealerCards',this.root),this.dealer,{hidden:dealerHidden});syncCardRow($('#threePlayerCards',this.root),this.player);$('#threePlayerHand',this.root).textContent=this.playerEval?.name||'—';$('#threeDealerHand',this.root).textContent=dealerHidden&&this.dealer.length?'SEALED':this.dealerEval?.name||'—';$('#threeDecision',this.root).hidden=this.phase!=='decision';$('#threeDeal',this.root).disabled=this.phase!=='betting'||this.busy;$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.phase!=='betting'})
  }
}

// ---------- PHANTOM DERBY ----------
const DERBY_HORSES = [
  {id:'nocturne',name:'NOCTURNE',jp:'夜想',glyph:'♞',weight:1.34},
  {id:'seraph',name:'FALLEN SERAPH',jp:'堕天',glyph:'翼',weight:1.18},
  {id:'comet',name:'VIOLET COMET',jp:'紫彗',glyph:'✦',weight:1.05},
  {id:'obsidian',name:'OBSIDIAN KING',jp:'黒王',glyph:'◆',weight:.92},
  {id:'oracle',name:'ORACLE MIST',jp:'予霧',glyph:'◎',weight:.79},
  {id:'jester',name:'LAST JESTER',jp:'道化',glyph:'J',weight:.66}
];
class DerbyGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=1000;this.selected=0;this.racing=false;this.progress=Array(6).fill(0);this.order=[];this.form=[];this.odds=[];this.status='勝者を選んでRACE';this.history=[];this.prepareCard()}
  prepareCard(){this.form=DERBY_HORSES.map(h=>.72+cryptoFloat()*.56);const raw=DERBY_HORSES.map((h,i)=>h.weight*this.form[i]);const sum=raw.reduce((a,b)=>a+b,0);this.odds=raw.map(x=>clamp(Math.floor((.92/(x/sum))*10)/10,1.6,12))}
  mount(){
    this.root.innerHTML=`<div class="game-stage derby-stage sovereign-game-stage"><div class="table-status"><b id="derbyStatus">${this.status}</b><small>SIX PHANTOMS · LIVE ODDS · PHOTO FINISH</small></div><div class="derby-scoreboard"><div id="derbySelections" class="derby-selections"></div><div class="derby-history"><small>LAST WINNERS</small><div id="derbyHistory">—</div></div></div><div id="derbyTrack" class="derby-track"><div class="derby-finish"><span>FINISH</span></div>${DERBY_HORSES.map((h,i)=>`<div class="derby-lane" data-derby-lane="${i}"><b>${i+1}</b><div class="derby-runner" data-derby-runner="${i}"><i>${h.glyph}</i><span>${h.jp}</span></div><em></em></div>`).join('')}</div><div class="bet-dock eternal-bet-dock">${this.chipSelector(this.bet)}<div class="bet-readout"><small>WIN BET</small><strong id="derbyBet">${formatL(this.bet)}</strong></div><button id="derbyRace" class="spin-button" type="button">RACE</button></div></div>`;
    this.bindChips(this.root,v=>{if(this.racing)return;this.bet=v;this.render()});$('#derbyRace',this.root).addEventListener('click',()=>this.race());this.render();
  }
  generateFinish(){
    const scores=DERBY_HORSES.map((h,i)=>{const u=Math.max(.000001,cryptoFloat());return {index:i,time:-Math.log(u)/(h.weight*this.form[i])}}); // property keeps minifier-safe shape
    return scores.sort((a,b)=>a.time-b.time).map(x=>x.index);
  }
  async race(){
    if(this.racing||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.racing=true;this.order=this.generateFinish();this.progress.fill(0);this.status='亡霊たちが走っています';this.render();this.app.audio.play('spin');
    const duration=this.app.profile.data.settings.reducedMotion?600:4300,start=performance.now(),rankOf=i=>this.order.indexOf(i);
    await new Promise(resolve=>{const tick=now=>{if(this.disposed)return resolve();const t=clamp((now-start)/duration,0,1),ease=1-Math.pow(1-t,2.6);for(let i=0;i<6;i++){const place=rankOf(i),finish=.985-place*.035,wobble=Math.sin(t*23+i*1.7)*.009*(1-t);this.progress[i]=clamp(ease*finish+wobble,0,finish)}this.paintRace();if(t<1)requestAnimationFrame(tick);else resolve()};requestAnimationFrame(tick)});if(this.disposed)return;
    const winner=this.order[0],won=winner===this.selected,payout=won?Math.floor(this.bet*this.odds[winner]):0;this.history.unshift(winner);this.history=this.history.slice(0,6);this.status=won?`${DERBY_HORSES[winner].name} WINS · ${formatL(payout)}`:`${DERBY_HORSES[winner].name} WINS`;this.app.audio.play(won?'bigwin':'lose');this.app.recordRound({game:'derby',wager:this.bet,payout,label:won&&this.odds[winner]>=7?'UNDERDOG VICTORY':'PHANTOM DERBY',detail:`#${winner+1} ${DERBY_HORSES[winner].name} · ×${this.odds[winner]}`,events:won&&this.odds[winner]>=7?[{event:'derbyUnderdog'}]:[]});this.racing=false;this.render();this.setTimeout(()=>{this.prepareCard();this.progress.fill(0);this.status='勝者を選んでRACE';this.render()},this.app.profile.data.settings.reducedMotion?800:2300)
  }
  paintRace(){$$('[data-derby-runner]',this.root).forEach(el=>{const i=Number(el.dataset.derbyRunner);el.style.left=`${4+this.progress[i]*88}%`;el.style.transform='translate(-50%,-50%)'})}
  render(){
    if(!$('#derbyStatus',this.root))return;$('#derbyStatus',this.root).textContent=this.status;$('#derbyBet',this.root).textContent=formatL(this.bet);$('#derbyRace',this.root).disabled=this.racing;$('#derbySelections',this.root).innerHTML=DERBY_HORSES.map((h,i)=>`<button data-derby-pick="${i}" class="${i===this.selected?'active':''}" type="button" ${this.racing?'disabled':''}><i>${h.glyph}</i><span><b>${h.name}</b><small>FORM ${Math.round(this.form[i]*100)}</small></span><strong>×${this.odds[i].toFixed(1)}</strong></button>`).join('');$$('[data-derby-pick]',this.root).forEach(b=>b.addEventListener('click',()=>{if(this.racing)return;this.selected=Number(b.dataset.derbyPick);this.app.audio.play('chip');this.render()}));$('#derbyHistory',this.root).innerHTML=this.history.length?this.history.map(i=>`<span>${i+1}</span>`).join(''):'—';$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.racing});this.paintRace()
  }
}

// ---------- ECLIPSE ASCENT ----------
class AscentGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=1000;this.phase='idle';this.multiplier=1;this.crashPoint=1;this.auto=0;this.raf=0;this.startTime=0;this.history=[];this.status='BETを選んでASCEND'}
  mount(){
    this.root.innerHTML=`<div class="game-stage ascent-stage sovereign-game-stage"><div class="table-status"><b id="ascentStatus">${this.status}</b><small>HIDDEN COLLAPSE · MANUAL / AUTO CASH OUT</small></div><div class="ascent-layout"><section class="ascent-reactor"><canvas id="ascentCanvas"></canvas><div class="ascent-number"><small id="ascentPhase">READY</small><strong id="ascentMulti">1.00×</strong><span id="ascentPotential">${formatL(this.bet)}</span></div><div class="ascent-core"><i></i><b>▲</b></div></section><aside class="ascent-panel"><p class="eyebrow">AUTO CASH OUT</p><div class="ascent-auto">${[0,1.5,2,3,5,10].map(v=>`<button data-ascent-auto="${v}" class="${v===0?'active':''}" type="button">${v?`${v}×`:'OFF'}</button>`).join('')}</div><div class="ascent-history"><small>RECENT COLLAPSE</small><div id="ascentHistory">—</div></div><div class="ascent-integrity"><span>REACTOR INTEGRITY</span><i><u id="ascentIntegrity"></u></i><b id="ascentIntegrityText">STABLE</b></div></aside></div><div class="ascent-actions"><button id="ascentCash" class="table-button gold" type="button" disabled>CASH OUT</button></div><div class="bet-dock eternal-bet-dock">${this.chipSelector(this.bet)}<div class="bet-readout"><small>YOUR BET</small><strong id="ascentBet">${formatL(this.bet)}</strong></div><button id="ascentStart" class="table-button primary" type="button">ASCEND</button></div></div>`;
    this.canvas=$('#ascentCanvas',this.root);this.ctx=this.canvas.getContext('2d');this.bindChips(this.root,v=>{if(this.phase!=='idle')return;this.bet=v;this.render()});$$('[data-ascent-auto]',this.root).forEach(b=>b.addEventListener('click',()=>{if(this.phase!=='idle')return;this.auto=Number(b.dataset.ascentAuto);this.app.audio.play('chip');this.render()}));$('#ascentStart',this.root).addEventListener('click',()=>this.start());$('#ascentCash',this.root).addEventListener('click',()=>this.cash());window.addEventListener('resize',this.resizeHandler=()=>this.draw());this.render();this.draw();
  }
  unmount(){cancelAnimationFrame(this.raf);window.removeEventListener('resize',this.resizeHandler);super.unmount()}
  makeCrash(){const u=Math.max(.000001,cryptoFloat()),raw=.99/(1-u);return clamp(Math.floor(raw*100)/100,1,100)}
  start(){if(this.phase!=='idle'||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.phase='running';this.multiplier=1;this.crashPoint=this.makeCrash();this.status='星蝕が上昇しています';this.startTime=performance.now();this.app.audio.play('spin');this.render();this.loop(this.startTime)}
  loop(now){if(this.disposed||this.phase!=='running')return;const elapsed=now-this.startTime;this.multiplier=Math.max(1,Math.exp(elapsed/7200));if(this.auto>0&&this.multiplier>=this.auto&&this.auto<this.crashPoint){this.multiplier=this.auto;this.cash(true);return}if(this.multiplier>=this.crashPoint){this.multiplier=this.crashPoint;this.collapse();return}this.renderLive();this.draw();this.raf=requestAnimationFrame(t=>this.loop(t))}
  cash(auto=false){if(this.phase!=='running')return;cancelAnimationFrame(this.raf);const at=Math.floor(this.multiplier*100)/100,payout=Math.floor(this.bet*at);this.phase='result';this.status=`${auto?'AUTO ':''}CASH OUT · ${at.toFixed(2)}×`;this.history.unshift({value:this.crashPoint,cash:at});this.history=this.history.slice(0,8);this.app.audio.play(at>=5?'bigwin':'win');this.app.recordRound({game:'ascent',wager:this.bet,payout,label:at>=10?'TENFOLD ASCENT':'ECLIPSE CASH OUT',detail:`CASH ${at.toFixed(2)}× · COLLAPSE ${this.crashPoint.toFixed(2)}×`,events:at>=10?[{event:'ascentTen'}]:[]});this.render();this.draw();this.setTimeout(()=>this.reset(),this.app.profile.data.settings.reducedMotion?650:2100)}
  collapse(){cancelAnimationFrame(this.raf);this.phase='crashed';this.status=`COLLAPSED AT ${this.crashPoint.toFixed(2)}×`;this.history.unshift({value:this.crashPoint,cash:0});this.history=this.history.slice(0,8);this.app.audio.play('lose');this.app.recordRound({game:'ascent',wager:this.bet,payout:0,label:'ECLIPSE COLLAPSE',detail:`${this.crashPoint.toFixed(2)}×`});this.render();this.draw();this.setTimeout(()=>this.reset(),this.app.profile.data.settings.reducedMotion?650:2100)}
  reset(){this.phase='idle';this.multiplier=1;this.crashPoint=1;this.status='BETを選んでASCEND';this.render();this.draw()}
  size(){const r=this.canvas.getBoundingClientRect(),w=Math.max(300,r.width),h=Math.max(260,r.height),d=Math.min(devicePixelRatio||1,2);if(this.canvas.width!==Math.floor(w*d)||this.canvas.height!==Math.floor(h*d)){this.canvas.width=Math.floor(w*d);this.canvas.height=Math.floor(h*d);this.ctx.setTransform(d,0,0,d,0,0)}return{w,h}}
  draw(){if(!this.ctx)return;const {w,h}=this.size(),ctx=this.ctx;ctx.clearRect(0,0,w,h);const grd=ctx.createLinearGradient(0,0,0,h);grd.addColorStop(0,'rgba(98,48,139,.2)');grd.addColorStop(1,'rgba(5,3,10,.65)');ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(231,192,103,.09)';ctx.lineWidth=1;for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(0,h*i/6);ctx.lineTo(w,h*i/6);ctx.stroke()}for(let i=1;i<8;i++){ctx.beginPath();ctx.moveTo(w*i/8,0);ctx.lineTo(w*i/8,h);ctx.stroke()}const p=clamp(Math.log(Math.max(1,this.multiplier))/Math.log(12),0,1),points=[];for(let i=0;i<=60;i++){const t=i/60*p;points.push({x:22+t*(w-44),y:h-30-Math.pow(t,1.7)*(h-70)})}if(points.length){ctx.beginPath();points.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.lineWidth=4;ctx.strokeStyle=this.phase==='crashed'?'#ef5578':'#edc56d';ctx.shadowBlur=18;ctx.shadowColor=this.phase==='crashed'?'#ef5578':'#a36ed1';ctx.stroke();ctx.shadowBlur=0;const q=points.at(-1);ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fillStyle='#fff1b0';ctx.fill()}}
  renderLive(){if(!$('#ascentMulti',this.root))return;$('#ascentMulti',this.root).textContent=`${this.multiplier.toFixed(2)}×`;$('#ascentPotential',this.root).textContent=formatL(Math.floor(this.bet*this.multiplier));const stress=clamp(Math.log(this.multiplier)/Math.log(20),0,1);$('#ascentIntegrity',this.root).style.width=`${(1-stress)*100}%`;$('#ascentIntegrityText',this.root).textContent=stress>.72?'CRITICAL':stress>.4?'UNSTABLE':'STABLE'}
  render(){if(!$('#ascentStatus',this.root))return;$('#ascentStatus',this.root).textContent=this.status;$('#ascentBet',this.root).textContent=formatL(this.bet);$('#ascentPhase',this.root).textContent=this.phase==='running'?'ASCENDING':this.phase==='crashed'?'COLLAPSED':this.phase==='result'?'SECURED':'READY';$('#ascentStart',this.root).disabled=this.phase!=='idle';$('#ascentCash',this.root).disabled=this.phase!=='running';$$('[data-ascent-auto]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.ascentAuto)===this.auto);b.disabled=this.phase!=='idle'});$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.phase!=='idle'});$('#ascentHistory',this.root).innerHTML=this.history.length?this.history.map(x=>`<span class="${x.value>=2?'hot':''}">${x.value.toFixed(2)}×</span>`).join(''):'—';this.renderLive()}
}

// ---------- ARCANA MATCH ----------
const ARCANA_SYMBOLS = ['☾','✦','♛','◆','翼','◎','薔','龍'];
class ArcanaGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=500;this.phase='idle';this.cards=[];this.open=[];this.matched=new Set();this.moves=0;this.time=45;this.timer=null;this.status='BETを選んで記憶札を開始'}
  mount(){
    this.root.innerHTML=`<div class="game-stage arcana-stage sovereign-game-stage"><div class="table-status"><b id="arcanaStatus">${this.status}</b><small>16 CARDS · 8 PAIRS · 45 SECONDS</small></div><div class="arcana-head"><span><small>TIME</small><b id="arcanaTime">45.0</b></span><span><small>MOVES</small><b id="arcanaMoves">0</b></span><span><small>PAIRS</small><b id="arcanaPairs">0 / 8</b></span><span><small>PROJECTED</small><b id="arcanaReturn">—</b></span></div><div id="arcanaGrid" class="arcana-grid"></div><div class="arcana-actions"><button id="arcanaStart" class="table-button primary" type="button">OPEN THE DECK</button></div><div class="bet-dock eternal-bet-dock">${this.chipSelector(this.bet,null,[100,500,1000,2500,5000])}<div class="bet-readout"><small>ENTRY</small><strong id="arcanaBet">${formatL(this.bet)}</strong></div></div></div>`;this.bindChips(this.root,v=>{if(this.phase==='idle'){this.bet=v;this.render()}});$('#arcanaStart',this.root).addEventListener('click',()=>this.start());this.render();
  }
  start(){if(this.phase!=='idle'||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.cards=shuffled([...ARCANA_SYMBOLS,...ARCANA_SYMBOLS].map((s,i)=>({id:i,symbol:s})));this.open=Array.from({length:16},(_,i)=>i);this.matched.clear();this.moves=0;this.time=45;this.phase='preview';this.status='全札を記憶してください';this.app.audio.play('deal');this.render();this.setTimeout(()=>{this.open=[];this.phase='playing';this.status='同じ紋章を2枚そろえる';this.startedAt=performance.now();this.timer=this.setInterval(()=>this.tick(),100);this.render()},this.app.profile.data.settings.reducedMotion?500:1700)}
  tick(){if(this.phase!=='playing')return;this.time=Math.max(0,45-(performance.now()-this.startedAt)/1000);if(this.time<=0){clearInterval(this.timer);this.timer=null;this.phase='result';this.status='TIME OUT';this.app.audio.play('lose');this.app.recordRound({game:'arcana',wager:this.bet,payout:0,label:'ARCANA TIME OUT',detail:`${this.matched.size/2} PAIRS · ${this.moves} MOVES`});this.render();this.setTimeout(()=>this.reset(),1600);return}this.renderHud()}
  async flip(i){if(this.phase!=='playing'||this.busy||this.open.includes(i)||this.matched.has(i))return;this.open.push(i);this.app.audio.play('card');this.render();if(this.open.length<2)return;this.busy=true;this.moves++;const [a,b]=this.open;if(this.cards[a].symbol===this.cards[b].symbol){this.matched.add(a);this.matched.add(b);this.open=[];this.app.audio.play('win');this.busy=false;if(this.matched.size===16){clearInterval(this.timer);this.timer=null;this.complete()}else this.render();return}await wait(this.app.profile.data.settings.reducedMotion?80:650);if(this.disposed)return;this.open=[];this.busy=false;this.render()}
  projected(){const timeRatio=this.time/45,moveSkill=clamp((28-this.moves)/20,0,1);return clamp(.40+timeRatio*.3+moveSkill*.25,.40,.95)}
  complete(){this.phase='result';const multi=Math.floor(this.projected()*100)/100,payout=Math.floor(this.bet*multi),perfect=this.moves<=10&&this.time>=25;this.status=`ALL PAIRS · ${multi.toFixed(2)}×`;this.app.audio.play(perfect?'bigwin':'win');this.app.recordRound({game:'arcana',wager:this.bet,payout,label:perfect?'PERFECT ARCANA':'ARCANA COMPLETE',detail:`${this.moves} MOVES · ${this.time.toFixed(1)}s`,events:perfect?[{event:'arcanaPerfect'}]:[]});this.render();this.setTimeout(()=>this.reset(),this.app.profile.data.settings.reducedMotion?700:2200)}
  reset(){this.phase='idle';this.cards=[];this.open=[];this.matched.clear();this.moves=0;this.time=45;this.status='BETを選んで記憶札を開始';this.render()}
  renderHud(){if(!$('#arcanaTime',this.root))return;$('#arcanaTime',this.root).textContent=this.time.toFixed(1);$('#arcanaMoves',this.root).textContent=this.moves;$('#arcanaPairs',this.root).textContent=`${this.matched.size/2} / 8`;$('#arcanaReturn',this.root).textContent=this.phase==='playing'?`${this.projected().toFixed(2)}×`:'—'}
  render(){if(!$('#arcanaGrid',this.root))return;$('#arcanaStatus',this.root).textContent=this.status;$('#arcanaBet',this.root).textContent=formatL(this.bet);$('#arcanaStart',this.root).disabled=this.phase!=='idle';$('#arcanaStart',this.root).textContent=this.phase==='idle'?'OPEN THE DECK':this.phase==='preview'?'MEMORIZE…':this.phase==='playing'?'MATCHING':'RESULT';$('#arcanaGrid',this.root).innerHTML=Array.from({length:16},(_,i)=>{const shown=this.open.includes(i)||this.matched.has(i),matched=this.matched.has(i),card=this.cards[i];return`<button data-arcana-card="${i}" class="${shown?'open':''} ${matched?'matched':''}" type="button" ${this.phase!=='playing'||this.busy||shown?'disabled':''}><span class="arcana-back"><i>✦</i></span><span class="arcana-face"><i>${card?.symbol||'?'}</i></span></button>`}).join('');$$('[data-arcana-card]',this.root).forEach(b=>b.addEventListener('click',()=>this.flip(Number(b.dataset.arcanaCard))));$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.phase!=='idle'});this.renderHud()}
}

// ---------- MOONSHOT DARTS ----------
class MoonshotGame extends GameBase {
  constructor(app,mount){super(app,mount);this.bet=500;this.phase='idle';this.throwNo=0;this.scores=[];this.angle=0;this.radius=.62;this.startTime=0;this.raf=0;this.status='BETを選んで3投開始';this.resizeHandler=()=>this.draw()}
  mount(){
    this.root.innerHTML=`<div class="game-stage moonshot-stage sovereign-game-stage"><div class="table-status"><b id="moonshotStatus">${this.status}</b><small>THREE THROWS · MOVING RETICLE · SCORE RETURN · MAX 0.95×</small></div><div class="moonshot-layout"><section class="moonshot-board"><canvas id="moonshotCanvas" aria-label="月輪ダーツ盤"></canvas><button id="moonshotBoardTap" type="button" aria-label="ダーツを投げる"></button></section><aside class="moonshot-score"><p class="eyebrow">RUN SCORE</p><strong id="moonshotTotal">0</strong><small>/ 300</small><div id="moonshotThrows">${[1,2,3].map(i=>`<span><i>${i}</i><b>—</b></span>`).join('')}</div><div class="moonshotPay"><span><b>270+</b><i>×0.95</i></span><span><b>225+</b><i>×0.75</i></span><span><b>180+</b><i>×0.50</i></span><span><b>135+</b><i>×0.25</i></span></div></aside></div><div class="moonshot-actions"><button id="moonshotThrow" class="table-button gold" type="button" disabled>THROW</button></div><div class="bet-dock eternal-bet-dock">${this.chipSelector(this.bet,null,[100,500,1000,2500,5000])}<div class="bet-readout"><small>ENTRY</small><strong id="moonshotBet">${formatL(this.bet)}</strong></div><button id="moonshotStart" class="table-button primary" type="button">START 3 THROWS</button></div></div>`;this.canvas=$('#moonshotCanvas',this.root);this.ctx=this.canvas.getContext('2d');this.bindChips(this.root,v=>{if(this.phase==='idle'){this.bet=v;this.render()}});$('#moonshotStart',this.root).addEventListener('click',()=>this.start());$('#moonshotThrow',this.root).addEventListener('click',()=>this.throwDart());$('#moonshotBoardTap',this.root).addEventListener('click',()=>this.throwDart());window.addEventListener('resize',this.resizeHandler);this.render();this.draw();
  }
  unmount(){cancelAnimationFrame(this.raf);window.removeEventListener('resize',this.resizeHandler);super.unmount()}
  start(){if(this.phase!=='idle'||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.phase='aiming';this.throwNo=0;this.scores=[];this.startTime=performance.now();this.status='照準が中心へ来た瞬間にTHROW';this.app.audio.play('chime');this.render();this.loop(this.startTime)}
  loop(now){if(this.disposed||this.phase!=='aiming')return;const t=(now-this.startTime)/1000;this.angle=t*2.1+Math.sin(t*.73)*.8;this.radius=.1+Math.abs(Math.sin(t*1.47+this.throwNo*.9))*.78;this.draw();this.raf=requestAnimationFrame(n=>this.loop(n))}
  throwDart(){if(this.phase!=='aiming'||this.busy)return;this.busy=true;const radial=this.radius,angularBonus=(Math.cos(this.angle*3)+1)*.035,score=clamp(Math.round(105-radial*112+angularBonus*100),0,100);this.scores.push(score);this.throwNo++;this.app.audio.play(score>=90?'bigwin':score>=55?'win':'stop');this.draw(true);this.render();this.setTimeout(()=>{this.busy=false;if(this.throwNo>=3)this.finish();else{this.startTime=performance.now();this.status=`THROW ${this.throwNo+1} · 照準を止める`;this.render()}},this.app.profile.data.settings.reducedMotion?120:650)}
  finish(){cancelAnimationFrame(this.raf);const total=this.scores.reduce((a,b)=>a+b,0),multi=total>=270?.95:total>=225?.75:total>=180?.5:total>=135?.25:0,payout=Math.floor(this.bet*multi),perfect=total===300;this.phase='result';this.status=`${total} POINTS · ${multi?`${multi}× RETURN`:'NO RETURN'}`;this.app.recordRound({game:'moonshot',wager:this.bet,payout,score:total,label:perfect?'PERFECT MOONSHOT':'MOONSHOT RESULT',detail:`${this.scores.join(' + ')} = ${total}`,events:perfect?[{event:'moonshotPerfect'}]:[]});this.render();this.setTimeout(()=>{this.phase='idle';this.throwNo=0;this.scores=[];this.status='BETを選んで3投開始';this.render();this.draw()},this.app.profile.data.settings.reducedMotion?700:2200)}
  size(){const r=this.canvas.getBoundingClientRect(),s=Math.max(300,Math.min(r.width,r.height||r.width)),d=Math.min(devicePixelRatio||1,2);if(this.canvas.width!==Math.floor(s*d)||this.canvas.height!==Math.floor(s*d)){this.canvas.width=Math.floor(s*d);this.canvas.height=Math.floor(s*d);this.ctx.setTransform(d,0,0,d,0,0)}return s}
  draw(hit=false){if(!this.ctx)return;const s=this.size(),ctx=this.ctx,c=s/2;ctx.clearRect(0,0,s,s);const bg=ctx.createRadialGradient(c,c,0,c,c,c);bg.addColorStop(0,'#28143b');bg.addColorStop(1,'#07050c');ctx.fillStyle=bg;ctx.fillRect(0,0,s,s);const rings=[.44,.36,.28,.2,.11,.045],tones=['#28182f','#5d2441','#20234b','#754528','#2b604e','#e9c96f'];rings.forEach((r,i)=>{ctx.beginPath();ctx.arc(c,c,s*r,0,Math.PI*2);ctx.fillStyle=tones[i];ctx.fill();ctx.strokeStyle='rgba(246,217,151,.32)';ctx.lineWidth=2;ctx.stroke()});for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(c,c);ctx.lineTo(c+Math.cos(i*Math.PI/6)*s*.44,c+Math.sin(i*Math.PI/6)*s*.44);ctx.strokeStyle='rgba(242,213,147,.18)';ctx.stroke()}ctx.fillStyle='#fff3bc';ctx.font=`700 ${s*.05}px Georgia`;ctx.textAlign='center';ctx.fillText('MOONSHOT',c,s*.09);if(this.phase==='aiming'||hit){const rr=this.radius*s*.39,x=c+Math.cos(this.angle)*rr,y=c+Math.sin(this.angle)*rr;ctx.beginPath();ctx.arc(x,y,s*.035,0,Math.PI*2);ctx.strokeStyle=hit?'#fff0a4':'#7de8dc';ctx.lineWidth=3;ctx.shadowBlur=18;ctx.shadowColor=ctx.strokeStyle;ctx.stroke();ctx.beginPath();ctx.moveTo(x-s*.055,y);ctx.lineTo(x+s*.055,y);ctx.moveTo(x,y-s*.055);ctx.lineTo(x,y+s*.055);ctx.stroke();ctx.shadowBlur=0}}
  render(){if(!$('#moonshotStatus',this.root))return;$('#moonshotStatus',this.root).textContent=this.status;$('#moonshotBet',this.root).textContent=formatL(this.bet);$('#moonshotTotal',this.root).textContent=this.scores.reduce((a,b)=>a+b,0);$$('#moonshotThrows span',this.root).forEach((el,i)=>el.querySelector('b').textContent=this.scores[i]??'—');$('#moonshotStart',this.root).disabled=this.phase!=='idle';$('#moonshotThrow',this.root).disabled=this.phase!=='aiming'||this.busy;$('#moonshotBoardTap',this.root).disabled=this.phase!=='aiming'||this.busy;$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.phase!=='idle'})}
}

const NEW_GAME_CLASSES = {threecard:ThreeCardGame,derby:DerbyGame,ascent:AscentGame,arcana:ArcanaGame,moonshot:MoonshotGame};

function newGameCards(){return `
  <button class="game-card sovereign-game-card threecard-game-card" data-game="threecard" type="button"><span class="new-ribbon sovereign-new">NEW</span><div class="game-art sovereign-art threecard-art"><div class="three-mini-card a">A♠</div><div class="three-mini-card k">K♠</div><div class="three-mini-card q">Q♠</div><b>翼</b></div><div class="game-copy"><span class="game-tag">ANTE · PLAY · PAIR PLUS</span><h4>SERAPH<br />THREE CARD</h4><p>3枚だけの濃密なポーカー。役と胆力で熾天卓を制せ。</p><div><b>ANTE 100 L〜</b><i>PLAY →</i></div></div></button>
  <button class="game-card sovereign-game-card derby-game-card" data-game="derby" type="button"><span class="new-ribbon sovereign-new">NEW</span><div class="game-art sovereign-art derby-art"><div class="derby-mini-track">${Array.from({length:5},(_,i)=>`<i style="--d:${i}">♞</i>`).join('')}</div><b>FINISH</b></div><div class="game-copy"><span class="game-tag">SIX PHANTOMS · LIVE ODDS</span><h4>PHANTOM<br />DERBY</h4><p>6頭の亡霊が夜宮を駆ける。調子とオッズを読み切れ。</p><div><b>WIN BET 100 L〜</b><i>PLAY →</i></div></div></button>
  <button class="game-card sovereign-game-card ascent-game-card" data-game="ascent" type="button"><span class="new-ribbon sovereign-new">NEW</span><div class="game-art sovereign-art ascent-art"><div class="ascent-mini-line"></div><strong>8.42×</strong><b>▲</b></div><div class="game-copy"><span class="game-tag">RISE · CASH OUT · COLLAPSE</span><h4>ECLIPSE<br />ASCENT</h4><p>倍率が昇るほど星蝕は不安定になる。崩壊前に回収せよ。</p><div><b>BET 100 L〜</b><i>PLAY →</i></div></div></button>
  <button class="game-card sovereign-game-card arcana-game-card" data-game="arcana" type="button"><span class="new-ribbon sovereign-new">NEW</span><div class="game-art sovereign-art arcana-art"><div>${['☾','?','♛','?','?','◆','?','✦'].map(x=>`<i class="${x==='?'?'sealed':''}">${x}</i>`).join('')}</div></div><div class="game-copy"><span class="game-tag">MEMORY · SCORE & RETURN</span><h4>ARCANA<br />MATCH</h4><p>16枚の封印を記憶し、8組の紋章を時間内にそろえよ。</p><div><b>ENTRY 100 L〜</b><i>PLAY →</i></div></div></button>
  <button class="game-card sovereign-game-card moonshot-game-card" data-game="moonshot" type="button"><span class="new-ribbon sovereign-new">NEW</span><div class="game-art sovereign-art moonshot-art"><div class="moonshot-mini"><i></i><i></i><i></i><b>◎</b><span>+</span></div></div><div class="game-copy"><span class="game-tag">THREE THROWS · TIMING</span><h4>MOONSHOT<br />DARTS</h4><p>動く照準を止め、3投で300点の完全試合を狙え。</p><div><b>ENTRY 100 L〜</b><i>PLAY →</i></div></div></button>`}

// ---------- SOVEREIGN CIRCUIT / COLLECTION ----------
const MEDALS = [
  ['first','✦','最初の夜','1ラウンド遊ぶ',s=>s.totalRounds()>=1],['round25','25','常連客','25ラウンド遊ぶ',s=>s.totalRounds()>=25],['round100','100','百夜札','100ラウンド遊ぶ',s=>s.totalRounds()>=100],['round500','♛','永夜住人','500ラウンド遊ぶ',s=>s.totalRounds()>=500],
  ['win10','W','勝者の灯','10回勝利する',s=>s.totalWins()>=10],['win50','W','黄金の勝者','50回勝利する',s=>s.totalWins()>=50],['streak5','🔥','五連火冠','5連勝を達成',s=>(s.app.profile.data.streak?.best||0)>=5],['streak10','焔','十連星冠','10連勝を達成',s=>(s.app.profile.data.streak?.best||0)>=10],
  ['games5','Ⅴ','五卓巡礼','5種類のゲームを遊ぶ',s=>s.playedGames()>=5],['games12','Ⅻ','十二宮巡礼','12種類のゲームを遊ぶ',s=>s.playedGames()>=12],['games23','∞','全卓制覇','23種類すべて遊ぶ',s=>s.playedGames()>=23],['stars10','★','十星章','TABLE STARを10個獲得',s=>s.totalStars()>=10],
  ['stars40','★★','四十星章','TABLE STARを40個獲得',s=>s.totalStars()>=40],['stars80','★★★','八十星章','TABLE STARを80個獲得',s=>s.totalStars()>=80],['stars115','冠','完全卓主','TABLE STARを115個獲得',s=>s.totalStars()>=115],['circuit1','路','王冠巡回者','CROWN CIRCUITを1回踏破',s=>s.data.circuit.clears>=1],
  ['circuit7','塔','七夜巡回者','CROWN CIRCUITを7回踏破',s=>s.data.circuit.clears>=7],['chest','箱','王庫開封','SOVEREIGN CHESTを開く',s=>s.data.chests>=1],['rich100','L','六桁の客人','残高100,000 L',s=>s.app.profile.data.balance>=100000],['rich1m','♦','百万夜帝','残高1,000,000 L',s=>s.app.profile.data.balance>=1000000],
  ['three','3','熾天の三枚','SERAPH THREE CARDで勝利',s=>s.stat('threecard').wins>=1],['threeSF','翼','純白連環','3 CARDでSTRAIGHT FLUSH',s=>s.data.special.threecardSF],['derby','♞','亡霊馬主','PHANTOM DERBYで勝利',s=>s.stat('derby').wins>=1],['underdog','蹄','大穴の夜','7倍以上の馬を的中',s=>s.data.special.derbyUnderdog],
  ['ascent2','▲','二倍圏','ASCENTを2倍以上で回収',s=>s.stat('ascent').best>=2],['ascent10','蝕','十倍星蝕','ASCENTを10倍以上で回収',s=>s.data.special.ascentTen],['arcana','▦','記憶の扉','ARCANA MATCHを完成',s=>s.stat('arcana').wins>=1],['arcanaPerfect','眼','完全記憶','ARCANAをPERFECTで完成',s=>s.data.special.arcanaPerfect],
  ['darts180','◎','月輪射手','MOONSHOTで180点以上',s=>s.stat('moonshot').scoreMax>=180],['darts300','月','完全月射','MOONSHOTで300点',s=>s.data.special.moonshotPerfect],['mines','◇','深淵回収者','ABYSSAL MINESでCASH OUT',s=>s.stat('mines').wins>=1],['tower','♜','二罠の塔主','2 TRAP TOWERの頂上へ到達',s=>s.app.eternal?.data?.stats?.towerSummits>=1],
  ['scratch','✧','銀膜の向こう','SCRATCHで当選',s=>s.app.eternal?.data?.stats?.scratchWins>=1],['pvp','⚔','対人の一歩','PvPで1勝',s=>(s.app.profile.data.ascension?.duel?.wins||0)>=1],['collector','◆','秘宝蒐集家','ETERNAL ARTIFACTを24個収集',s=>Object.keys(s.app.eternal?.data?.artifacts?.owned||{}).length>=24],['prestige','♛','超越の客人','PRESTIGEを1回達成',s=>(s.app.profile.data.ascension?.prestige||0)>=1]
].map(([id,icon,name,desc,test])=>({id,icon,name,desc,test}));

function defaultSovereign(){return{version:SOVEREIGN_VERSION,marks:0,chests:0,favorites:[],stats:{},medals:{},special:{threecardSF:false,derbyUnderdog:false,ascentTen:false,arcanaPerfect:false,moonshotPerfect:false},circuit:{day:'',active:false,stage:0,lives:3,score:0,route:[],clears:0,best:0,claimedDay:''}}}

class SovereignSystem {
  constructor(app){this.app=app;this.tab='circuit';this.filter='all';this.query='';this.ensureData();this.injectUi();this.bind();this.patchCore();this.updateAll()}
  ensureData(){const p=this.app.profile.data;if(!p.sovereign||p.sovereign.version!==SOVEREIGN_VERSION){const old=p.sovereign||{},fresh=defaultSovereign();p.sovereign={...fresh,...old,version:SOVEREIGN_VERSION,stats:{...fresh.stats,...(old.stats||{})},medals:{...fresh.medals,...(old.medals||{})},special:{...fresh.special,...(old.special||{})},circuit:{...fresh.circuit,...(old.circuit||{})}}}this.data=p.sovereign;for(const id of ALL_GAMES)if(!this.data.stats[id])this.data.stats[id]={rounds:0,wins:0,best:0,biggest:0,scoreMax:0};else this.data.stats[id].scoreMax=Number(this.data.stats[id].scoreMax||0);this.ensureCircuitDay();this.app.profile.save()}
  ensureCircuitDay(){const d=dateKey();if(this.data.circuit.day===d&&this.data.circuit.route?.length===7)return;const rng=seededRandom(seededHash(`${d}:${this.app.profile.data.id}:crown-circuit`)),pool=shuffledBy(ALL_GAMES,rng),types=['play','win','return','play','win','return','win'];this.data.circuit={...this.data.circuit,day:d,active:false,stage:0,lives:3,score:0,route:pool.slice(0,7).map((game,i)=>({game,type:types[i],target:types[i]==='return'?(i>=5?1.75:1.35):1}))}}
  stat(id){return this.data.stats[id]||(this.data.stats[id]={rounds:0,wins:0,best:0,biggest:0,scoreMax:0})}
  totalRounds(){return Object.values(this.data.stats).reduce((a,x)=>a+(x.rounds||0),0)}
  totalWins(){return Object.values(this.data.stats).reduce((a,x)=>a+(x.wins||0),0)}
  playedGames(){return Object.values(this.data.stats).filter(x=>x.rounds>0).length}
  starsFor(id){const x=this.stat(id);return Number(x.rounds>=3)+Number(x.rounds>=10)+Number(x.wins>=3)+Number(x.best>=5)+Number(x.rounds>=30&&x.wins>=10)}
  totalStars(){return ALL_GAMES.reduce((a,id)=>a+this.starsFor(id),0)}
  injectUi(){
    document.title='LUX NOCTIS TREASURY REFORM — 23 Games & Live PvP';const head=document.head;if(!$('#sovereignStyles')){const link=document.createElement('link');link.id='sovereignStyles';link.rel='stylesheet';link.href='sovereign.css';head.appendChild(link)}
    const count=$('.games-section .section-heading > span');if(count)count.textContent='23 GAMES · CROWN CIRCUIT · 5 LIVE PVP MODES';const grid=$('#gameGrid');if(grid&&!grid.querySelector('[data-game="threecard"]'))grid.insertAdjacentHTML('beforeend',newGameCards());
    const heading=$('.games-section .section-heading');if(heading&&!$('#sovereignGameBrowser'))heading.insertAdjacentHTML('afterend',`<div id="sovereignGameBrowser" class="sovereign-game-browser"><div class="game-search"><i>⌕</i><input id="gameSearchInput" type="search" placeholder="ゲーム名を検索" autocomplete="off" /></div><div class="game-filter-row">${[['all','ALL'],['cards','CARDS'],['wheels','WHEELS'],['dice','DICE'],['arcade','ARCADE'],['new','NEW 5'],['favorite','★ FAVORITE']].map(([id,label])=>`<button data-game-filter="${id}" class="${id==='all'?'active':''}" type="button">${label}</button>`).join('')}</div><button id="randomGameButton" class="random-table-button" type="button"><i>✦</i><span><b>RANDOM TABLE</b><small>今夜の卓を選ぶ</small></span></button></div>`);
    const omen=$('#eternalOmenBar');if(omen&&!$('#sovereignRibbon'))omen.insertAdjacentHTML('afterend',`<section id="sovereignRibbon" class="sovereign-ribbon"><button data-sovereign-open="circuit" type="button"><i>♛</i><span><small>DAILY CROWN CIRCUIT</small><b id="circuitRibbonText">READY · 3 LIFE</b></span><em><u id="circuitRibbonFill"></u></em></button><button data-sovereign-open="stars" type="button"><i>★</i><span><small>TABLE STARS</small><b id="starRibbonText">0 / 115</b></span></button><button data-sovereign-open="medals" type="button"><i>◆</i><span><small>MEDAL VAULT</small><b id="medalRibbonText">0 / 36</b></span></button><button data-sovereign-open="chest" type="button"><i>◇</i><span><small>SOVEREIGN CHEST</small><b id="markRibbonText">0 / 150 MARKS</b></span></button></section>`);
    const toast=$('#toastStack');if(toast&&!$('#sovereignModal'))toast.insertAdjacentHTML('beforebegin',`<section id="sovereignModal" class="modal palace-modal wide-modal sovereign-modal" hidden aria-modal="true" role="dialog"><button id="closeSovereign" class="modal-close" type="button">×</button><div class="modal-crest">♛</div><p class="eyebrow">TREASURY REFORM · GRAND FLOOR 6.0</p><h2>王冠巡回庁</h2><div class="sovereign-tabs"><button data-sovereign-tab="circuit" class="active" type="button">CROWN CIRCUIT</button><button data-sovereign-tab="stars" type="button">TABLE STARS</button><button data-sovereign-tab="medals" type="button">MEDAL VAULT</button><button data-sovereign-tab="chest" type="button">SOVEREIGN CHEST</button></div><div id="sovereignContent"></div></section>`);
    $('.intro-copy .eyebrow').textContent='TREASURY REFORM · 23 TABLES · 5 LIVE PVP MODES';$('.brand-text small').textContent='TREASURY REFORM · SOCIAL CASINO';$('.intro-copy .intro-lead').innerHTML='23のゲーム、全卓横断CROWN CIRCUIT、115 TABLE STARS、36の収集メダル。<br />協力レイドと5種類のリアルタイムCROWN DUELも継続。';const hero=$('.hero-copy > p:not(.eyebrow)');if(hero)hero.textContent='23テーブル、日替わり王冠巡回、全卓スター、メダル庫、周回遠征、協力レイド、5種類のライブPvP。すべてプレイコイン専用です。';
    this.decorateCards();
  }
  decorateCards(){
    $$('#gameGrid .game-card').forEach(card=>{const id=card.dataset.game;card.dataset.category=GAME_CATEGORIES[id]||'arcade';card.classList.toggle('sovereign-new-game',NEW_GAME_IDS.includes(id));if(!card.querySelector('.favorite-game-button')){const fav=document.createElement('span');fav.className='favorite-game-button';fav.dataset.favoriteGame=id;fav.setAttribute('aria-label','お気に入り切替');fav.setAttribute('title','お気に入り切替');fav.textContent='★';card.appendChild(fav)}});this.updateFavorites();
  }
  bind(){
    $$('.sovereign-game-card').forEach(b=>b.addEventListener('click',e=>{if(e.target.closest('.favorite-game-button'))return;this.app.openGame(b.dataset.game)}));
    $$('[data-sovereign-open]').forEach(b=>b.addEventListener('click',()=>this.open(b.dataset.sovereignOpen)));$$('[data-sovereign-tab]').forEach(b=>b.addEventListener('click',()=>{this.tab=b.dataset.sovereignTab;this.render()}));$('#closeSovereign')?.addEventListener('click',()=>this.close());
    $$('[data-game-filter]').forEach(b=>b.addEventListener('click',()=>{this.filter=b.dataset.gameFilter;$$('[data-game-filter]').forEach(x=>x.classList.toggle('active',x===b));this.applyGameFilter()}));$('#gameSearchInput')?.addEventListener('input',e=>{this.query=e.target.value.trim().toLowerCase();this.applyGameFilter()});$('#randomGameButton')?.addEventListener('click',()=>{const visible=$$('#gameGrid .game-card').filter(x=>!x.hidden);if(visible.length)this.app.openGame(choice(visible).dataset.game)});
    $$('.favorite-game-button').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.toggleFavorite(b.dataset.favoriteGame)}));
  }
  patchCore(){
    const previousOpen=CasinoApp.prototype.openGame;
    CasinoApp.prototype.openGame=function(id){
      const GameClass=NEW_GAME_CLASSES[id];if(!GameClass)return previousOpen.call(this,id);
      this.closeModal();this.gameInstance?.unmount?.();this.currentGame=id;this.profile.data.lastGame=id;this.profile.save();const m=this.gameMeta(id);$('#gameEyebrow').textContent=m.eyebrow;$('#gameTitle').textContent=m.title;$('#gameMount').innerHTML='';this.showScreen('gameScreen');const gs=$('#gameScreen');if(gs)gs.scrollTop=0;this.updateMobileNav('');this.gameInstance=new GameClass(this,$('#gameMount'));this.gameInstance.mount();this.room.presence();this.audio.play('chime');this.updateNightEventUi();this.ascension?.updateAll();this.eternal?.updateAll();this.sovereign?.updateAll();
    };
    const previousRecord=CasinoApp.prototype.recordRound;
    CasinoApp.prototype.recordRound=function(payload){const net=previousRecord.call(this,payload);this.sovereign?.onRound({...payload,net});return net};
    const previousReset=ProfileStore.prototype.reset;
    ProfileStore.prototype.reset=function(name){previousReset.call(this,name);if(this.app.sovereign){this.data.sovereign=defaultSovereign();this.app.sovereign.ensureData();this.app.sovereign.updateAll()}};
    const previousTicker=CasinoApp.prototype.updateTicker;
    CasinoApp.prototype.updateTicker=function(){previousTicker.call(this);const ticker=$('#liveTicker');if(ticker&&!$('#sovereignTickerItem',ticker)){const extra='<span id="sovereignTickerItem"><b>TREASURY 6.0</b> 23 GAMES · DAILY CIRCUIT · 115 TABLE STARS</span>';ticker.insertAdjacentHTML('afterbegin',extra)}};
  }
  toggleFavorite(id){const set=new Set(this.data.favorites||[]);set.has(id)?set.delete(id):set.add(id);this.data.favorites=[...set];this.app.profile.save();this.updateFavorites();if(this.filter==='favorite')this.applyGameFilter()}
  updateFavorites(){$$('.favorite-game-button').forEach(b=>{const on=this.data.favorites.includes(b.dataset.favoriteGame);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))})}
  applyGameFilter(){
    $$('#gameGrid .game-card').forEach(card=>{const id=card.dataset.game,name=`${ALL_NAMES[id]||''} ${ALL_JP[id]||''}`.toLowerCase(),matchText=!this.query||name.includes(this.query),matchFilter=this.filter==='all'||this.filter===card.dataset.category||(this.filter==='new'&&NEW_GAME_IDS.includes(id))||(this.filter==='favorite'&&this.data.favorites.includes(id));card.hidden=!(matchText&&matchFilter)});const visible=$$('#gameGrid .game-card').filter(x=>!x.hidden).length;$('#randomGameButton small').textContent=`${visible}卓から選ぶ`;
  }
  open(tab='circuit'){this.tab=tab;this.app.closeModal();const modal=$('#sovereignModal');$('#modalBackdrop').hidden=false;modal.hidden=false;this.app.activeModal=modal;this.render()}
  close(){const modal=$('#sovereignModal');if(this.app.activeModal===modal)this.app.closeModal();else{modal.hidden=true;$('#modalBackdrop').hidden=true}}
  startCircuit(){this.ensureCircuitDay();const c=this.data.circuit;c.active=true;c.stage=0;c.lives=3;c.score=0;this.app.profile.save();this.app.audio.play('chime');this.render();this.updateAll()}
  circuitCondition(node,payload){if(node.type==='play')return true;if(node.type==='win')return payload.payout>payload.wager;if(node.type==='return')return payload.wager>0&&payload.payout/payload.wager>=node.target;return false}
  bridgeEternalGrowth(payload){
    if(!NEW_GAME_IDS.includes(payload.game)||!this.app.eternal)return;
    const e=this.app.eternal,alias={threecard:'holdem',derby:'wheel',ascent:'tower',arcana:'bingo',moonshot:'plinko'}[payload.game];
    const wager=Math.max(0,Number(payload.wager||0)),payout=Math.max(0,Number(payload.payout||0)),net=Number.isFinite(payload.net)?payload.net:payout-wager,win=net>0;
    e.data.stats.rounds++;e.data.stats.newGames++;
    e.addRenown(35+Math.floor(wager/650)+(win?55:0));
    e.addDistrict(alias,22+Math.floor(wager/900)+(win?28:0),win);
    e.addBond(alias,wager,win);e.advanceOmen();
    e.data.league.score+=Math.floor((20+wager/90+Math.max(0,net)/180)*(1+e.talentEffect('league')+e.omenEffect('league')));
    e.data.league.rounds++;if(win)e.data.league.wins++;e.data.league.bestReturn=Math.max(e.data.league.bestReturn,payout);
    e.data.keyFragments+=1+(win?1:0)+(cryptoFloat()<(e.omenEffect('key')||0)?5:0);
    while(e.data.keyFragments>=30){e.data.keyFragments-=30;e.data.keys++;this.app.toast('ETERNAL KEY 完成','鍵片30個が秘庫の鍵になりました。','◇')}
    if(cryptoFloat()<e.artifactDropChance())e.grantArtifact();
    e.updateAll();if(e.data.league.rounds%3===0)e.syncLeague();
  }
  onRound(payload){
    this.bridgeEternalGrowth(payload);
    const x=this.stat(payload.game);x.rounds++;if(payload.payout>payload.wager)x.wins++;x.best=Math.max(x.best,payload.wager?payload.payout/payload.wager:0);x.biggest=Math.max(x.biggest,payload.payout||0);x.scoreMax=Math.max(x.scoreMax||0,Number(payload.score||0));this.data.marks=clamp(this.data.marks+(x.rounds%2===0?1:0)+(payload.payout>payload.wager?1:0),0,9999);
    const events=payload.events||[];if(payload.label==='SERAPH STRAIGHT FLUSH'||events.some(e=>e.event==='threecardSF'))this.data.special.threecardSF=true;if(payload.label==='UNDERDOG VICTORY'||events.some(e=>e.event==='derbyUnderdog'))this.data.special.derbyUnderdog=true;if(payload.label==='TENFOLD ASCENT'||events.some(e=>e.event==='ascentTen'))this.data.special.ascentTen=true;if(payload.label==='PERFECT ARCANA'||events.some(e=>e.event==='arcanaPerfect'))this.data.special.arcanaPerfect=true;if(payload.label==='PERFECT MOONSHOT'||events.some(e=>e.event==='moonshotPerfect'))this.data.special.moonshotPerfect=true;
    const c=this.data.circuit;if(c.active&&c.route[c.stage]?.game===payload.game){const node=c.route[c.stage],success=this.circuitCondition(node,payload);if(success){const gain=500+(c.stage+1)*350+Math.max(0,Math.floor(payload.net||0)/20);c.score+=gain;c.stage++;this.data.marks+=1;this.app.toast('CIRCUIT STAGE CLEAR',`${c.stage} / 7 · +${fmt.format(gain)} SCORE`,'♛');if(c.stage>=c.route.length){c.active=false;c.clears++;c.best=Math.max(c.best,c.score);const first=c.claimedDay!==c.day,reward=first?8000:1500;c.claimedDay=c.day;this.data.marks+=first?12:3;const paid=this.app.profile.credit(reward,'circuit');this.app.audio.play(paid?'bigwin':'chime');if(paid>0)this.app.bigWin(paid,'CIRCUIT CROWN',`SEVEN TABLES CONQUERED${paid<reward?' · 残額NOTES':''}`);else this.app.toast('CIRCUIT CROWN','報酬LはCROWN NOTESへ変換されました。','♛')}}else{c.lives--;this.app.toast('CIRCUIT CHALLENGE FAILED',`LIFE ${c.lives} · 同じSTAGEへ再挑戦`,'◇');if(c.lives<=0){c.active=false;c.best=Math.max(c.best,c.score);this.app.toast('CIRCUIT RUN ENDED',`SCORE ${fmt.format(c.score)}`,'♜')}}}
    this.unlockMedals();this.app.profile.save();this.updateAll();if(!$('#sovereignModal').hidden)this.render();
  }
  unlockMedals(){for(const m of MEDALS){if(this.data.medals[m.id])continue;let ok=false;try{ok=Boolean(m.test(this))}catch{}if(ok){this.data.medals[m.id]=Date.now();this.data.marks+=2;this.app.toast('MEDAL UNLOCKED',m.name,m.icon);this.app.audio.play('chime')}}}
  openChest(){if(this.data.marks<150)return;this.data.marks-=150;this.data.chests++;const reward=[2000,3000,4000,6000,10000][randomInt(5)],paid=this.app.profile.credit(reward,'chest');this.unlockMedals();this.app.profile.save();this.app.audio.play(paid?'bigwin':'chime');if(paid>0)this.app.bigWin(paid,'SOVEREIGN CHEST',`CHEST ${this.data.chests}${paid<reward?' · 残額NOTES':''}`);else this.app.toast('SOVEREIGN CHEST','報酬LはCROWN NOTESへ変換されました。','◇');this.render();this.updateAll()}
  conditionText(node){return node.type==='play'?'1ラウンド完了':node.type==='win'?'勝利して純利益を得る':`返却 ${node.target.toFixed(2)}× 以上`}
  render(){
    const mount=$('#sovereignContent');if(!mount)return;$$('[data-sovereign-tab]').forEach(b=>b.classList.toggle('active',b.dataset.sovereignTab===this.tab));if(this.tab==='circuit')this.renderCircuit(mount);if(this.tab==='stars')this.renderStars(mount);if(this.tab==='medals')this.renderMedals(mount);if(this.tab==='chest')this.renderChest(mount)
  }
  renderCircuit(mount){const c=this.data.circuit;if(!c.active){mount.innerHTML=`<div class="circuit-intro"><div class="circuit-crown"><i></i><b>♛</b><span>7</span></div><p class="eyebrow">DAILY SEVEN-TABLE GAUNTLET · ${c.day}</p><h3>七つの卓を連続攻略</h3><p>日替わりで選ばれた7卓へ挑戦。各STAGEの条件を満たし、3つのLIFEが尽きる前に王冠へ到達してください。最初の当日クリアは8,000 Lと12 MARKS。</p><div class="circuit-record"><span><small>CLEARS</small><b>${c.clears}</b></span><span><small>BEST SCORE</small><b>${fmt.format(c.best)}</b></span><span><small>TODAY REWARD</small><b>${c.claimedDay===c.day?'1,500 L':'8,000 L'}</b></span></div><button id="startCircuit" class="primary-cta" type="button"><span>今日の巡回を始める</span><i>BEGIN CROWN CIRCUIT</i></button><div class="circuit-preview">${c.route.map((n,i)=>`<span><i>${ALL_ICONS[n.game]}</i><b>${i+1}</b><small>${ALL_JP[n.game]}</small></span>`).join('')}</div></div>`;$('#startCircuit',mount).addEventListener('click',()=>this.startCircuit());return}
    const node=c.route[c.stage];mount.innerHTML=`<div class="circuit-live-head"><div><p class="eyebrow">DAILY CROWN CIRCUIT · RUN LIVE</p><h3>STAGE ${c.stage+1} / 7</h3><p>${this.conditionText(node)}</p></div><div class="circuit-vitals"><span>♥ ${c.lives}</span><span>✦ ${fmt.format(c.score)}</span></div></div><div class="circuit-track">${c.route.map((n,i)=>`<button data-circuit-stage="${i}" class="${i<c.stage?'done':i===c.stage?'current':''}" type="button" ${i===c.stage?'':'disabled'}><i>${ALL_ICONS[n.game]}</i><b>${i+1}</b><small>${ALL_JP[n.game]}</small></button>`).join('')}</div><article class="circuit-current"><i>${ALL_ICONS[node.game]}</i><div><small>${ALL_NAMES[node.game]}</small><h4>${ALL_JP[node.game]}</h4><p>${this.conditionText(node)}</p></div><button id="openCircuitGame" class="primary-cta" type="button"><span>この卓へ向かう</span><i>PLAY STAGE ${c.stage+1}</i></button></article><button id="abandonCircuit" class="circuit-abandon" type="button">RUNを破棄</button>`;$('#openCircuitGame',mount).addEventListener('click',()=>{this.close();this.app.openGame(node.game)});$('#abandonCircuit',mount).addEventListener('click',()=>{c.active=false;this.app.profile.save();this.render();this.updateAll()})
  }
  renderStars(mount){mount.innerHTML=`<div class="stars-head"><div><p class="eyebrow">23 TABLES · FIVE MILESTONES EACH</p><h3>TABLE STARS</h3><p>各卓でラウンド、勝利、高倍率、熟練を達成すると最大5 STAR。合計115 STARを目指します。</p></div><strong>${this.totalStars()} <small>/ 115</small></strong></div><div class="table-star-grid">${ALL_GAMES.map(id=>{const x=this.stat(id),stars=this.starsFor(id);return`<button data-star-game="${id}" type="button"><i>${ALL_ICONS[id]}</i><span><small>${ALL_NAMES[id]}</small><b>${ALL_JP[id]}</b><em>${'★★★★★'.split('').map((z,i)=>`<u class="${i<stars?'on':''}">${z}</u>`).join('')}</em></span><strong>${x.rounds}R · ${x.wins}W</strong></button>`}).join('')}</div>`;$$('[data-star-game]',mount).forEach(b=>b.addEventListener('click',()=>{this.close();this.app.openGame(b.dataset.starGame)}))}
  renderMedals(mount){const count=Object.keys(this.data.medals).length;mount.innerHTML=`<div class="medal-head"><div><p class="eyebrow">THIRTY-SIX PALACE MEDALS</p><h3>王宮メダル庫</h3><p>ゲーム、成長、PvP、蒐集、CROWN CIRCUITの記録を刻む36の徽章。未達成は条件だけが表示されます。</p></div><strong>${count} / 36</strong></div><div class="medal-grid">${MEDALS.map(m=>{const got=this.data.medals[m.id];return`<article class="${got?'unlocked':'locked'}"><i>${got?m.icon:'◇'}</i><b>${got?m.name:'？？？'}</b><small>${m.desc}</small><span>${got?'UNLOCKED':'SEALED'}</span></article>`}).join('')}</div>`}
  renderChest(mount){const ready=this.data.marks>=150;mount.innerHTML=`<div class="sovereign-chest-room ${ready?'ready':''}"><div class="sovereign-chest-art"><i></i><b>♛</b><span>◇</span></div><p class="eyebrow">CROWN MARK EXCHANGE</p><h3>SOVEREIGN CHEST</h3><p>ゲーム、勝利、CIRCUIT STAGE、メダル解除でCROWN MARKを獲得。150 MARKSで王庫を1回開けます。</p><div class="mark-meter"><div><span>CROWN MARKS</span><b>${this.data.marks} / 150</b></div><i><u style="width:${clamp(this.data.marks/150*100,0,100)}%"></u></i></div><div class="chest-stats"><span><small>CHESTS OPENED</small><b>${this.data.chests}</b></span><span><small>MEDALS</small><b>${Object.keys(this.data.medals).length} / 36</b></span><span><small>TABLE STARS</small><b>${this.totalStars()} / 115</b></span></div><button id="openSovereignChest" class="primary-cta" type="button" ${ready?'':'disabled'}><span>${ready?'王庫を開く':'まだ封印されています'}</span><i>${ready?'OPEN CHEST':'NEED 150 MARKS'}</i></button></div>`;$('#openSovereignChest',mount)?.addEventListener('click',()=>this.openChest())}
  updateAll(){if(!$('#sovereignRibbon'))return;const c=this.data.circuit;$('#circuitRibbonText').textContent=c.active?`STAGE ${c.stage+1}/7 · ♥${c.lives}`:'READY · 3 LIFE';$('#circuitRibbonFill').style.width=`${c.active?c.stage/7*100:0}%`;$('#starRibbonText').textContent=`${this.totalStars()} / 115`;$('#medalRibbonText').textContent=`${Object.keys(this.data.medals).length} / 36`;$('#markRibbonText').textContent=`${this.data.marks} / 150 MARKS`;this.updateFavorites()}
}

function shuffledBy(values,rng){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

const sovereign = new SovereignSystem(app);
app.sovereign = sovereign;
window.__LUX_SOVEREIGN__ = sovereign;
app.updateHud();
app.updateTicker();

})();
