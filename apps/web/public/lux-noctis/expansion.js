'use strict';

(() => {
  const core = window.__LUX_CORE__;
  if (!core) throw new Error('LUX NOCTIS core bridge is unavailable');
  const {
    $, $$, clamp, wait, fmt, formatL, dateKey, cryptoFloat, randomInt, choice, shuffled, escapeHtml,
    NIGHT_EVENTS, RANKS_CARDS, makeDeck, cardHtml, syncCardRow, handValue, GAME_META,
    ProfileStore, RoomClient, CasinoApp, GameBase,
    BlackjackGame, RouletteGame, SlotsGame, BaccaratGame, PokerGame, SicBoGame, KenoGame,
    WHEEL_ORDER, RED_NUMBERS, DICE_PIPS
  } = core;
  const EXPANSION_VERSION = 3;
  const MASTER_GAMES = ['blackjack','roulette','slots','baccarat','poker','sicbo','keno','craps','dragon','wheel','mines','plinko','hilo'];
  const GAME_LABELS = {
    blackjack:'NOCTURNE BLACKJACK', roulette:'STELLAR ROULETTE', slots:'CELESTIAL VAULT', baccarat:'VELVET BACCARAT', poker:'ROYAL DRAW', sicbo:'OBSIDIAN SIC BO', keno:'ORACLE KENO',
    craps:'MOONSTONE CRAPS', dragon:'DRAGON & TIGER', wheel:'FORTUNE CONSTELLATION', mines:'ABYSSAL MINES', plinko:'STARFALL PLINKO', hilo:'MIDNIGHT HI-LO'
  };
  const GAME_ICONS = {blackjack:'♠',roulette:'◉',slots:'☾',baccarat:'♦',poker:'♛',sicbo:'⚄',keno:'◎',craps:'⚂',dragon:'龍',wheel:'✺',mines:'◆',plinko:'⌁',hilo:'↕'};
  const RARITY = {
    common:{name:'COMMON',jp:'コモン',weight:54,value:8},
    rare:{name:'RARE',jp:'レア',weight:28,value:18},
    epic:{name:'EPIC',jp:'エピック',weight:12,value:45},
    legendary:{name:'LEGENDARY',jp:'レジェンダリー',weight:5,value:100},
    mythic:{name:'MYTHIC',jp:'ミシック',weight:1,value:280}
  };

  const NEW_GAME_META = {
    craps:{short:'クラップス',eyebrow:'MOONSTONE DICE · PASS LINE',title:'MOONSTONE CRAPS',help:`<h3>月石のクラップス</h3><p>2個の骰子で遊ぶクラップスです。PASS / DON’T PASSはポイント制、FIELD・ANY 7・PLACE 6/8は1ロールで決着します。</p><div class="rule-grid"><div class="rule"><b>PASS</b>最初の7・11で勝利、2・3・12で敗北。4/5/6/8/9/10はPOINTになり、7より先にPOINTを再度出せば勝利。</div><div class="rule"><b>DON’T PASS</b>最初の2・3で勝利、7・11で敗北、12はPUSH。POINT後は7が先なら勝利。</div><div class="rule"><b>FIELD</b>2・3・4・9・10・11・12で勝利。2と12は高配当。</div><div class="rule"><b>PLACE / ANY 7</b>指定目または7を1回のロールで狙います。</div></div>`},
    dragon:{short:'ドラゴンタイガー',eyebrow:'TWO CARD SHOWDOWN',title:'DRAGON & TIGER',help:`<h3>一枚勝負</h3><p>DRAGONとTIGERへ1枚ずつ配り、ランクが高い側を予想します。Aが最小、Kが最大です。</p><div class="rule-grid"><div class="rule"><b>DRAGON / TIGER</b>返却2倍</div><div class="rule"><b>TIE</b>同ランクで返却9倍</div><div class="rule"><b>SUITED TIE</b>ランクとスートが一致すると返却51倍</div><div class="rule"><b>公平性</b>毎ラウンド新しい8デックシューから抽選します。</div></div>`},
    wheel:{short:'ビッグホイール',eyebrow:'TWENTY-FOUR CELESTIAL SEGMENTS',title:'FORTUNE CONSTELLATION',help:`<h3>星座大輪</h3><p>24分割された大輪を回し、停止したセグメントの倍率で配当が決まります。玉・針・結果は同じ角度式で同期します。</p><div class="rule-grid"><div class="rule"><b>MISS</b>配当なし</div><div class="rule"><b>×1</b>賭け額を返却</div><div class="rule"><b>×2 / ×5</b>表示倍率で返却</div><div class="rule"><b>MOON JACKPOT</b>希少な高倍率セグメント</div></div>`},
    mines:{short:'マインズ',eyebrow:'RISK & CASH OUT',title:'ABYSSAL MINES',help:`<h3>深淵採掘</h3><p>25マスの中から安全な星晶を開き、好きな時にCASH OUTします。地雷数が多いほど倍率の伸びが速くなります。</p><div class="rule-grid"><div class="rule"><b>3 / 5 / 7 / 9 MINES</b>難易度を選択</div><div class="rule"><b>SAFE</b>安全マスを開くたび倍率上昇</div><div class="rule"><b>MINE</b>地雷を引くとそのラウンドは敗北</div><div class="rule"><b>CASH OUT</b>現在倍率でいつでも確定</div></div>`},
    plinko:{short:'プリンコ',eyebrow:'PHYSICS STARFALL · 12 ROWS',title:'STARFALL PLINKO',help:`<h3>星降りプリンコ</h3><p>星球が12段のピンを落下し、到達したポケットの倍率で配当されます。LOW / MEDIUM / HIGHで配当分布が変化します。</p><div class="rule-grid"><div class="rule"><b>LOW</b>中央が安定、端は控えめ</div><div class="rule"><b>MEDIUM</b>標準的なリスク</div><div class="rule"><b>HIGH</b>中央は厳しく、両端が高倍率</div><div class="rule"><b>同期</b>物理軌道と最終ポケットは同じパスから描画</div></div>`},
    hilo:{short:'ハイロー',eyebrow:'CARD STREAK · CASH OUT',title:'MIDNIGHT HI-LO',help:`<h3>真夜中の連続予想</h3><p>次のカードが現在よりHIGHかLOWかを予想します。正解するほど倍率が積み上がり、好きな時にCASH OUTできます。</p><div class="rule-grid"><div class="rule"><b>HIGH</b>次のランクが高いと成功</div><div class="rule"><b>LOW</b>次のランクが低いと成功</div><div class="rule"><b>同ランク</b>敗北扱い</div><div class="rule"><b>倍率</b>現在カードに応じた確率から自動計算</div></div>`}
  };
  Object.assign(GAME_META, NEW_GAME_META);

  const EXTRA_NIGHT_EVENTS = [
    {id:'mastery',icon:'♜',name:'MASTERY REVEL',jp:'熟練の祝宴',desc:'ゲーム熟練度XPが2倍になります。',rounds:5},
    {id:'collector',icon:'◆',name:'COLLECTOR MOON',jp:'蒐集月',desc:'カプセル発見率と星屑獲得量が上昇します。',rounds:4},
    {id:'chronicle',icon:'▤',name:'CHRONICLE RUSH',jp:'年代記の加速',desc:'シーズンXPが2倍になります。',rounds:5},
    {id:'raid',icon:'⚔',name:'RAID ECLIPSE',jp:'討伐星蝕',desc:'協力レイドへのダメージが2倍になります。',rounds:4},
    {id:'duel',icon:'☷',name:'DUEL FEVER',jp:'決闘熱',desc:'PVPメダルとレーティング報酬が強化されます。',rounds:4},
    {id:'nebula',icon:'✺',name:'NEBULA TREASURY',jp:'星雲財宝',desc:'各ラウンドで得る星屑が2倍になります。',rounds:4},
    {id:'mercy',icon:'☾',name:'MOONLIT MERCY',jp:'月光の慈悲',desc:'敗北時に賭け額の5%が星屑へ変換されます。',rounds:4},
    {id:'prism',icon:'◇',name:'PRISMATIC NIGHT',jp:'虹晶夜',desc:'コレクションの高レア出現率が上昇します。',rounds:3}
  ];
  for (const item of EXTRA_NIGHT_EVENTS) if (!NIGHT_EVENTS.some(x => x.id === item.id)) NIGHT_EVENTS.push(item);

  const TREE_NODES = [
    {id:'fortune_1',branch:'fortune',tier:1,cost:1,icon:'✦',name:'星屑の勘',desc:'獲得XP +8%',effect:{xp:0.08}},
    {id:'fortune_2',branch:'fortune',tier:1,cost:1,icon:'L',name:'金の余韻',desc:'勝利時の星屑 +20%',effect:{stardust:0.2}},
    {id:'fortune_3',branch:'fortune',tier:2,cost:2,requires:['fortune_1'],icon:'◇',name:'金庫共鳴',desc:'ECLIPSE CHARGE +20%',effect:{vault:0.2}},
    {id:'fortune_4',branch:'fortune',tier:2,cost:2,requires:['fortune_2'],icon:'🔥',name:'連勝加速',desc:'連勝時の熟練度XP +25%',effect:{streakMastery:0.25}},
    {id:'fortune_5',branch:'fortune',tier:3,cost:2,requires:['fortune_3'],icon:'🎁',name:'深夜の恩寵',desc:'デイリーギフト +10%',effect:{daily:0.1}},
    {id:'fortune_6',branch:'fortune',tier:3,cost:2,requires:['fortune_4'],icon:'☾',name:'敗北の結晶',desc:'敗北時にも少量の星屑を得る',effect:{lossDust:1}},
    {id:'fortune_7',branch:'fortune',tier:4,cost:3,requires:['fortune_5','fortune_6'],icon:'♛',name:'運命王冠',desc:'全XP +12%、星屑 +12%',effect:{xp:0.12,stardust:0.12}},
    {id:'fortune_8',branch:'fortune',tier:5,cost:4,requires:['fortune_7'],icon:'∞',name:'無限の夜',desc:'10ラウンドごとにボーナスカプセル',effect:{roundCapsule:1}},

    {id:'collector_1',branch:'collector',tier:1,cost:1,icon:'◆',name:'蒐集家の眼',desc:'カプセル発見率 +3%',effect:{drop:0.03}},
    {id:'collector_2',branch:'collector',tier:1,cost:1,icon:'✧',name:'欠片精錬',desc:'重複時の王冠欠片 +25%',effect:{duplicate:0.25}},
    {id:'collector_3',branch:'collector',tier:2,cost:2,requires:['collector_1'],icon:'▦',name:'アルバム記憶',desc:'アルバム完成報酬 +25%',effect:{album:0.25}},
    {id:'collector_4',branch:'collector',tier:2,cost:2,requires:['collector_2'],icon:'◈',name:'希少反応',desc:'EPIC以上の抽選率がわずかに上昇',effect:{rarity:1}},
    {id:'collector_5',branch:'collector',tier:3,cost:2,requires:['collector_3'],icon:'♜',name:'熟練蒐集',desc:'熟練度XP +15%',effect:{mastery:0.15}},
    {id:'collector_6',branch:'collector',tier:3,cost:2,requires:['collector_4'],icon:'✺',name:'星屑回収',desc:'全ラウンド星屑 +15%',effect:{stardust:0.15}},
    {id:'collector_7',branch:'collector',tier:4,cost:3,requires:['collector_5','collector_6'],icon:'♕',name:'大蒐集家',desc:'カプセル価格 -20%',effect:{capsuleCost:0.2}},
    {id:'collector_8',branch:'collector',tier:5,cost:4,requires:['collector_7'],icon:'◇',name:'神話の磁場',desc:'MYTHICの基礎出現率が2倍',effect:{mythic:1}},

    {id:'social_1',branch:'social',tier:1,cost:1,icon:'♟',name:'夜会の絆',desc:'PARTY CROWN貢献 +20%',effect:{party:0.2}},
    {id:'social_2',branch:'social',tier:1,cost:1,icon:'⚔',name:'決闘の礼式',desc:'PVPメダル +20%',effect:{duelMedal:0.2}},
    {id:'social_3',branch:'social',tier:2,cost:2,requires:['social_1'],icon:'◈',name:'共闘刻印',desc:'レイドダメージ +25%',effect:{raid:0.25}},
    {id:'social_4',branch:'social',tier:2,cost:2,requires:['social_2'],icon:'☷',name:'不屈の名誉',desc:'敗北時レーティング減少 -25%',effect:{ratingGuard:0.25}},
    {id:'social_5',branch:'social',tier:3,cost:2,requires:['social_3'],icon:'🔥',name:'祝祭伝播',desc:'PARTY CROWN報酬 +30%',effect:{partyReward:0.3}},
    {id:'social_6',branch:'social',tier:3,cost:2,requires:['social_4'],icon:'♛',name:'王者の歩み',desc:'PVP勝利時シーズンXP +50%',effect:{duelSeason:0.5}},
    {id:'social_7',branch:'social',tier:4,cost:3,requires:['social_5','social_6'],icon:'✦',name:'宮殿名声',desc:'全熟練度XP +10%、レイド +10%',effect:{mastery:0.1,raid:0.1}},
    {id:'social_8',branch:'social',tier:5,cost:4,requires:['social_7'],icon:'♛',name:'夜王の契約',desc:'毎週最初のPVP敗北をTIE扱い',effect:{weeklyShield:1}}
  ];

  const COLLECTION_SERIES = [
    {id:'nocturne',name:'NOCTURNE REGALIA',jp:'夜宮の礼装',tone:'#a765d5'},
    {id:'aurora',name:'AURORA MIRAGE',jp:'極光の幻景',tone:'#44d3e8'},
    {id:'crimson',name:'CRIMSON VELVET',jp:'深紅の絹夜',tone:'#e34867'},
    {id:'celestial',name:'CELESTIAL ARCHIVE',jp:'星界の記録',tone:'#718bff'},
    {id:'obsidian',name:'OBSIDIAN OATH',jp:'黒曜の誓約',tone:'#c89a5b'},
    {id:'eclipse',name:'ECLIPSE MYTH',jp:'星蝕神話',tone:'#f1c972'},
    {id:'lunar',name:'LUNAR REQUIEM',jp:'月葬の鎮魂',tone:'#b8c8ff'},
    {id:'infernal',name:'INFERNAL ROYALTY',jp:'煉獄の王統',tone:'#ff795a'},
    {id:'verdant',name:'VERDANT FORTUNE',jp:'翠星の幸運',tone:'#67e3a2'},
    {id:'royal',name:'ROYAL MIDNIGHT',jp:'真夜中王家',tone:'#ffdf8b'},
    {id:'void',name:'VOID WHISPER',jp:'虚無の囁き',tone:'#9b7bff'},
    {id:'solar',name:'SOLAR COVENANT',jp:'太陽の盟約',tone:'#ffb85c'}
  ];
  const COLLECTION_TYPES = [
    {id:'avatar',name:'AVATAR',jp:'アバター',glyphs:['♜','☾','✦','♠','♦','♣','♥','⚜','☄','✺','⟁','∞']},
    {id:'frame',name:'FRAME',jp:'フレーム',glyphs:['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']},
    {id:'chip',name:'CHIP',jp:'チップ',glyphs:['L','◉','◇','◆','✧','✦','☾','♛','♜','⚄','◎','∞']},
    {id:'back',name:'CARD BACK',jp:'カード裏面',glyphs:['♠','♦','☾','✦','◇','♛','⚜','◈','◎','☄','龍','∞']},
    {id:'aura',name:'TABLE AURA',jp:'テーブルオーラ',glyphs:['✧','✺','☾','◈','◇','♛','⚡','❄','🔥','☄','◎','∞']},
    {id:'emote',name:'EMOTE',jp:'エモート',glyphs:['👏','🔥','🍀','🌙','✨','👑','🎲','🃏','💎','⚔','🌌','🦋']}
  ];
  const COLLECTION = [];
  COLLECTION_SERIES.forEach((series, si) => COLLECTION_TYPES.forEach((type, ti) => {
    const rarityIndex = (si + ti) % 12;
    const rarity = rarityIndex === 11 ? 'mythic' : rarityIndex >= 8 ? 'legendary' : rarityIndex >= 5 ? 'epic' : rarityIndex >= 2 ? 'rare' : 'common';
    COLLECTION.push({
      id:`${series.id}_${type.id}`,
      series:series.id,
      seriesName:series.name,
      type:type.id,
      typeName:type.jp,
      name:`${series.jp}・${type.jp}`,
      glyph:type.glyphs[(si * 2 + ti) % type.glyphs.length],
      rarity,
      tone:series.tone,
      index:COLLECTION.length
    });
  }));

  const FESTIVALS = [
    {id:'moon',icon:'☾',name:'MOONLIGHT MASQUERADE',jp:'月光仮面祭',desc:'熟練度とコレクションに特化した週。毎日最初のカプセルが割引。',bonus:'MASTERY +20% · CAPSULE -20%'},
    {id:'eclipse',icon:'◈',name:'ECLIPSE SIEGE',jp:'星蝕攻城祭',desc:'協力レイドが激化し、討伐報酬が増加します。',bonus:'RAID DAMAGE +25% · REWARD +25%'},
    {id:'crown',icon:'♛',name:'CROWN DUEL WEEK',jp:'王冠決闘週',desc:'PVP勝利で追加メダルと年代記XPを獲得します。',bonus:'PVP MEDAL +2 · SEASON XP +30%'},
    {id:'nebula',icon:'✺',name:'NEBULA TREASURE FAIR',jp:'星雲財宝市',desc:'星屑と王冠欠片が大量に流れ込む収集祭。',bonus:'STARDUST +25% · DUPLICATE SHARD +20%'},
    {id:'roulette',icon:'◉',name:'SEVEN TABLE CARNIVAL',jp:'七卓大祭',desc:'多彩なゲームを遊ぶほどボーナスが増える宮殿祭。',bonus:'VARIETY BONUS · MYSTERY DOOR +3%'}
  ];

  const WEEKLY_POOL = [
    {id:'rounds',icon:'♜',title:'50ラウンド遊ぶ',event:'round',target:50,reward:{coins:2500,dust:180,tokens:2}},
    {id:'wins',icon:'✦',title:'15回勝利する',event:'win',target:15,reward:{coins:3000,dust:220,tokens:2}},
    {id:'wager',icon:'L',title:'合計250,000 Lをプレイ',event:'wager',target:250000,reward:{coins:3500,dust:250,tokens:3}},
    {id:'variety',icon:'▦',title:'異なる10ゲームを遊ぶ',event:'variety',target:10,reward:{coins:3000,dust:300,tokens:3}},
    {id:'mastery',icon:'♛',title:'熟練度を合計5上げる',event:'masteryLevel',target:5,reward:{coins:2200,dust:320,tokens:3}},
    {id:'duel',icon:'⚔',title:'PVPで3勝する',event:'duelWin',target:3,reward:{coins:4500,dust:300,tokens:5}},
    {id:'raid',icon:'◈',title:'レイドへ50,000ダメージ',event:'raidDamage',target:50000,reward:{coins:3500,dust:350,tokens:4}},
    {id:'capsule',icon:'◆',title:'カプセルを4個開ける',event:'capsule',target:4,reward:{coins:2200,dust:250,tokens:3}}
  ];

  const SEASON_REWARDS = Array.from({length:40}, (_, i) => {
    const tier = i + 1;
    if (tier % 10 === 0) return {tier,type:'capsule',amount:2,label:'ROYAL CAPSULE ×2',icon:'♛'};
    if (tier % 5 === 0) return {tier,type:'shards',amount:100 + tier * 4,label:`王冠欠片 ${100 + tier * 4}`,icon:'◇'};
    if (tier % 4 === 0) return {tier,type:'tokens',amount:2,label:'イベントトークン ×2',icon:'✺'};
    if (tier % 3 === 0) return {tier,type:'dust',amount:120 + tier * 3,label:`星屑 ${120 + tier * 3}`,icon:'✦'};
    return {tier,type:'coins',amount:500 + tier * 30,label:`${fmt.format(500 + tier * 30)} L`,icon:'L'};
  });

  const deepMerge = (base, saved) => {
    if (!saved || typeof saved !== 'object') return typeof structuredClone === 'function' ? structuredClone(base) : JSON.parse(JSON.stringify(base));
    const out = Array.isArray(base) ? [...saved] : {...base};
    for (const [key, value] of Object.entries(saved)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) out[key] = deepMerge(base[key], value);
      else out[key] = value;
    }
    return out;
  };

  const weekKey = (date = new Date()) => {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const day = (jst.getUTCDay() + 6) % 7;
    jst.setUTCDate(jst.getUTCDate() - day);
    return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth()+1).padStart(2,'0')}-${String(jst.getUTCDate()).padStart(2,'0')}`;
  };
  const seasonKey = (date = new Date()) => {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth()+1).padStart(2,'0')}`;
  };
  const hashNumber = text => [...String(text)].reduce((a, c) => ((a * 33) ^ c.charCodeAt(0)) >>> 0, 5381);

  const defaultAscension = () => ({
    version:EXPANSION_VERSION,
    stardust:250,
    crownShards:0,
    eventTokens:0,
    capsules:1,
    mastery:Object.fromEntries(MASTER_GAMES.map(id => [id,{level:1,xp:0,rounds:0,wins:0,best:0}])),
    constellation:{points:1,nodes:{},earnedFromLevel:0,earnedFromMastery:0},
    collection:{owned:{},equipped:{avatar:'nocturne_avatar',frame:'nocturne_frame',chip:'nocturne_chip',back:'nocturne_back',aura:'nocturne_aura',emote:'nocturne_emote'},opened:0,duplicates:0,albums:{},filter:'all'},
    season:{id:seasonKey(),xp:0,claimed:{},premium:false},
    weekly:{id:'',items:[],variety:[]},
    duel:{rating:1000,medals:0,wins:0,losses:0,ties:0,streak:0,bestStreak:0,matches:0,claimed:{},receipts:{},weeklyShieldUsed:''},
    raid:{claimed:{},totalDamage:0,lastState:null},
    mystery:{opened:0,lastAt:0},
    stats:{gamesPlayed:{},collectionDrops:0,seasonClaims:0,abilityNodes:0},
    lastFestival:''
  });

  function rarityRoll(modifier = 0) {
    const event = window.__LUX_NOCTIS__?.activeNightEvent?.();
    const weights = {
      common:54,
      rare:28,
      epic:12 + modifier * 2,
      legendary:5 + modifier,
      mythic:1 + modifier * .35
    };
    if (event?.id === 'prism') { weights.epic += 5; weights.legendary += 3; weights.mythic += 1; weights.common -= 9; }
    const total = Object.values(weights).reduce((a,b)=>a+b,0);
    let roll = cryptoFloat() * total;
    for (const id of ['mythic','legendary','epic','rare','common']) {
      roll -= weights[id];
      if (roll <= 0) return id;
    }
    return 'common';
  }

  function chooseByRarity(rarity) {
    const pool = COLLECTION.filter(x => x.rarity === rarity);
    return choice(pool.length ? pool : COLLECTION);
  }

  function expansionGameCardsHtml() {
    return `
      <button class="game-card expansion-game-card craps-card" data-game="craps" type="button">
        <span class="new-ribbon">NEW</span><div class="game-art expansion-art craps-art"><div class="craps-die one">⚂</div><div class="craps-die two">⚄</div><div class="craps-line">PASS</div></div>
        <div class="game-copy"><span class="game-tag">POINT & ONE-ROLL BETS</span><h4>MOONSTONE<br />CRAPS</h4><p>ポイント、FIELD、ANY 7。月石の骰子を転がせ。</p><div><b>入場 100 L〜</b><i>PLAY →</i></div></div>
      </button>
      <button class="game-card expansion-game-card dragon-card" data-game="dragon" type="button">
        <span class="new-ribbon">NEW</span><div class="game-art expansion-art dragon-art"><div class="dragon-glyph">龍</div><div class="tiger-glyph">虎</div><div class="versus-flare">VS</div></div>
        <div class="game-copy"><span class="game-tag">TWO CARD SHOWDOWN</span><h4>DRAGON<br />& TIGER</h4><p>一枚だけの最速決着。龍か虎か、同点か。</p><div><b>入場 100 L〜</b><i>PLAY →</i></div></div>
      </button>
      <button class="game-card expansion-game-card fortune-card" data-game="wheel" type="button">
        <div class="game-art expansion-art fortune-art"><div class="fortune-mini-wheel"><i></i><b>✺</b></div><div class="fortune-pointer">◆</div></div>
        <div class="game-copy"><span class="game-tag">24 CELESTIAL SEGMENTS</span><h4>FORTUNE<br />CONSTELLATION</h4><p>針と星座が完全同期する黄金の大輪。</p><div><b>1回 100 L〜</b><i>PLAY →</i></div></div>
      </button>
      <button class="game-card expansion-game-card mines-card" data-game="mines" type="button">
        <div class="game-art expansion-art mines-art"><div class="mine-grid-art">${Array.from({length:16},(_,i)=>`<i class="${[3,10].includes(i)?'danger':''}">${[3,10].includes(i)?'◆':'✦'}</i>`).join('')}</div></div>
        <div class="game-copy"><span class="game-tag">RISK · REVEAL · CASH OUT</span><h4>ABYSSAL<br />MINES</h4><p>安全な星晶を掘り続け、深淵が開く前に回収せよ。</p><div><b>1回 100 L〜</b><i>PLAY →</i></div></div>
      </button>
      <button class="game-card expansion-game-card plinko-card" data-game="plinko" type="button">
        <div class="game-art expansion-art plinko-art"><div class="plinko-mini-ball">✦</div>${Array.from({length:5},(_,r)=>`<div class="plinko-mini-row r${r}">${Array.from({length:r+3},()=>'<i></i>').join('')}</div>`).join('')}<div class="plinko-mini-slots"><b>5×</b><b>.2×</b><b>5×</b></div></div>
        <div class="game-copy"><span class="game-tag">12 ROW PHYSICS</span><h4>STARFALL<br />PLINKO</h4><p>星球の軌道が光のピンを抜け、倍率へ落ちる。</p><div><b>1球 100 L〜</b><i>PLAY →</i></div></div>
      </button>
      <button class="game-card expansion-game-card hilo-game-card" data-game="hilo" type="button">
        <div class="game-art expansion-art hilo-art"><div class="hilo-mini-card low">4<span>♣</span></div><div class="hilo-arrows">↕</div><div class="hilo-mini-card high">Q<span>♥</span></div></div>
        <div class="game-copy"><span class="game-tag">BUILD A STREAK</span><h4>MIDNIGHT<br />HI-LO</h4><p>HIGHかLOWか。正解を重ねて好きな時に確定。</p><div><b>1回 100 L〜</b><i>PLAY →</i></div></div>
      </button>`;
  }

  function modalHtml() {
    return `
      <section id="ascensionModal" class="modal palace-modal ascension-modal wide-modal" hidden aria-modal="true" role="dialog">
        <button class="modal-close" data-close-expansion-modal type="button">×</button>
        <div class="modal-crest">✦</div><p class="eyebrow">PALACE ASCENSION</p><h2>夜宮成長盤</h2>
        <div class="expansion-tabs"><button class="active" data-asc-tab="constellation" type="button">能力星座</button><button data-asc-tab="mastery" type="button">ゲーム熟練度</button><button data-asc-tab="chronicle" type="button">年代記パス</button></div>
        <div id="ascensionContent"></div>
      </section>

      <section id="collectionModal" class="modal palace-modal collection-modal wide-modal" hidden aria-modal="true" role="dialog">
        <button class="modal-close" data-close-expansion-modal type="button">×</button>
        <div class="modal-crest">◆</div><p class="eyebrow">THE GRAND COLLECTION</p><h2>夜宮蒐集録</h2>
        <div class="collection-wallet"><span><i>✦</i><b id="collectionDust">0</b><small>STAR DUST</small></span><span><i>◇</i><b id="collectionShards">0</b><small>CROWN SHARDS</small></span><span><i>▣</i><b id="collectionCapsules">0</b><small>CAPSULES</small></span></div>
        <div class="expansion-tabs"><button class="active" data-collection-tab="items" type="button">コレクション</button><button data-collection-tab="albums" type="button">アルバム</button><button data-collection-tab="capsule" type="button">星晶カプセル</button></div>
        <div id="collectionContent"></div>
      </section>

      <section id="eventHubModal" class="modal palace-modal event-hub-modal wide-modal" hidden aria-modal="true" role="dialog">
        <button class="modal-close" data-close-expansion-modal type="button">×</button>
        <div class="modal-crest">✺</div><p class="eyebrow">LIVE PALACE OPERATIONS</p><h2>宮殿イベントホール</h2>
        <div class="expansion-tabs"><button class="active" data-event-tab="festival" type="button">週間祭典</button><button data-event-tab="contracts" type="button">週間契約</button><button data-event-tab="raid" type="button">協力レイド</button></div>
        <div id="eventHubContent"></div>
      </section>

      <section id="duelModal" class="modal palace-modal duel-modal wide-modal" hidden aria-modal="true" role="dialog">
        <button class="modal-close" data-close-expansion-modal type="button">×</button>
        <div class="modal-crest">⚔</div><p class="eyebrow">CROWN DUEL ARENA</p><h2>対戦闘技場</h2>
        <div id="duelContent"></div>
      </section>

      <section id="mysteryModal" class="modal palace-modal mystery-modal" hidden aria-modal="true" role="dialog">
        <button class="modal-close" data-close-expansion-modal type="button">×</button>
        <div class="mystery-sigil">?</div><p class="eyebrow">A SECRET INVITATION</p><h2>運命の三扉</h2><p>一つだけ選んでください。扉の向こうは、開くまで誰にも分かりません。</p>
        <div class="mystery-doors"><button data-mystery-door="0" type="button"><i>Ⅰ</i><b>STAR DOOR</b><span>✦</span></button><button data-mystery-door="1" type="button"><i>Ⅱ</i><b>MOON DOOR</b><span>☾</span></button><button data-mystery-door="2" type="button"><i>Ⅲ</i><b>CROWN DOOR</b><span>♛</span></button></div>
        <div id="mysteryReveal" class="mystery-reveal" hidden></div>
      </section>`;
  }

  function injectExpansionUi(app) {
    document.title = 'LUX NOCTIS ETERNAL CROWN — 18 Games & Live PvP';
    const sectionCount = $('.games-section .section-heading > span');
    if (sectionCount) sectionCount.textContent = '18 GAMES · ODYSSEY · 5 LIVE PVP MODES';
    const gameGrid = $('#gameGrid');
    if (gameGrid && !gameGrid.querySelector('[data-game="craps"]')) gameGrid.insertAdjacentHTML('beforeend', expansionGameCardsHtml());

    const eventBar = $('#nightEventBar');
    if (eventBar && !$('#ascensionRibbon')) eventBar.insertAdjacentHTML('afterend', `
      <section id="ascensionRibbon" class="ascension-ribbon">
        <button id="ascensionButton" type="button"><i>✦</i><span><small>PALACE ASCENSION</small><b id="ascensionPointsRibbon">1 POINT</b></span></button>
        <button id="collectionButton" type="button"><i>◆</i><span><small>COLLECTION</small><b id="collectionRibbon">6 / ${COLLECTION.length}</b></span></button>
        <button id="chronicleButton" type="button"><i>▤</i><span><small>MIDNIGHT CHRONICLE</small><b id="seasonRibbon">TIER 1 / 40</b></span><em><u id="seasonRibbonFill"></u></em></button>
        <button id="eventHubButton" type="button"><i>✺</i><span><small>LIVE FESTIVAL</small><b id="festivalRibbon">LOADING</b></span></button>
        <button id="duelButton" class="duel-ribbon-button" type="button"><i>⚔</i><span><small>CROWN DUEL</small><b id="duelRibbon">RATING 1000</b></span><strong>対戦</strong></button>
      </section>`);

    const sidebar = $('.lobby-sidebar');
    if (sidebar && !$('#raidPanel')) sidebar.insertAdjacentHTML('beforeend', `
      <section id="raidPanel" class="glass-panel raid-panel">
        <div class="panel-title"><div><p class="eyebrow">CO-OP PALACE RAID</p><h3 id="raidPanelName">星喰いリヴァイアサン</h3></div><button id="raidOpenButton" class="tiny-button" type="button">⚔</button></div>
        <div class="raid-mini-boss"><i id="raidPanelIcon">◈</i><div><small id="raidPanelPhase">PHASE I</small><strong id="raidPanelHp">240,000 / 240,000</strong><div class="meter-track raid-track"><u id="raidPanelFill"></u></div></div></div>
        <p>全員のプレイがダメージになります。撃破して限定報酬を獲得。</p>
      </section>`);

    const wallet = $('.wallet-cluster');
    if (wallet && !$('#topCollectionButton')) {
      const settings = $('#settingsButton');
      settings.insertAdjacentHTML('beforebegin', `<button id="topCollectionButton" class="icon-button expansion-top-button" type="button" title="コレクション">◆<span id="capsuleDot"></span></button><button id="topDuelButton" class="icon-button expansion-top-button" type="button" title="PVP対戦">⚔<span id="duelOnlineDot"></span></button>`);
    }

    const profileTabs = $('#profileModal .modal-tabs');
    if (profileTabs && !profileTabs.querySelector('[data-profile-tab="mastery"]')) profileTabs.insertAdjacentHTML('beforeend', `<button data-profile-tab="mastery" type="button">熟練度</button><button data-profile-tab="duel" type="button">対戦</button>`);

    const toast = $('#toastStack');
    if (toast && !$('#ascensionModal')) toast.insertAdjacentHTML('beforebegin', modalHtml());

    const mobileNav = $('#mobileNav');
    if (mobileNav && !$('#mobileDuelFab')) mobileNav.insertAdjacentHTML('beforebegin', `<button id="mobileDuelFab" type="button" aria-label="PVP対戦を開く">⚔<small>PVP</small></button>`);

    $('.intro-copy .intro-lead').innerHTML = '星が賭け札になり、運命が一夜だけ微笑む。<br />18ゲーム、周回遠征、120種蒐集、レイド、5種類のリアルタイム対戦。';
    $('#enterButton i').textContent = 'ENTER ETERNAL CROWN';
    const heroText = $('.hero-copy > p:not(.eyebrow)');
    if (heroText) heroText.textContent = '13のゲーム、能力星座、蒐集録、協力レイド、そして友達とのCROWN DUEL。すべてプレイコインだけで楽しめます。';
  }

  class AscensionSystem {
    constructor(app) {
      this.app = app;
      this.ascTab = 'constellation';
      this.collectionTab = 'items';
      this.eventTab = 'festival';
      this.collectionFilter = 'all';
      this.lastDrop = null;
      this.raidTimer = null;
      this.ensureData();
      injectExpansionUi(app);
      this.ensureStarterCollection();
      this.ensureWeekly();
      this.bind();
      this.applyCosmetics();
      this.updateAll();
      this.syncRaid();
      this.raidTimer = setInterval(() => this.syncRaid(), 8000);
    }

    get data() { return this.app.profile.data.ascension; }
    get profile() { return this.app.profile.data; }

    ensureData() {
      const base = defaultAscension();
      this.app.profile.data.ascension = deepMerge(base, this.app.profile.data.ascension || {});
      const a = this.app.profile.data.ascension;
      a.version = EXPANSION_VERSION;
      for (const id of MASTER_GAMES) a.mastery[id] = deepMerge({level:1,xp:0,rounds:0,wins:0,best:0}, a.mastery[id] || {});
      if (a.season.id !== seasonKey()) a.season = {id:seasonKey(),xp:0,claimed:{},premium:false};
      // Existing players receive every constellation point their current level already earned.
      const levelPoints = Math.floor(Math.max(0, Number(this.app.profile.data.level || 1)) / 3);
      const recorded = Math.max(0, Number(a.constellation.earnedFromLevel || 0));
      if (levelPoints > recorded) {
        a.constellation.points += levelPoints - recorded;
        a.constellation.earnedFromLevel = levelPoints;
      }
      this.app.profile.save();
    }

    ensureStarterCollection() {
      const starter = ['nocturne_avatar','nocturne_frame','nocturne_chip','nocturne_back','nocturne_aura','nocturne_emote'];
      for (const id of starter) if (!this.data.collection.owned[id]) this.data.collection.owned[id] = Date.now();
      for (const type of COLLECTION_TYPES.map(x => x.id)) {
        const equipped = this.data.collection.equipped[type];
        if (!equipped || !this.data.collection.owned[equipped]) {
          const first = COLLECTION.find(x => x.type === type && this.data.collection.owned[x.id]);
          if (first) this.data.collection.equipped[type] = first.id;
        }
      }
      this.app.profile.save();
    }

    effect(key) {
      let value = 0;
      for (const node of TREE_NODES) if (this.data.constellation.nodes[node.id]) value += Number(node.effect?.[key] || 0);
      return value;
    }

    festival() {
      const key = weekKey();
      return FESTIVALS[hashNumber(key) % FESTIVALS.length];
    }

    masteryNeed(level) { return 120 + level * 75; }
    seasonTier() { return clamp(Math.floor(this.data.season.xp / 250) + 1, 1, 40); }
    seasonProgress() { return (this.data.season.xp % 250) / 250; }

    ensureWeekly() {
      const key = weekKey();
      if (this.data.weekly.id === key && this.data.weekly.items?.length === 4) return;
      let seed = hashNumber(key);
      const pool = [...WEEKLY_POOL];
      const chosen = [];
      while (chosen.length < 4 && pool.length) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        chosen.push(pool.splice(seed % pool.length, 1)[0]);
      }
      this.data.weekly = {id:key,items:chosen.map(x => ({...x,progress:0,claimed:false,complete:false})),variety:[]};
      this.app.profile.save();
    }

    progressWeekly(event, amount = 1) {
      this.ensureWeekly();
      for (const item of this.data.weekly.items) {
        if (item.event !== event || item.claimed) continue;
        item.progress = clamp(Number(item.progress || 0) + amount, 0, item.target);
        item.complete = item.progress >= item.target;
      }
      this.app.profile.save();
      if (this.eventTab === 'contracts' && this.app.activeModal?.id === 'eventHubModal') this.renderEventHub('contracts');
    }

    markVariety(game) {
      const list = this.data.weekly.variety || (this.data.weekly.variety = []);
      if (!list.includes(game)) list.push(game);
      for (const item of this.data.weekly.items) if (item.event === 'variety' && !item.claimed) {
        item.progress = clamp(list.length, 0, item.target);
        item.complete = item.progress >= item.target;
      }
    }

    claimWeekly(id) {
      const item = this.data.weekly.items.find(x => x.id === id);
      if (!item || !item.complete || item.claimed) return;
      item.claimed = true;
      const paidCoins=this.app.profile.credit(item.reward.coins,'weekly');
      this.addStardust(item.reward.dust, false);
      this.data.eventTokens += item.reward.tokens;
      this.app.audio.play('bigwin');
      this.app.celebration.burst(.55);
      this.app.toast('週間契約 完了', `${formatL(paidCoins)}${paidCoins<item.reward.coins?'＋CROWN NOTES':''} · 星屑 ${item.reward.dust} · トークン ${item.reward.tokens}`, item.icon);
      this.app.profile.save();
      this.renderEventHub('contracts');
      this.updateAll();
    }

    addStardust(amount, notify = false) {
      let gain = Math.max(0, Math.floor(amount));
      const event = this.app.activeNightEvent?.();
      if (event?.id === 'nebula') gain *= 2;
      if (this.festival().id === 'nebula') gain = Math.floor(gain * 1.25);
      gain = Math.floor(gain * (1 + this.effect('stardust')));
      this.data.stardust += gain;
      if (notify && gain) this.app.toast('星屑を獲得', `+${fmt.format(gain)} STAR DUST`, '✦');
      this.app.profile.save();
      return gain;
    }

    addMastery(game, amount, win = false) {
      const m = this.data.mastery[game];
      if (!m) return;
      const event = this.app.activeNightEvent?.();
      let gain = Math.max(1, Math.floor(amount));
      if (event?.id === 'mastery') gain *= 2;
      if (this.festival().id === 'moon') gain = Math.floor(gain * 1.2);
      if (win && this.profile.streak.current > 1) gain = Math.floor(gain * (1 + this.effect('streakMastery')));
      gain = Math.floor(gain * (1 + this.effect('mastery')));
      m.xp += gain;
      m.rounds += 1;
      if (win) m.wins += 1;
      let levels = 0;
      while (m.level < 50 && m.xp >= this.masteryNeed(m.level)) {
        m.xp -= this.masteryNeed(m.level);
        m.level += 1;
        levels += 1;
        this.data.stardust += 35 + m.level * 5;
        if (m.level % 3 === 0) this.data.capsules += 1;
        if (m.level % 5 === 0) {
          this.data.constellation.points += 1;
          this.data.constellation.earnedFromMastery += 1;
        }
      }
      if (levels) {
        this.progressWeekly('masteryLevel', levels);
        this.app.audio.play('chime');
        this.app.toast('熟練度アップ', `${GAME_LABELS[game]} · MASTERY ${m.level}`, GAME_ICONS[game]);
      }
    }

    addSeasonXp(amount) {
      let gain = Math.max(0, Math.floor(amount));
      const event = this.app.activeNightEvent?.();
      if (event?.id === 'chronicle') gain *= 2;
      this.data.season.xp = Math.min(40 * 250 - 1, this.data.season.xp + gain);
      this.app.profile.save();
    }

    awardLevelPoints(oldLevel, newLevel) {
      for (let level = oldLevel + 1; level <= newLevel; level++) {
        if (level % 3 === 0) {
          this.data.constellation.points += 1;
          this.data.constellation.earnedFromLevel += 1;
        }
      }
      if (newLevel > oldLevel) this.updateAll();
    }

    onRound({game,wager=0,payout=0,net=0}) {
      if (!MASTER_GAMES.includes(game)) return;
      const win = net > 0;
      this.data.stats.gamesPlayed[game] = (this.data.stats.gamesPlayed[game] || 0) + 1;
      this.addMastery(game, 24 + Math.floor(wager / 450) + (win ? 34 : 0), win);
      this.addSeasonXp(32 + Math.floor(wager / 800) + (win ? 20 : 0));
      let dust = 6 + Math.floor(wager / 1200) + (win ? 12 : 0);
      if (!win && (this.effect('lossDust') || this.app.activeNightEvent?.()?.id === 'mercy')) dust += Math.min(50, Math.floor(wager * .01));
      this.addStardust(dust, false);
      this.progressWeekly('round', 1);
      if (win) this.progressWeekly('win', 1);
      this.progressWeekly('wager', wager);
      this.markVariety(game);
      this.maybeDropCapsule();
      this.contributeRaid(game, wager, net);
      this.maybeMysteryDoor();
      this.app.profile.save();
      this.updateAll();
    }

    maybeDropCapsule() {
      let chance = .035 + this.effect('drop');
      if (this.app.activeNightEvent?.()?.id === 'collector') chance += .06;
      if (this.festival().id === 'roulette') chance += .03;
      const rounds = this.profile.stats.rounds || 0;
      if (this.effect('roundCapsule') && rounds > 0 && rounds % 10 === 0) chance = 1;
      if (cryptoFloat() < chance) {
        this.data.capsules += 1;
        this.data.stats.collectionDrops += 1;
        this.app.toast('星晶カプセル発見', 'コレクション画面から開封できます。', '◆');
        this.app.audio.play('chime');
      }
    }

    maybeMysteryDoor() {
      if (this.app.activeModal || Date.now() - this.data.mystery.lastAt < 60_000) return;
      let chance = .045;
      if (this.festival().id === 'roulette') chance += .03;
      if (this.app.activeNightEvent?.()?.id === 'collector') chance += .02;
      if (cryptoFloat() < chance) {
        this.data.mystery.lastAt = Date.now();
        this.app.profile.save();
        setTimeout(() => this.openMystery(), 850);
      }
    }

    openMystery() {
      if (this.app.activeModal) return;
      this.mysteryRewards = shuffled([
        {type:'coins',amount:250 + randomInt(751),icon:'L',label:'PLAY COINS'},
        {type:'dust',amount:80 + randomInt(221),icon:'✦',label:'STAR DUST'},
        cryptoFloat() < .35 ? {type:'capsule',amount:1,icon:'◆',label:'STAR CAPSULE'} : {type:'tokens',amount:2 + randomInt(3),icon:'✺',label:'EVENT TOKENS'}
      ]);
      $('#mysteryReveal').hidden = true;
      $$('.mystery-doors button').forEach(b => { b.disabled = false; b.className = ''; });
      this.app.openModal('mysteryModal');
    }

    chooseMystery(index) {
      if (!this.mysteryRewards) return;
      const reward = this.mysteryRewards[index];
      if (!reward) return;
      if (reward.type === 'coins') reward.paid=this.app.profile.credit(reward.amount,'mystery');
      if (reward.type === 'dust') this.addStardust(reward.amount, false);
      if (reward.type === 'capsule') this.data.capsules += reward.amount;
      if (reward.type === 'tokens') this.data.eventTokens += reward.amount;
      this.data.mystery.opened += 1;
      $$('.mystery-doors button').forEach((b, i) => { b.disabled = true; b.classList.add(i === index ? 'opened' : 'faded'); });
      const reveal = $('#mysteryReveal');
      reveal.hidden = false;
      reveal.innerHTML = `<i>${reward.icon}</i><small>${reward.label}</small><strong>+${fmt.format(reward.type==='coins'?(reward.paid||0):reward.amount)}</strong>${reward.type==='coins'&&reward.paid<reward.amount?'<em>残額はCROWN NOTES</em>':''}`;
      this.app.audio.play('bigwin');
      this.app.celebration.burst(.45);
      this.app.profile.save();
      this.updateAll();
      this.mysteryRewards = null;
    }

    capsuleCost() {
      let cost = 300;
      if (this.festival().id === 'moon') cost = Math.floor(cost * .8);
      cost = Math.floor(cost * (1 - this.effect('capsuleCost')));
      return Math.max(150, cost);
    }

    openCapsule() {
      const usingCapsule = this.data.capsules > 0;
      const cost = this.capsuleCost();
      if (usingCapsule) this.data.capsules -= 1;
      else if (this.data.stardust >= cost) this.data.stardust -= cost;
      else {
        this.app.toast('星屑が足りません', `開封には ${fmt.format(cost)} STAR DUST が必要です。`, '◆');
        return;
      }
      let modifier = this.effect('rarity') + (this.effect('mythic') ? 1 : 0);
      let rarity = rarityRoll(modifier);
      if (this.effect('mythic') && cryptoFloat() < .01) rarity = 'mythic';
      let item = chooseByRarity(rarity);
      for (let i = 0; i < 10 && this.data.collection.owned[item.id]; i++) item = chooseByRarity(rarity);
      const duplicate = Boolean(this.data.collection.owned[item.id]);
      let shards = 0;
      if (duplicate) {
        shards = Math.floor(RARITY[item.rarity].value * (1 + this.effect('duplicate')));
        if (this.festival().id === 'nebula') shards = Math.floor(shards * 1.2);
        this.data.crownShards += shards;
        this.data.collection.duplicates += 1;
      } else this.data.collection.owned[item.id] = Date.now();
      this.data.collection.opened += 1;
      this.data.stats.collectionDrops += 1;
      this.progressWeekly('capsule', 1);
      this.lastDrop = {item,duplicate,shards};
      this.app.audio.play(item.rarity === 'mythic' || item.rarity === 'legendary' ? 'bigwin' : 'chime');
      if (['legendary','mythic'].includes(item.rarity)) this.app.celebration.burst(item.rarity === 'mythic' ? 1.1 : .65);
      this.app.profile.save();
      this.renderCollection('capsule');
      this.updateAll();
    }

    craftLegendary() {
      const cost = 500;
      if (this.data.crownShards < cost) return this.app.toast('王冠欠片が足りません', `${cost}個必要です。`, '◇');
      const pool = COLLECTION.filter(x => ['legendary','mythic'].includes(x.rarity) && !this.data.collection.owned[x.id]);
      if (!pool.length) return this.app.toast('蒐集完了', '対象となる高レア品はすべて所有しています。', '♛');
      this.data.crownShards -= cost;
      const item = choice(pool);
      this.data.collection.owned[item.id] = Date.now();
      this.lastDrop = {item,duplicate:false,crafted:true};
      this.app.profile.save();
      this.app.audio.play('bigwin');
      this.app.celebration.burst(.75);
      this.renderCollection('capsule');
      this.updateAll();
    }

    equip(itemId) {
      const item = COLLECTION.find(x => x.id === itemId);
      if (!item || !this.data.collection.owned[item.id]) return;
      this.data.collection.equipped[item.type] = item.id;
      this.app.profile.save();
      this.applyCosmetics();
      this.app.updateHud();
      this.renderCollection('items');
      this.app.toast('装備を変更', `${item.name}を装備しました。`, item.glyph);
      this.app.room.presence();
    }

    applyCosmetics() {
      const root = $('#app');
      for (const type of COLLECTION_TYPES.map(x => x.id)) {
        const id = this.data.collection.equipped[type] || '';
        root.dataset[`collection${type[0].toUpperCase()}${type.slice(1)}`] = id;
      }
      const aura = COLLECTION.find(x => x.id === this.data.collection.equipped.aura);
      const frame = COLLECTION.find(x => x.id === this.data.collection.equipped.frame);
      if (aura) root.style.setProperty('--collection-aura', aura.tone);
      if (frame) root.style.setProperty('--collection-frame', frame.tone);
    }

    unlockNode(id) {
      const node = TREE_NODES.find(x => x.id === id);
      if (!node || this.data.constellation.nodes[id]) return;
      const requirements = node.requires || [];
      if (requirements.some(req => !this.data.constellation.nodes[req])) return this.app.toast('前提能力が必要です', '星座の前段を先に開放してください。', '✦');
      if (this.data.constellation.points < node.cost) return this.app.toast('能力ポイント不足', `${node.cost} POINTが必要です。`, '✦');
      this.data.constellation.points -= node.cost;
      this.data.constellation.nodes[id] = Date.now();
      this.data.stats.abilityNodes += 1;
      this.app.profile.save();
      this.app.audio.play('chime');
      this.app.celebration.burst(.25);
      this.app.toast('能力星座 開放', `${node.name} — ${node.desc}`, node.icon);
      this.renderAscension('constellation');
      this.updateAll();
    }

    claimSeason(tier) {
      const reward = SEASON_REWARDS[tier - 1];
      if (!reward || this.seasonTier() < tier || this.data.season.claimed[tier]) return;
      this.data.season.claimed[tier] = Date.now();
      let paidCoins=reward.amount;if (reward.type === 'coins') paidCoins=this.app.profile.credit(reward.amount,'season');
      if (reward.type === 'dust') this.addStardust(reward.amount, false);
      if (reward.type === 'tokens') this.data.eventTokens += reward.amount;
      if (reward.type === 'shards') this.data.crownShards += reward.amount;
      if (reward.type === 'capsule') this.data.capsules += reward.amount;
      this.data.stats.seasonClaims += 1;
      this.app.profile.save();
      this.app.audio.play('chime');
      this.app.toast(`年代記 TIER ${tier}`, reward.type==='coins'?`${formatL(paidCoins)}を受け取りました${paidCoins<reward.amount?'。残額はCROWN NOTESです。':'。'}`:`${reward.label}を受け取りました。`, reward.icon);
      this.renderAscension('chronicle');
      this.updateAll();
    }

    claimAllSeason() {
      for (let tier = 1; tier <= this.seasonTier(); tier++) if (!this.data.season.claimed[tier]) this.claimSeason(tier);
    }

    claimAlbum(seriesId) {
      const series = COLLECTION_SERIES.find(x => x.id === seriesId);
      if (!series || this.data.collection.albums[seriesId]) return;
      const items = COLLECTION.filter(x => x.series === seriesId);
      if (!items.every(x => this.data.collection.owned[x.id])) return;
      this.data.collection.albums[seriesId] = Date.now();
      const bonus = Math.floor(400 * (1 + this.effect('album')));
      this.addStardust(bonus, false);
      this.data.crownShards += 150;
      const paidCoins=this.app.profile.credit(3000,'album');
      this.app.profile.save();
      this.app.audio.play('bigwin');
      this.app.celebration.burst(.8);
      this.app.toast('アルバム完成', `${series.jp} — ${fmt.format(paidCoins)} L${paidCoins<3000?'＋CROWN NOTES':''}・星屑 ${bonus}・欠片150`, '♛');
      this.renderCollection('albums');
      this.updateAll();
    }

    async syncRaid() {
      if (!this.app.room?.online) {
        if (!this.data.raid.lastState) this.data.raid.lastState = {id:'offline-raid',name:'幻影の星喰い',title:'OFFLINE PRACTICE RAID',icon:'◈',maxHp:120000,hp:120000,phase:1,defeatedAt:0,contributors:[]};
        this.renderRaidMini();
        return;
      }
      try {
        const response = await fetch(`/api/raid/state?room=${encodeURIComponent(this.app.room.room)}`);
        if (!response.ok) return;
        const payload = await response.json();
        this.handleRaidState(payload.raid);
      } catch {}
    }

    handleRaidState(raid) {
      if (!raid) return;
      const previous = this.data.raid.lastState;
      this.data.raid.lastState = raid;
      this.app.room.raid = raid;
      if (raid.defeatedAt && !this.data.raid.claimed[raid.id] && previous?.hp > 0) this.app.toast('協力レイド撃破', `${raid.name}を撃破。イベントホールで報酬を受け取れます。`, raid.icon);
      this.app.profile.save();
      this.renderRaidMini();
      if (this.app.activeModal?.id === 'eventHubModal' && this.eventTab === 'raid') this.renderEventHub('raid');
    }

    async contributeRaid(game, wager, net) {
      if (this.app.room?.online) { this.syncRaid(); return; }
      let damage = Math.max(20, Math.floor(wager * .32 + Math.max(0, net) * .12 + (this.data.mastery[game]?.level || 1) * 8));
      damage = Math.floor(damage * (1 + this.effect('raid')));
      if (this.festival().id === 'eclipse') damage = Math.floor(damage * 1.25);
      if (this.app.activeNightEvent?.()?.id === 'raid') damage *= 2;
      damage = clamp(damage, 1, 8000);
      this.data.raid.totalDamage += damage;
      this.progressWeekly('raidDamage', damage);
      if (!this.app.room?.online) {
        const raid = this.data.raid.lastState;
        if (raid && raid.hp > 0) {
          raid.hp = Math.max(0, raid.hp - damage);
          raid.phase = raid.hp <= raid.maxHp * .25 ? 3 : raid.hp <= raid.maxHp * .6 ? 2 : 1;
          if (raid.hp === 0) raid.defeatedAt = Date.now();
        }
        this.app.profile.save();
        this.renderRaidMini();
        return;
      }
      try {
        const response = await fetch('/api/raid/contribute', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room:this.app.room.room,player:{id:this.profile.id,name:this.profile.name},damage})});
        if (response.ok) this.handleRaidState((await response.json()).raid);
      } catch {}
    }

    async claimRaid() {
      const raid = this.data.raid.lastState;
      if (!raid?.defeatedAt || this.data.raid.claimed[raid.id]) return;
      if (this.app.room?.online) {
        try { const response=await fetch(`/api/raid/${raid.id}/claim`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room:this.app.room.room})}); if(!response.ok)return; const result=(await response.json()).raid; if(result.alreadyClaimed)return; this.data.raid.claimed[raid.id]=Date.now(); if(result.collection&&this.app.ascension){const c=this.app.ascension.data.collection; c.owned=Object.fromEntries((result.collection.owned||[]).map(id=>[id,Date.now()])); this.app.ascension.data.capsules=result.collection.capsules; this.app.ascension.data.stardust=result.collection.dust; this.app.ascension.data.crownShards=result.collection.shards; c.opened=result.collection.opened; c.duplicates=result.collection.duplicates;} if(Number.isInteger(result.wallet))window.__IRIS_SET_WALLET?.(result.wallet); this.app.profile.save(); this.app.bigWin?.(result.amount,'RAID CLEARED',`${raid.name} · RIS REWARD`); this.renderEventHub('raid'); } catch {};
        return;
      }
      this.data.raid.claimed[raid.id] = Date.now();
      const festivalBoost = this.festival().id === 'eclipse' ? 1.25 : 1;
      const coins = Math.floor(3000 * festivalBoost);
      const dust = Math.floor(350 * festivalBoost);
      const paidCoins=this.app.profile.credit(coins,'raid');
      this.addStardust(dust, false);
      this.data.capsules += 1;
      this.app.profile.save();
      this.app.audio.play('bigwin');
      if(paidCoins>0)this.app.bigWin(paidCoins, 'RAID CLEARED', `${raid.name} · 星屑 ${dust} · CAPSULE ×1${paidCoins<coins?' · 残額NOTES':''}`);else this.app.toast('RAID CLEARED',`${raid.name} · 報酬LはCROWN NOTESへ変換されました。`,'◈');
      this.renderEventHub('raid');
      this.updateAll();
    }

    renderRaidMini() {
      const raid = this.data.raid.lastState || this.app.room?.raid;
      if (!raid || !$('#raidPanel')) return;
      $('#raidPanelName').textContent = raid.name;
      $('#raidPanelIcon').textContent = raid.icon;
      $('#raidPanelPhase').textContent = raid.defeatedAt ? 'DEFEATED' : `PHASE ${['I','II','III'][Math.max(0,(raid.phase||1)-1)]}`;
      $('#raidPanelHp').textContent = `${fmt.format(raid.hp)} / ${fmt.format(raid.maxHp)}`;
      $('#raidPanelFill').style.width = `${clamp(raid.hp / raid.maxHp * 100, 0, 100)}%`;
      $('#raidPanel').classList.toggle('defeated', Boolean(raid.defeatedAt));
    }

    openAscension(tab = 'constellation') { this.app.openModal('ascensionModal'); this.renderAscension(tab); }
    openCollection(tab = 'items') { this.app.openModal('collectionModal'); this.renderCollection(tab); }
    openEventHub(tab = 'festival') { this.app.openModal('eventHubModal'); this.renderEventHub(tab); }

    renderAscension(tab = this.ascTab) {
      this.ascTab = tab;
      $$('[data-asc-tab]').forEach(b => b.classList.toggle('active', b.dataset.ascTab === tab));
      const mount = $('#ascensionContent');
      if (!mount) return;
      if (tab === 'constellation') {
        const branchNames = {fortune:['FORTUNE','運命'],collector:['COLLECTION','蒐集'],social:['SOCIAL','共鳴']};
        mount.innerHTML = `<div class="constellation-head"><div><small>AVAILABLE POINTS</small><strong>${this.data.constellation.points}</strong></div><p>プレイヤーLv.3ごと、または各ゲーム熟練度Lv.5ごとに能力ポイントを獲得。標準ゲームの抽選結果そのものは変更しません。</p></div><div class="constellation-board">${Object.entries(branchNames).map(([branch,label]) => `<section class="constellation-branch ${branch}"><header><i>${branch==='fortune'?'✦':branch==='collector'?'◆':'⚔'}</i><div><small>${label[0]}</small><h3>${label[1]}の星座</h3></div></header><div class="constellation-nodes">${TREE_NODES.filter(x=>x.branch===branch).map(node => {const unlocked=Boolean(this.data.constellation.nodes[node.id]),requirements=node.requires||[],available=!unlocked&&requirements.every(r=>this.data.constellation.nodes[r])&&this.data.constellation.points>=node.cost;return `<button class="constellation-node tier-${node.tier} ${unlocked?'unlocked':available?'available':'locked'}" data-tree-node="${node.id}" type="button"><span>${unlocked?'✓':node.icon}</span><div><small>TIER ${node.tier} · ${node.cost} PT</small><b>${node.name}</b><p>${node.desc}</p></div></button>`}).join('')}</div></section>`).join('')}</div>`;
        $$('[data-tree-node]',mount).forEach(b => b.addEventListener('click', () => this.unlockNode(b.dataset.treeNode)));
      }
      if (tab === 'mastery') {
        mount.innerHTML = `<div class="mastery-summary"><div><small>TOTAL MASTERY</small><strong>${fmt.format(Object.values(this.data.mastery).reduce((a,m)=>a+m.level,0))}</strong></div><p>ゲームごとにLv.50まで成長。Lv.3ごとにカプセル、Lv.5ごとに能力ポイントを獲得します。</p></div><div class="mastery-grid">${MASTER_GAMES.map(id=>{const m=this.data.mastery[id],need=this.masteryNeed(m.level);return `<article class="mastery-card"><i>${GAME_ICONS[id]}</i><div><small>${GAME_LABELS[id]}</small><b>MASTERY ${m.level}</b><p>${fmt.format(m.xp)} / ${fmt.format(need)} XP</p><em><u style="width:${clamp(m.xp/need*100,0,100)}%"></u></em><footer><span>${fmt.format(m.rounds)} PLAY</span><span>${fmt.format(m.wins)} WIN</span></footer></div></article>`}).join('')}</div>`;
      }
      if (tab === 'chronicle') {
        const tier = this.seasonTier();
        mount.innerHTML = `<div class="chronicle-hero"><div><p class="eyebrow">SEASON ${escapeHtml(this.data.season.id)}</p><h3>MIDNIGHT CHRONICLE</h3><span>TIER ${tier} / 40</span></div><div class="chronicle-progress"><b>${fmt.format(this.data.season.xp)} XP</b><em><u style="width:${this.seasonProgress()*100}%"></u></em><small>次のTIERまで ${250-(this.data.season.xp%250)} XP</small></div><button id="claimAllSeason" type="button">受取可能を一括受取</button></div><div class="season-track">${SEASON_REWARDS.map(r=>{const unlocked=tier>=r.tier,claimed=Boolean(this.data.season.claimed[r.tier]);return `<button class="season-tier ${unlocked?'unlocked':''} ${claimed?'claimed':''}" data-season-tier="${r.tier}" type="button" ${!unlocked||claimed?'disabled':''}><small>TIER ${r.tier}</small><i>${claimed?'✓':r.icon}</i><b>${r.label}</b><span>${claimed?'CLAIMED':unlocked?'CLAIM':'LOCKED'}</span></button>`}).join('')}</div>`;
        $$('[data-season-tier]',mount).forEach(b => b.addEventListener('click',()=>this.claimSeason(Number(b.dataset.seasonTier))));
        $('#claimAllSeason',mount)?.addEventListener('click',()=>this.claimAllSeason());
      }
    }

    renderCollection(tab = this.collectionTab) {
      this.collectionTab = tab;
      $$('[data-collection-tab]').forEach(b => b.classList.toggle('active', b.dataset.collectionTab === tab));
      $('#collectionDust').textContent = fmt.format(this.data.stardust);
      $('#collectionShards').textContent = fmt.format(this.data.crownShards);
      $('#collectionCapsules').textContent = fmt.format(this.data.capsules);
      const mount = $('#collectionContent');
      if (!mount) return;
      if (tab === 'items') {
        const owned = Object.keys(this.data.collection.owned).length;
        const filters = [{id:'all',jp:'すべて'},...COLLECTION_TYPES.map(x=>({id:x.id,jp:x.jp}))];
        mount.innerHTML = `<div class="collection-head"><div><small>DISCOVERED</small><strong>${owned} / ${COLLECTION.length}</strong></div><div class="collection-filters">${filters.map(f=>`<button class="${this.collectionFilter===f.id?'active':''}" data-collection-filter="${f.id}" type="button">${f.jp}</button>`).join('')}</div></div><div class="collection-grid">${COLLECTION.filter(x=>this.collectionFilter==='all'||x.type===this.collectionFilter).map(item=>{const has=Boolean(this.data.collection.owned[item.id]),equipped=this.data.collection.equipped[item.type]===item.id;return `<button class="collection-item rarity-${item.rarity} ${has?'owned':'locked'} ${equipped?'equipped':''}" data-collection-item="${item.id}" type="button" ${has?'':'disabled'} style="--item-tone:${item.tone}"><span>${has?item.glyph:'?'}</span><small>${has?RARITY[item.rarity].name:'UNKNOWN'}</small><b>${has?item.name:'？？？'}</b><em>${has?item.typeName:'未発見'}</em><i>${equipped?'EQUIPPED':has?'装備する':'LOCKED'}</i></button>`}).join('')}</div>`;
        $$('[data-collection-filter]',mount).forEach(b=>b.addEventListener('click',()=>{this.collectionFilter=b.dataset.collectionFilter;this.renderCollection('items')}));
        $$('[data-collection-item]',mount).forEach(b=>b.addEventListener('click',()=>this.equip(b.dataset.collectionItem)));
      }
      if (tab === 'albums') {
        mount.innerHTML = `<div class="album-grid">${COLLECTION_SERIES.map(series=>{const items=COLLECTION.filter(x=>x.series===series.id),count=items.filter(x=>this.data.collection.owned[x.id]).length,complete=count===items.length,claimed=Boolean(this.data.collection.albums[series.id]);return `<article class="album-card ${complete?'complete':''}" style="--album-tone:${series.tone}"><header><i>◆</i><div><small>${series.name}</small><h3>${series.jp}</h3></div><b>${count} / ${items.length}</b></header><div class="album-slots">${items.map(x=>`<span class="${this.data.collection.owned[x.id]?'owned':''}">${this.data.collection.owned[x.id]?x.glyph:'?'}</span>`).join('')}</div><p>全${items.length}種：最大3,000 L（準備金制）・星屑・王冠欠片</p><button data-album-claim="${series.id}" type="button" ${!complete||claimed?'disabled':''}>${claimed?'REWARD CLAIMED':complete?'完成報酬を受け取る':'COLLECTING'}</button></article>`}).join('')}</div>`;
        $$('[data-album-claim]',mount).forEach(b=>b.addEventListener('click',()=>this.claimAlbum(b.dataset.albumClaim)));
      }
      if (tab === 'capsule') {
        const drop=this.lastDrop;
        mount.innerHTML = `<div class="capsule-lab"><section class="capsule-machine"><div class="capsule-orbit"><i></i><i></i><i></i><b>◆</b></div><p class="eyebrow">STAR CRYSTAL CAPSULE</p><h3>${this.data.capsules>0?'所持カプセルを開封':`${fmt.format(this.capsuleCost())} STAR DUST`}</h3><p>全${COLLECTION.length}種。重複品は王冠欠片へ変換され、高レア品の錬成に使えます。</p><button id="openCapsuleButton" class="primary-cta" type="button"><span>カプセルを開く</span><i>${this.data.capsules>0?`CAPSULE ×${this.data.capsules}`:`COST ${this.capsuleCost()} DUST`}</i></button><button id="craftLegendaryButton" class="glass-button" type="button">王冠欠片500で高レア錬成</button></section><section class="capsule-result ${drop?`rarity-${drop.item.rarity}`:''}">${drop?`<div class="drop-rays"></div><i style="--drop-tone:${drop.item.tone}">${drop.item.glyph}</i><small>${RARITY[drop.item.rarity].name}</small><h3>${drop.item.name}</h3><p>${drop.duplicate?`DUPLICATE · 王冠欠片 +${drop.shards}`:drop.crafted?'CRAFTED COLLECTION':'NEW COLLECTION'}</p>`:`<span>?</span><h3>次の秘宝はまだ闇の中</h3><p>開封するとここに表示されます。</p>`}</section></div><div class="rarity-table">${Object.entries(RARITY).map(([id,r])=>`<div class="rarity-${id}"><i></i><b>${r.name}</b><span>BASE ${r.weight}%</span></div>`).join('')}</div>`;
        $('#openCapsuleButton',mount)?.addEventListener('click',()=>this.openCapsule());
        $('#craftLegendaryButton',mount)?.addEventListener('click',()=>this.craftLegendary());
      }
    }

    renderEventHub(tab = this.eventTab) {
      this.eventTab = tab;
      $$('[data-event-tab]').forEach(b => b.classList.toggle('active', b.dataset.eventTab === tab));
      const mount = $('#eventHubContent');
      if (!mount) return;
      const festival = this.festival();
      if (tab === 'festival') {
        const active = this.app.activeNightEvent?.();
        mount.innerHTML = `<div class="festival-hero festival-${festival.id}"><div class="festival-emblem">${festival.icon}</div><div><p class="eyebrow">THIS WEEK IN THE PALACE</p><h3>${festival.jp}</h3><strong>${festival.name}</strong><p>${festival.desc}</p><span>${festival.bonus}</span></div></div><div class="live-event-card ${active?'active':''}"><i>${active?.icon||'✦'}</i><div><small>${active?'PALACE PHENOMENON ACTIVE':'NEXT PALACE PHENOMENON'}</small><h3>${active?active.jp:`あと ${this.profile.nightEvent.nextIn} ROUND`}</h3><p>${active?active.desc:'各ゲームを遊ぶとランダムな全館イベントが発生します。'}</p></div><b>${active?this.profile.nightEvent.remaining:this.profile.nightEvent.nextIn}</b></div><div class="event-currency-grid"><div><i>✺</i><small>EVENT TOKENS</small><strong>${fmt.format(this.data.eventTokens)}</strong></div><div><i>◆</i><small>CAPSULES</small><strong>${fmt.format(this.data.capsules)}</strong></div><div><i>◇</i><small>CROWN SHARDS</small><strong>${fmt.format(this.data.crownShards)}</strong></div><div><i>?</i><small>MYSTERY DOORS</small><strong>${fmt.format(this.data.mystery.opened)}</strong></div></div>`;
      }
      if (tab === 'contracts') {
        this.ensureWeekly();
        mount.innerHTML = `<div class="weekly-head"><div><p class="eyebrow">WEEK OF ${this.data.weekly.id}</p><h3>週間契約</h3></div><span>${this.data.weekly.items.filter(x=>x.claimed).length} / ${this.data.weekly.items.length} COMPLETE</span></div><div class="weekly-contracts">${this.data.weekly.items.map(item=>`<article class="weekly-contract ${item.complete?'complete':''} ${item.claimed?'claimed':''}"><i>${item.claimed?'✓':item.icon}</i><div><small>WEEKLY ORDER</small><h3>${item.title}</h3><em><u style="width:${clamp(item.progress/item.target*100,0,100)}%"></u></em><p>${fmt.format(item.progress)} / ${fmt.format(item.target)}</p><footer><span>${formatL(item.reward.coins)} · 星屑 ${item.reward.dust} · ✺${item.reward.tokens}</span><button data-weekly-claim="${item.id}" type="button" ${!item.complete||item.claimed?'disabled':''}>${item.claimed?'CLAIMED':item.complete?'受け取る':'進行中'}</button></footer></div></article>`).join('')}</div>`;
        $$('[data-weekly-claim]',mount).forEach(b=>b.addEventListener('click',()=>this.claimWeekly(b.dataset.weeklyClaim)));
      }
      if (tab === 'raid') {
        const raid = this.data.raid.lastState || {name:'接続中',title:'PALACE RAID',icon:'◈',hp:1,maxHp:1,phase:1,contributors:[]};
        const claimable=Boolean(raid.defeatedAt&&!this.data.raid.claimed[raid.id]);
        mount.innerHTML = `<div class="raid-hero phase-${raid.phase||1} ${raid.defeatedAt?'defeated':''}"><div class="raid-boss-visual"><span>${raid.icon}</span><i></i><i></i><i></i></div><div><p class="eyebrow">${raid.title}</p><h3>${raid.name}</h3><small>${raid.defeatedAt?'BOSS DEFEATED':`PHASE ${['I','II','III'][Math.max(0,(raid.phase||1)-1)]}`}</small><div class="raid-hp"><div><span>PALACE HP</span><b>${fmt.format(raid.hp)} / ${fmt.format(raid.maxHp)}</b></div><em><u style="width:${clamp(raid.hp/raid.maxHp*100,0,100)}%"></u></em></div><p>通常ゲームの賭け額、勝利、熟練度が自動でダメージへ変換されます。ルーム全員で共有。</p><button id="raidClaimButton" class="primary-cta" type="button" ${claimable?'':'disabled'}><span>${this.data.raid.claimed[raid.id]?'受取済み':claimable?'討伐報酬を受け取る':'討伐進行中'}</span><i>CO-OP REWARD</i></button></div></div><div class="raid-ranking"><h3>CONTRIBUTION RANKING</h3>${(raid.contributors?.length?raid.contributors:[{name:this.profile.name,damage:this.data.raid.totalDamage,glyph:this.app.avatarGlyph()}]).map((p,i)=>`<div><b>${i+1}</b><i>${escapeHtml(p.glyph||'⚔')}</i><span>${escapeHtml(p.name)}</span><strong>${fmt.format(p.damage)} DMG</strong></div>`).join('')}</div>`;
        $('#raidClaimButton',mount)?.addEventListener('click',()=>this.claimRaid());
      }
    }

    renderProfileMastery(mount) {
      mount.innerHTML = `<div class="profile-expansion-summary"><div><small>ASCENSION NODES</small><strong>${Object.keys(this.data.constellation.nodes).length} / ${TREE_NODES.length}</strong></div><div><small>COLLECTION</small><strong>${Object.keys(this.data.collection.owned).length} / ${COLLECTION.length}</strong></div><div><small>STAR DUST</small><strong>${fmt.format(this.data.stardust)}</strong></div></div><div class="profile-mastery-list">${MASTER_GAMES.map(id=>{const m=this.data.mastery[id];return `<div><i>${GAME_ICONS[id]}</i><span>${GAME_LABELS[id]}</span><b>Lv.${m.level}</b><em><u style="width:${clamp(m.xp/this.masteryNeed(m.level)*100,0,100)}%"></u></em></div>`}).join('')}</div>`;
    }

    renderProfileDuel(mount) {
      const d=this.data.duel;
      mount.innerHTML = `<div class="duel-profile-rank"><i>⚔</i><div><small>CROWN DUEL RATING</small><strong>${fmt.format(d.rating)}</strong><p>${d.rating>=1600?'NIGHT EMPEROR':d.rating>=1400?'DIAMOND DUELIST':d.rating>=1200?'GOLD CHALLENGER':'SILVER CHALLENGER'}</p></div></div><div class="stats-grid"><div class="stat-box"><small>MATCHES</small><strong>${fmt.format(d.matches)}</strong></div><div class="stat-box"><small>WINS</small><strong>${fmt.format(d.wins)}</strong></div><div class="stat-box"><small>LOSSES</small><strong>${fmt.format(d.losses)}</strong></div><div class="stat-box"><small>TIES</small><strong>${fmt.format(d.ties)}</strong></div><div class="stat-box"><small>BEST STREAK</small><strong>×${fmt.format(d.bestStreak)}</strong></div><div class="stat-box"><small>DUEL MEDALS</small><strong>${fmt.format(d.medals)}</strong></div></div><button id="profileOpenDuel" class="primary-cta" type="button"><span>対戦闘技場を開く</span><i>CROWN DUEL</i></button>`;
      $('#profileOpenDuel',mount)?.addEventListener('click',()=>{this.app.closeModal();this.app.pvp.open()});
    }

    updateAll() {
      if (!$('#ascensionRibbon')) return;
      $('#ascensionPointsRibbon').textContent = `${this.data.constellation.points} POINT${this.data.constellation.points===1?'':'S'}`;
      $('#collectionRibbon').textContent = `${Object.keys(this.data.collection.owned).length} / ${COLLECTION.length}`;
      $('#seasonRibbon').textContent = `TIER ${this.seasonTier()} / 40`;
      $('#seasonRibbonFill').style.width = `${this.seasonProgress()*100}%`;
      $('#festivalRibbon').textContent = this.festival().jp;
      $('#duelRibbon').textContent = `RATING ${fmt.format(this.data.duel.rating)}`;
      $('#capsuleDot').style.display = this.data.capsules > 0 ? 'block' : 'none';
      $('#duelOnlineDot').classList.toggle('online', Boolean(this.app.room?.online));
      this.renderRaidMini();
    }

    bind() {
      $('#ascensionButton')?.addEventListener('click',()=>this.openAscension());
      $('#chronicleButton')?.addEventListener('click',()=>this.openAscension('chronicle'));
      $('#collectionButton')?.addEventListener('click',()=>this.openCollection());
      $('#topCollectionButton')?.addEventListener('click',()=>this.openCollection());
      $('#eventHubButton')?.addEventListener('click',()=>this.openEventHub());
      $('#raidOpenButton')?.addEventListener('click',()=>this.openEventHub('raid'));
      $('#duelButton')?.addEventListener('click',()=>this.app.pvp?.open());
      $('#topDuelButton')?.addEventListener('click',()=>this.app.pvp?.open());
      $('#mobileDuelFab')?.addEventListener('click',()=>this.app.pvp?.open());
      $$('[data-asc-tab]').forEach(b=>b.addEventListener('click',()=>this.renderAscension(b.dataset.ascTab)));
      $$('[data-collection-tab]').forEach(b=>b.addEventListener('click',()=>this.renderCollection(b.dataset.collectionTab)));
      $$('[data-event-tab]').forEach(b=>b.addEventListener('click',()=>this.renderEventHub(b.dataset.eventTab)));
      $$('[data-close-expansion-modal]').forEach(b=>b.addEventListener('click',()=>this.app.closeModal()));
      $$('[data-mystery-door]').forEach(b=>b.addEventListener('click',()=>this.chooseMystery(Number(b.dataset.mysteryDoor))));
      $$('.expansion-game-card').forEach(b=>b.addEventListener('click',()=>this.app.openGame(b.dataset.game)));
      $$('#profileModal [data-profile-tab]').forEach(b=>b.addEventListener('click',()=>{
        $$('#profileModal [data-profile-tab]').forEach(x=>x.classList.toggle('active',x===b));
        this.app.renderProfile(b.dataset.profileTab);
      }));
    }
  }

  class PvpClient {
    constructor(app) {
      this.app = app;
      this.match = null;
      this.selectedMode = 'roulette';
      this.pollTimer = null;
      this.busy = false;
      this.practiceDeck = [];
      this.lastRenderSignature = '';
    }

    get me() { return {id:this.app.profile.data.id,name:this.app.profile.data.name,glyph:this.app.avatarGlyph()}; }
    get online() { return Boolean(this.app.room?.online && this.app.room?.room); }

    async request(path, payload) {
      const response = await fetch(path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const data = await response.json().catch(()=>({}));
      if (!response.ok || !data.ok) throw new Error(data.error || '通信に失敗しました');
      return data;
    }

    open() {
      this.app.openModal('duelModal');
      if (this.match) this.renderMatch();
      else this.renderLobby();
    }

    closeMatch(clear = false) {
      if (clear) this.match = null;
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.renderLobby();
    }

    renderLobby() {
      this.lastRenderSignature = '';
      const d = this.app.ascension.data.duel;
      const online = this.online;
      $('#duelContent').innerHTML = `
        <div class="duel-rank-banner"><div class="duel-rank-emblem">⚔</div><div><small>CROWN DUEL RATING</small><strong>${fmt.format(d.rating)}</strong><p>${d.rating>=1600?'NIGHT EMPEROR':d.rating>=1400?'DIAMOND DUELIST':d.rating>=1200?'GOLD CHALLENGER':'SILVER CHALLENGER'} · ${fmt.format(d.medals)} MEDALS</p></div><span class="duel-network ${online?'online':'offline'}">${online?'LIVE SERVER':'OFFLINE'}</span></div>
        <p class="duel-lead">同じルームの友達と、サーバー抽選の完全同期ルールで対戦します。相手のコインは奪わず、勝者は最大500 L、引き分けは最大150 Lを準備金から受け取ります。準備金不足分はCROWN NOTESへ変換され、敗者へのL配布はありません。</p>
        <div class="duel-mode-picker">
          <button class="${this.selectedMode==='roulette'?'active':''}" data-duel-mode="roulette" type="button"><i>◉</i><b>ROULETTE RUSH</b><small>5スピン · カテゴリ＋数字</small></button>
          <button class="${this.selectedMode==='dice'?'active':''}" data-duel-mode="dice" type="button"><i>⚄</i><b>DICE DOMINION</b><small>5ロール · 帯域＋合計</small></button>
          <button class="${this.selectedMode==='blackjack'?'active':''}" data-duel-mode="blackjack" type="button"><i>♠</i><b>BLACKJACK CLASH</b><small>3ハンド · HIT / STAND</small></button>
          <button class="${this.selectedMode==='war'?'active':''}" data-duel-mode="war" type="button"><i>⚔</i><b>CROWN WAR</b><small>5ドロー · A HIGH</small></button>
          <button class="${this.selectedMode==='baccarat'?'active':''}" data-duel-mode="baccarat" type="button"><i>龍</i><b>BACCARAT ORACLE</b><small>5ラウンド · PLAYER / BANKER / TIE</small></button>
        </div>
        <div class="duel-actions-grid">
          <section><p class="eyebrow">QUICK MATCH</p><h3>すぐ対戦相手を探す</h3><p>同じルームで待機中のプレイヤーと自動でマッチします。</p><button id="duelQuickButton" class="primary-cta" type="button" ${online?'':'disabled'}><span>クイックマッチ</span><i>${this.selectedMode.toUpperCase()}</i></button></section>
          <section><p class="eyebrow">PRIVATE CHALLENGE</p><h3>友達専用コード</h3><p>6文字の対戦コードを作成し、Discordで友達へ送ります。</p><button id="duelCreateButton" class="gold-button" type="button" ${online?'':'disabled'}>対戦コードを作る</button></section>
          <section><p class="eyebrow">JOIN CHALLENGE</p><h3>コードから参加</h3><div class="duel-code-entry"><input id="duelCodeInput" maxlength="6" placeholder="ABC123" autocomplete="off"/><button id="duelJoinButton" type="button" ${online?'':'disabled'}>参加</button></div></section>
          <section class="practice-section"><p class="eyebrow">AI PRACTICE</p><h3>オフライン練習</h3><p>サーバーがなくても操作練習できます。レーティング・報酬は変動しません。</p><button id="duelPracticeButton" class="glass-button" type="button">AIと練習</button></section>
        </div>
        ${online?'':`<div class="duel-offline-note"><i>!</i><div><b>友達とのPVPにはNodeサーバー版が必要です</b><small>単体HTMLや静的ホスティングではAI練習のみ。完全プロジェクトをNode対応ホスティングへ公開するとLIVE SERVERになります。</small></div></div>`}
        <div class="duel-record"><div><small>MATCHES</small><b>${fmt.format(d.matches)}</b></div><div><small>WINS</small><b>${fmt.format(d.wins)}</b></div><div><small>LOSSES</small><b>${fmt.format(d.losses)}</b></div><div><small>BEST STREAK</small><b>×${fmt.format(d.bestStreak)}</b></div></div>`;
      $$('[data-duel-mode]').forEach(b=>b.addEventListener('click',()=>{this.selectedMode=b.dataset.duelMode;this.renderLobby()}));
      $('#duelQuickButton')?.addEventListener('click',()=>this.quickMatch());
      $('#duelCreateButton')?.addEventListener('click',()=>this.createChallenge());
      $('#duelJoinButton')?.addEventListener('click',()=>this.joinChallenge());
      $('#duelCodeInput')?.addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')});
      $('#duelCodeInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')this.joinChallenge()});
      $('#duelPracticeButton')?.addEventListener('click',()=>this.startPractice(this.selectedMode));
    }

    async quickMatch() {
      if (this.busy || !this.online) return;
      this.busy = true;
      try {
        const data = await this.request('/api/duel/queue',{room:this.app.room.room,mode:this.selectedMode,player:this.me});
        this.match = data.match;
        this.startPolling();
        this.renderMatch();
      } catch (error) { this.app.toast('対戦接続エラー',error.message,'⚔'); }
      finally { this.busy = false; }
    }

    async createChallenge() {
      if (this.busy || !this.online) return;
      this.busy = true;
      try {
        const data = await this.request('/api/duel/create',{room:this.app.room.room,mode:this.selectedMode,player:this.me});
        this.match = data.match;
        this.startPolling();
        this.renderMatch();
      } catch (error) { this.app.toast('対戦コード作成エラー',error.message,'⚔'); }
      finally { this.busy = false; }
    }

    async joinChallenge() {
      if (this.busy || !this.online) return;
      const code = ($('#duelCodeInput')?.value || '').trim().toUpperCase();
      if (code.length !== 6) return this.app.toast('対戦コードを確認してください','6文字のコードを入力します。','⚔');
      this.busy = true;
      try {
        const data = await this.request('/api/duel/join',{room:this.app.room.room,code,player:this.me});
        this.match = data.match;
        this.startPolling();
        this.renderMatch();
      } catch (error) { this.app.toast('参加できませんでした',error.message,'⚔'); }
      finally { this.busy = false; }
    }

    startPolling() {
      clearInterval(this.pollTimer);
      if (!this.match || this.match.practice || !this.online) return;
      this.pollTimer = setInterval(()=>this.poll(),900);
    }

    async poll() {
      if (!this.match || this.match.practice || !this.online) return;
      try {
        const response = await fetch(`/api/duel/state?room=${encodeURIComponent(this.app.room.room)}&match=${encodeURIComponent(this.match.id)}&player=${encodeURIComponent(this.me.id)}`);
        if (!response.ok) return;
        const data = await response.json();
        this.match = data.match;
        this.renderMatch();
        if (this.match.status === 'complete') this.claimResult();
      } catch {}
    }

    player(match = this.match) { return match?.players?.find(p=>p.id===this.me.id); }
    opponent(match = this.match) { return match?.players?.find(p=>p.id!==this.me.id); }

    renderMatch() {
      const m = this.match;
      if (!m) return this.renderLobby();
      if (m.status === 'waiting') return this.renderWaiting();
      const signature = JSON.stringify({
        id:m.id,mode:m.mode,status:m.status,round:m.round,winnerId:m.winnerId,
        players:(m.players||[]).map(p=>[p.id,p.score]),choices:m.choices||{},
        history:(m.history||[]).slice(-2),
        blackjack:m.blackjack?{stood:m.blackjack.stood,hands:Object.fromEntries(Object.entries(m.blackjack.hands||{}).map(([id,cards])=>[id,(cards||[]).map(c=>`${c.id||''}:${c.rank}${c.suit}`)])),result:m.blackjack.result}:null
      });
      if (signature === this.lastRenderSignature && $('#duelContent .duel-match-shell')) return;
      this.lastRenderSignature = signature;
      if (m.status === 'complete') {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      const me = this.player(m) || m.players[0];
      const op = this.opponent(m) || {name:'WAITING',glyph:'?',score:0};
      const last = m.history?.[m.history.length-1];
      const status = m.status === 'complete' ? 'MATCH COMPLETE' : `ROUND ${m.round} / ${m.maxRounds}`;
      let arena = '';
      if (m.mode === 'roulette') arena = this.rouletteArena(m, me, op, last);
      if (m.mode === 'dice') arena = this.diceArena(m, me, op, last);
      if (m.mode === 'blackjack') arena = this.blackjackArena(m, me, op, last);
      if (m.mode === 'war') arena = this.warArena(m, me, op, last);
      if (m.mode === 'baccarat') arena = this.baccaratArena(m, me, op, last);
      $('#duelContent').innerHTML = `<div class="duel-match-shell mode-${m.mode}"><header class="duel-scoreboard"><div class="duelist self"><i>${escapeHtml(me.glyph||this.app.avatarGlyph())}</i><span><small>YOU</small><b>${escapeHtml(me.name)}</b></span><strong>${me.score}</strong></div><div class="duel-round"><small>${status}</small><b>VS</b><span>${m.mode.toUpperCase()}</span></div><div class="duelist opponent"><strong>${op.score}</strong><span><small>RIVAL</small><b>${escapeHtml(op.name)}</b></span><i>${escapeHtml(op.glyph||'♛')}</i></div></header>${arena}<footer class="duel-match-footer"><button id="duelLeaveButton" class="glass-button" type="button">${m.status==='complete'?'闘技場へ戻る':'対戦から退出'}</button><span>${m.practice?'AI PRACTICE · NO RATING':'SERVER-AUTHORITATIVE PLAY-MONEY DUEL'}</span></footer></div>`;
      this.bindMatchControls();
      if (m.status === 'complete' && !m.practice) this.claimResult();
    }

    renderWaiting() {
      const waitingSignature = `waiting:${this.match?.id||''}:${this.match?.code||''}`;
      if (waitingSignature === this.lastRenderSignature && $('#duelContent .duel-waiting')) return;
      this.lastRenderSignature = waitingSignature;
      const modeKey = this.match.mode==='dice'?'sicbo':this.match.mode==='war'?'war':this.match.mode;
      const mode = GAME_ICONS[modeKey] || (this.match.mode==='baccarat'?'龍':'⚔');
      $('#duelContent').innerHTML = `<div class="duel-waiting"><div class="waiting-orbit"><i></i><i></i><b>${mode}</b></div><p class="eyebrow">PRIVATE CHALLENGE OPEN</p><h3>対戦相手を待っています</h3><div class="duel-code-card"><small>DUEL CODE</small><strong id="duelCodeDisplay">${this.match.code}</strong><button id="copyDuelCode" type="button">コードをコピー</button></div><p>同じROOMの友達がコードを入力すると、自動で対戦が始まります。</p><button id="duelCancelButton" class="glass-button" type="button">待機をキャンセル</button></div>`;
      $('#copyDuelCode')?.addEventListener('click',()=>navigator.clipboard?.writeText(this.match.code).then(()=>this.app.toast('対戦コードをコピー',this.match.code,'⚔')).catch(()=>{}));
      $('#duelCancelButton')?.addEventListener('click',()=>this.leave());
    }

    rouletteArena(m, me, op, last) {
      const locked = Boolean(m.choices?.[me.id]);
      const outcome = last?.type === 'roulette' ? last.outcome : null;
      const history = (m.history||[]).slice(-5).map(h=>`<span class="${h.outcome.number===0?'green':h.outcome.color}">${h.outcome.number}</span>`).join('');
      if (m.status === 'complete') return this.completeArena(m,me,op,last,history);
      return `<section class="duel-arena roulette-duel-arena"><div class="duel-result-orb ${outcome?.color||''}"><small>LAST SPIN</small><strong>${outcome?outcome.number:'?'}</strong><span>${outcome?outcome.color.toUpperCase():'WAITING'}</span></div><div class="duel-history">${history||'<span>—</span>'}</div><div class="duel-pick-panel"><p>${locked?'選択をロックしました。相手を待っています。':'当たりカテゴリを選択。数字直撃は追加3 POINT。'}</p><div class="duel-category-grid">${['red','black','odd','even','low','high'].map(x=>`<button data-duel-pick="${x}" type="button" ${locked?'disabled':''}>${{red:'RED',black:'BLACK',odd:'ODD',even:'EVEN',low:'1–18',high:'19–36'}[x]}</button>`).join('')}</div><label class="duel-exact-number"><span>EXACT NUMBER BONUS</span><input id="duelExactNumber" type="number" min="0" max="36" placeholder="0–36" ${locked?'disabled':''}/></label></div></section>`;
    }

    diceArena(m, me, op, last) {
      const locked = Boolean(m.choices?.[me.id]);
      const outcome = last?.type === 'dice' ? last.outcome : null;
      const dice = outcome?.dice || [null,null];
      if (m.status === 'complete') return this.completeArena(m,me,op,last,(m.history||[]).map(h=>`<span>${h.outcome.sum}</span>`).join(''));
      return `<section class="duel-arena dice-duel-arena"><div class="duel-dice-result"><div class="duel-die">${dice[0]||'?'}</div><div class="duel-die">${dice[1]||'?'}</div><strong>${outcome?`TOTAL ${outcome.sum}`:'ROLL PENDING'}</strong></div><div class="duel-pick-panel"><p>${locked?'予想をロックしました。':'合計帯域または一点を選択してください。'}</p><div class="duel-category-grid dice"><button data-duel-pick="low" ${locked?'disabled':''}>LOW<br><small>2–6 · 1PT</small></button><button data-duel-pick="seven" ${locked?'disabled':''}>SEVEN<br><small>7 · 2PT</small></button><button data-duel-pick="high" ${locked?'disabled':''}>HIGH<br><small>8–12 · 1PT</small></button></div><div class="duel-exact-sums">${Array.from({length:11},(_,i)=>i+2).map(n=>`<button data-duel-pick="exact-${n}" ${locked?'disabled':''}>${n}</button>`).join('')}</div></div></section>`;
    }

    blackjackArena(m, me, op, last) {
      const bj = m.blackjack || {};
      const myHand = bj.hands?.[me.id] || [];
      const opHand = bj.hands?.[op.id] || [];
      const myStood = Boolean(bj.stood?.[me.id]);
      if (m.status === 'complete') return this.completeArena(m,me,op,last,(m.history||[]).map(h=>`<span>${h.values?.[me.id]||0}–${h.values?.[op.id]||0}</span>`).join(''));
      return `<section class="duel-arena blackjack-duel-arena"><div class="duel-bj-hand opponent-hand"><header><span>${escapeHtml(op.name)}</span><b>${opHand.length?handValue(opHand).total:'—'}</b></header><div class="card-row">${opHand.map(c=>cardHtml(c)).join('')}</div><small>${bj.stood?.[op.id]?'STAND':'CHOOSING'}</small></div><div class="duel-bj-divider"><i>♠</i><span>BEST OF 3</span></div><div class="duel-bj-hand self-hand"><header><span>YOUR HAND</span><b>${myHand.length?handValue(myHand).total:'—'}</b></header><div class="card-row">${myHand.map(c=>cardHtml(c)).join('')}</div><div class="duel-bj-actions"><button data-duel-action="hit" ${myStood?'disabled':''}>HIT</button><button data-duel-action="stand" ${myStood?'disabled':''}>STAND</button></div><small>${myStood?'LOCKED · 相手を待っています':'21を超えず、相手より高く'}</small></div></section>`;
    }

    warArena(m, me, op, last) {
      const locked = Boolean(m.choices?.[me.id]);
      const outcome = last?.type === 'war' ? last.outcome : null;
      const myCard = outcome?.cards?.[me.id];
      const opCard = outcome?.cards?.[op.id];
      const history = (m.history||[]).slice(-5).map(h=>{
        const mine=h.outcome?.cards?.[me.id], theirs=h.outcome?.cards?.[op.id];
        return `<span>${mine?`${mine.rank}${mine.suit}`:'?'}–${theirs?`${theirs.rank}${theirs.suit}`:'?'}</span>`;
      }).join('');
      if (m.status === 'complete') return this.completeArena(m,me,op,last,history);
      return `<section class="duel-arena war-duel-arena"><div class="duel-war-result"><div>${opCard?cardHtml(opCard):cardHtml({rank:'?',suit:'',id:'war-op'},true)}</div><strong>⚔</strong><div>${myCard?cardHtml(myCard):cardHtml({rank:'?',suit:'',id:'war-me'},true)}</div></div><div class="duel-pick-panel"><p>${locked?'DRAWをロックしました。相手を待っています。':'同じデッキから一枚ずつ。高いカードが1 POINT、Aが最強。'}</p><div class="duel-history">${history||'<span>—</span>'}</div><button class="table-button primary" data-duel-pick="draw" type="button" ${locked?'disabled':''}>DRAW CROWN CARD</button></div></section>`;
    }

    baccaratArena(m, me, op, last) {
      const locked = Boolean(m.choices?.[me.id]);
      const outcome = last?.type === 'baccarat' ? last.outcome : null;
      const history = (m.history||[]).slice(-5).map(h=>`<span>${String(h.outcome?.winner||'?').toUpperCase()}</span>`).join('');
      const result = outcome ? `<div><small>PLAYER</small><div class="card-row">${(outcome.player||[]).map(c=>cardHtml(c)).join('')}</div><b>${outcome.playerTotal}</b></div><strong>${String(outcome.winner||'').toUpperCase()}</strong><div><small>BANKER</small><div class="card-row">${(outcome.banker||[]).map(c=>cardHtml(c)).join('')}</div><b>${outcome.bankerTotal}</b></div>` : '<strong>ORACLE DRAW PENDING</strong>';
      if (m.status === 'complete') return this.completeArena(m,me,op,last,history);
      return `<section class="duel-arena baccarat-duel-arena"><div class="duel-baccarat-result">${result}</div><div class="duel-pick-panel"><p>${locked?'予想をロックしました。':'9に近い側を予想。TIE直撃は3 POINT。'}</p><div class="duel-choice-three"><button data-duel-pick="player" type="button" ${locked?'disabled':''}><b>PLAYER</b><small>1 POINT</small></button><button data-duel-pick="banker" type="button" ${locked?'disabled':''}><b>BANKER</b><small>1 POINT</small></button><button data-duel-pick="tie" type="button" ${locked?'disabled':''}><b>TIE</b><small>3 POINT</small></button></div><div class="duel-history">${history||'<span>—</span>'}</div></div></section>`;
    }

    completeArena(m, me, op, last, historyHtml='') {
      const winner = m.winnerId === null ? null : m.players.find(p=>p.id===m.winnerId);
      const isWin = m.winnerId === me.id;
      const title = winner ? (isWin?'VICTORY':'DEFEAT') : 'DRAW';
      const receipt = this.app.ascension?.data?.duel?.receipts?.[m.id];
      const rewardText = receipt
        ? `<b>${escapeHtml(String(receipt.result || 'claimed').toUpperCase())}</b> · +${formatL(receipt.coins || 0)} · +${fmt.format(receipt.medals || 0)} MEDALS · RATING ${(receipt.ratingDelta || 0)>=0?'+':''}${receipt.ratingDelta || 0}`
        : (m.practice?'練習試合のため報酬・レーティング変動なし':'結果報酬を同期しています…');
      return `<section class="duel-complete ${isWin?'win':winner?'lose':'tie'}"><div class="duel-victory-sigil">${isWin?'♛':winner?'☾':'◇'}</div><p class="eyebrow">CROWN DUEL COMPLETE</p><h3>${title}</h3><strong>${me.score} — ${op.score}</strong><p>${winner?`${escapeHtml(winner.name)} がこの夜の勝者です。`:'互いの運命が完全に釣り合いました。'}</p><div class="duel-final-history">${historyHtml}</div><div id="duelRewardState" class="duel-reward-state">${rewardText}</div></section>`;
    }

    bindMatchControls() {
      $$('[data-duel-pick]').forEach(b=>b.addEventListener('click',()=>{
        if (this.match.mode === 'roulette') {
          const raw = $('#duelExactNumber')?.value?.trim?.() ?? '';
          this.action({type:'pick',category:b.dataset.duelPick,number:raw === '' ? null : Number(raw)});
        }
        else this.action({type:'pick',category:b.dataset.duelPick});
      }));
      $$('[data-duel-action]').forEach(b=>b.addEventListener('click',()=>this.action({type:b.dataset.duelAction})));
      $('#duelLeaveButton')?.addEventListener('click',()=>this.match.status==='complete'?this.closeMatch(true):this.leave());
    }

    async action(action) {
      if (this.busy || !this.match || this.match.status !== 'active') return;
      this.busy = true;
      try {
        if (this.match.practice) this.practiceAction(action);
        else {
          const data = await this.request('/api/duel/action',{room:this.app.room.room,matchId:this.match.id,playerId:this.me.id,action});
          this.match = data.match;
          this.renderMatch();
          if (this.match.status === 'complete') this.claimResult();
        }
      } catch (error) { this.app.toast('対戦アクションエラー',error.message,'⚔'); }
      finally { this.busy = false; }
    }

    async leave() {
      if (!this.match) return this.closeMatch(true);
      if (!this.match.practice && this.online) {
        try { await this.request('/api/duel/leave',{room:this.app.room.room,matchId:this.match.id,playerId:this.me.id}); } catch {}
      }
      this.closeMatch(true);
    }

    async claimResult() {
      const m = this.match;
      if (!m || m.practice || m.status !== 'complete' || this.app.ascension.data.duel.claimed[m.id]) return;
      this.app.ascension.data.duel.claimed[m.id] = 'pending';
      this.app.profile.save();
      try {
        const data = await this.request('/api/duel/claim',{room:this.app.room.room,matchId:m.id,playerId:this.me.id});
        if (data.alreadyClaimed) {
          this.app.ascension.data.duel.claimed[m.id] = Date.now();
          this.app.profile.save();
          const rewardEl = $('#duelRewardState');
          if (rewardEl) rewardEl.textContent = '報酬は受取済みです。';
          return;
        }
        const duel = this.app.ascension.data.duel;
        const event = this.app.activeNightEvent?.();
        let medals = data.reward.medals;
        if (event?.id === 'duel') medals *= 2;
        if (this.app.ascension.festival().id === 'crown') medals += 2;
        medals = Math.floor(medals * (1 + this.app.ascension.effect('duelMedal')));
        duel.medals += medals;
        duel.matches += 1;
        let ratingDelta = 0;
        if (data.result === 'win') {
          duel.wins += 1; duel.streak += 1; duel.bestStreak = Math.max(duel.bestStreak,duel.streak); ratingDelta = 25; this.app.ascension.progressWeekly('duelWin',1);
        } else if (data.result === 'loss') {
          duel.losses += 1; duel.streak = 0; ratingDelta = -Math.floor(18 * (1 - this.app.ascension.effect('ratingGuard')));
          const key = weekKey();
          if (this.app.ascension.effect('weeklyShield') && duel.weeklyShieldUsed !== key) { duel.weeklyShieldUsed=key; ratingDelta=0; this.app.toast('夜王の契約','今週最初の敗北によるレーティング低下を無効化しました。','♛'); }
        } else { duel.ties += 1; duel.streak = 0; ratingDelta = 2; }
        duel.rating = Math.max(500,duel.rating + ratingDelta);
        duel.claimed[m.id] = Date.now();
        duel.receipts ||= {};
        const paidCoins=data.reward.coins;
        duel.receipts[m.id] = {result:data.result,coins:paidCoins,requestedCoins:data.reward.coins,medals,ratingDelta,time:Date.now()};
        if (data.season) this.app.ascension.data.season = {...this.app.ascension.data.season,id:data.season.id,xp:data.season.xp,claimed:Object.fromEntries((data.season.claimed||[]).map(tier=>[tier,true]))};
        const masteryGame = m.mode==='dice'?'sicbo':m.mode;
        if (data.season?.ascension) {
          const ascension = data.season.ascension;
          for (const [game, mastery] of Object.entries(ascension.mastery || {})) if (this.app.ascension.data.mastery[game]) this.app.ascension.data.mastery[game] = {...this.app.ascension.data.mastery[game],...mastery};
          this.app.ascension.data.constellation = {...this.app.ascension.data.constellation,nodes:Object.fromEntries((ascension.constellation?.nodes||[]).map(id=>[id,this.app.ascension.data.constellation.nodes[id]||Date.now()])),points:ascension.constellation?.points??this.app.ascension.data.constellation.points,earnedFromMastery:ascension.constellation?.earnedFromMastery??this.app.ascension.data.constellation.earnedFromMastery};
        } else this.app.ascension.addMastery(masteryGame, data.result==='win'?140:70, data.result==='win');
        this.app.profile.save();
        this.app.ascension.updateAll();
        const rewardEl = $('#duelRewardState');
        if (rewardEl) rewardEl.innerHTML = `<b>${data.result.toUpperCase()}</b> · +${formatL(paidCoins)}${paidCoins<data.reward.coins?'＋NOTES':''} · +${medals} MEDALS · RATING ${ratingDelta>=0?'+':''}${ratingDelta}`;
        this.app.audio.play(data.result==='win'?'bigwin':data.result==='tie'?'chime':'lose');
        if (data.result==='win') this.app.celebration.burst(.7);
      } catch (error) {
        delete this.app.ascension.data.duel.claimed[m.id];
        this.app.profile.save();
      }
    }

    startPractice(mode) {
      const ai = {id:'ai-dealer',name:'NIGHT DEALER',glyph:'☾',score:0};
      this.match = {id:`practice-${Date.now()}`,practice:true,mode,status:'active',players:[{...this.me,score:0},ai],round:mode==='blackjack'?0:1,maxRounds:mode==='blackjack'?3:5,choices:{},history:[],winnerId:null};
      if (mode === 'blackjack') this.newPracticeBlackjackRound();
      this.renderMatch();
    }

    newPracticeBlackjackRound() {
      this.practiceDeck = makeDeck(1);
      this.match.round += 1;
      const me = this.player(), op = this.opponent();
      this.match.blackjack = {hands:{[me.id]:[this.practiceDeck.pop(),this.practiceDeck.pop()],[op.id]:[this.practiceDeck.pop(),this.practiceDeck.pop()]},stood:{[me.id]:false,[op.id]:false},result:null};
      if (handValue(this.match.blackjack.hands[me.id]).total >= 21) this.match.blackjack.stood[me.id] = true;
      if (this.match.blackjack.stood[me.id]) this.resolvePracticeBlackjack();
    }

    practiceAction(action) {
      const m=this.match,me=this.player(),op=this.opponent();
      if (m.mode === 'roulette') {
        const aiCategories=['red','black','odd','even','low','high'];
        const number=WHEEL_ORDER[randomInt(WHEEL_ORDER.length)],color=number===0?'green':RED_NUMBERS.has(number)?'red':'black';
        const choices={[me.id]:{category:action.category,number:Number.isInteger(action.number)&&action.number>=0&&action.number<=36?action.number:null},[op.id]:{category:choice(aiCategories),number:randomInt(37)}};
        const points={[me.id]:0,[op.id]:0};
        for(const p of [me,op]){const pick=choices[p.id];if((pick.category==='red'&&RED_NUMBERS.has(number))||(pick.category==='black'&&number!==0&&!RED_NUMBERS.has(number))||(pick.category==='odd'&&number%2===1)||(pick.category==='even'&&number!==0&&number%2===0)||(pick.category==='low'&&number>=1&&number<=18)||(pick.category==='high'&&number>=19))points[p.id]++;if(pick.number===number)points[p.id]+=3;p.score+=points[p.id]}
        m.history.push({round:m.round,type:'roulette',choices,outcome:{number,color},points});
      } else if (m.mode === 'dice') {
        const options=['low','seven','high',`exact-${2+randomInt(11)}`],dice=[1+randomInt(6),1+randomInt(6)],sum=dice[0]+dice[1],choices={[me.id]:{category:action.category},[op.id]:{category:choice(options)}},points={[me.id]:0,[op.id]:0};
        for(const p of [me,op]){const pick=choices[p.id].category;if((pick==='low'&&sum<=6)||(pick==='seven'&&sum===7)||(pick==='high'&&sum>=8))points[p.id]=pick==='seven'?2:1;if(pick===`exact-${sum}`)points[p.id]=3;p.score+=points[p.id]}
        m.history.push({round:m.round,type:'dice',choices,outcome:{dice,sum},points});
      } else if (m.mode === 'war') {
        const deck=makeDeck(1),cards={[me.id]:deck.pop(),[op.id]:deck.pop()};
        const value=c=>c.rank==='A'?14:c.rank==='K'?13:c.rank==='Q'?12:c.rank==='J'?11:Number(c.rank);
        const av=value(cards[me.id]),bv=value(cards[op.id]),winnerId=av===bv?null:av>bv?me.id:op.id,points={[me.id]:0,[op.id]:0};
        if(winnerId){points[winnerId]=1;m.players.find(p=>p.id===winnerId).score++}
        m.history.push({round:m.round,type:'war',choices:{[me.id]:{category:'draw'},[op.id]:{category:'draw'}},outcome:{cards,values:{[me.id]:av,[op.id]:bv},winnerId},points});
      } else if (m.mode === 'baccarat') {
        const deck=makeDeck(1),cv=c=>c.rank==='A'?1:['10','J','Q','K'].includes(c.rank)?0:Number(c.rank),total=cards=>cards.reduce((a,c)=>a+cv(c),0)%10;
        const player=[deck.pop(),deck.pop()],banker=[deck.pop(),deck.pop()];let pt=total(player),bt=total(banker),third=null;
        if(pt<8&&bt<8){if(pt<=5){const c=deck.pop();player.push(c);third=cv(c);pt=total(player)}let draw=false;if(third===null)draw=bt<=5;else if(bt<=2)draw=true;else if(bt===3)draw=third!==8;else if(bt===4)draw=third>=2&&third<=7;else if(bt===5)draw=third>=4&&third<=7;else if(bt===6)draw=third===6||third===7;if(draw){banker.push(deck.pop());bt=total(banker)}}
        const winner=pt===bt?'tie':pt>bt?'player':'banker',aiPick=choice(['player','banker','tie']),choices={[me.id]:{category:action.category},[op.id]:{category:aiPick}},points={[me.id]:0,[op.id]:0};
        for(const p of [me,op]){const pick=choices[p.id].category;if(pick===winner){points[p.id]=pick==='tie'?3:1;p.score+=points[p.id]}}
        m.history.push({round:m.round,type:'baccarat',choices,outcome:{player,banker,playerTotal:pt,bankerTotal:bt,winner},points});
      } else {
        const hand=m.blackjack.hands[me.id];if(action.type==='hit'){hand.push(this.practiceDeck.pop());if(handValue(hand).total>=21)m.blackjack.stood[me.id]=true}else m.blackjack.stood[me.id]=true;if(m.blackjack.stood[me.id])this.resolvePracticeBlackjack();this.renderMatch();return;
      }
      if(m.round>=m.maxRounds)this.finishPractice();else m.round++;
      this.renderMatch();
    }

    resolvePracticeBlackjack() {
      const m=this.match,me=this.player(),op=this.opponent(),bj=m.blackjack,opHand=bj.hands[op.id];
      while(handValue(opHand).total<17)opHand.push(this.practiceDeck.pop());
      bj.stood[op.id]=true;
      const av=handValue(bj.hands[me.id]).total,bv=handValue(opHand).total;let winnerId=null;
      if(av<=21||bv<=21){if(av>21)winnerId=op.id;else if(bv>21)winnerId=me.id;else if(av!==bv)winnerId=av>bv?me.id:op.id}
      if(winnerId)m.players.find(p=>p.id===winnerId).score++;
      m.history.push({round:m.round,type:'blackjack',values:{[me.id]:av,[op.id]:bv},winnerId,hands:bj.hands});
      if(m.round>=m.maxRounds)this.finishPractice();else this.newPracticeBlackjackRound();
    }

    finishPractice() {
      const [a,b]=this.match.players;this.match.status='complete';this.match.winnerId=a.score===b.score?null:a.score>b.score?a.id:b.id;
    }
  }

  const dieFace = value => `<div class="asc-die face-${value}">${Array.from({length:9},(_,i)=>`<i class="${DICE_PIPS[value]?.includes(i)?'on':''}"></i>`).join('')}</div>`;

  class CrapsGame extends GameBase {
    constructor(app,mount){super(app,mount);this.bet=1000;this.selection='pass';this.point=null;this.pendingWager=0;this.dice=[3,4];this.message='BETを選んでROLL';this.lastSum=7;}
    mount(){
      this.root.innerHTML=`<div class="game-stage craps-stage asc-game-stage"><div class="asc-table-header"><div><p class="eyebrow">MOONSTONE DICE TABLE</p><h3 id="crapsStatus">${this.message}</h3><small id="crapsPointText">COME OUT ROLL</small></div><div class="craps-puck" id="crapsPuck">OFF</div></div><div class="craps-center"><div class="craps-dice-tray"><div id="crapsDice">${this.dice.map(dieFace).join('')}</div><strong id="crapsTotal">TOTAL ${this.lastSum}</strong></div><div class="craps-layout"><button data-craps-bet="pass" class="active"><small>PASS LINE</small><b>POINT BEFORE 7</b><span>2×</span></button><button data-craps-bet="dont"><small>DON'T PASS</small><b>7 BEFORE POINT</b><span>2×</span></button><button data-craps-bet="field"><small>FIELD</small><b>2·3·4·9·10·11·12</b><span>2–3×</span></button><button data-craps-bet="any7"><small>ANY 7</small><b>NEXT ROLL IS 7</b><span>5×</span></button><button data-craps-bet="exact6"><small>EXACT 6</small><b>NEXT TOTAL IS 6</b><span>6×</span></button><button data-craps-bet="exact8"><small>EXACT 8</small><b>NEXT TOTAL IS 8</b><span>6×</span></button></div></div><div class="bet-dock asc-bet-dock">${this.chipSelector(this.bet,v=>v)}<div class="bet-readout"><small>${this.point?'ACTIVE WAGER':'YOUR BET'}</small><strong id="crapsBet">${formatL(this.bet)}</strong></div><button id="crapsRoll" class="table-button primary" type="button">ROLL DICE</button></div></div>`;
      this.bindChips(this.root,v=>{if(this.point||this.busy)return;this.bet=v;this.render()});
      $$('[data-craps-bet]',this.root).forEach(b=>b.addEventListener('click',()=>{if(this.point||this.busy)return;this.selection=b.dataset.crapsBet;this.app.audio.play('chip');this.render()}));
      $('#crapsRoll',this.root).addEventListener('click',()=>this.roll());this.render();
    }
    async roll(){
      if(this.busy)return;
      if(!this.pendingWager){if(!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.pendingWager=this.bet}
      this.busy=true;this.message='骰子が月光を跳ねています…';this.render();this.app.audio.play('spin');
      const delay=this.app.profile.data.settings.reducedMotion?80:520;
      const ticker=this.setInterval(()=>{this.dice=[1+randomInt(6),1+randomInt(6)];this.renderDice()},65);
      await wait(delay);clearInterval(ticker);if(this.disposed)return;this.dice=[1+randomInt(6),1+randomInt(6)];this.lastSum=this.dice[0]+this.dice[1];this.app.audio.play('stop');this.renderDice();await wait(this.app.profile.data.settings.reducedMotion?30:260);if(this.disposed)return;this.resolve();
    }
    settle(payout,label){const wager=this.pendingWager;this.app.recordRound({game:'craps',wager,payout,label,detail:`${this.dice[0]} + ${this.dice[1]} = ${this.lastSum}`});this.pendingWager=0;this.point=null;this.busy=false;this.render();this.setTimeout(()=>{this.message='BETを選んでROLL';this.render()},1600)}
    resolve(){
      const s=this.lastSum,sel=this.selection;
      if(sel==='pass'){
        if(this.point===null){if([7,11].includes(s))return this.settle(this.bet*2,'PASS LINE WIN');if([2,3,12].includes(s))return this.settle(0,'CRAPS');this.point=s;this.message=`POINT ${s} — 7より先にもう一度${s}`;this.busy=false;return this.render()}
        if(s===this.point)return this.settle(this.bet*2,'POINT MADE');if(s===7)return this.settle(0,'SEVEN OUT');this.message=`POINT ${this.point} 継続 · 今回 ${s}`;this.busy=false;return this.render();
      }
      if(sel==='dont'){
        if(this.point===null){if([2,3].includes(s))return this.settle(this.bet*2,"DON'T PASS WIN");if([7,11].includes(s))return this.settle(0,'NATURAL LOSE');if(s===12)return this.settle(this.bet,'BAR 12 PUSH');this.point=s;this.message=`POINT ${s} — 先に7で勝利`;this.busy=false;return this.render()}
        if(s===7)return this.settle(this.bet*2,'SEVEN BEFORE POINT');if(s===this.point)return this.settle(0,'POINT MADE BY TABLE');this.message=`POINT ${this.point} 継続 · 今回 ${s}`;this.busy=false;return this.render();
      }
      if(sel==='field'){const payout=[2,12].includes(s)?this.bet*3:[3,4,9,10,11].includes(s)?this.bet*2:0;return this.settle(payout,payout?'FIELD WIN':'FIELD MISS')}
      if(sel==='any7')return this.settle(s===7?this.bet*5:0,s===7?'ANY 7':'SEVEN MISSED');
      const target=sel==='exact6'?6:8;return this.settle(s===target?this.bet*6:0,s===target?`EXACT ${target}`:`${target} MISSED`);
    }
    renderDice(){const el=$('#crapsDice',this.root);if(el)el.innerHTML=this.dice.map(dieFace).join('');if($('#crapsTotal',this.root))$('#crapsTotal',this.root).textContent=`TOTAL ${this.dice[0]+this.dice[1]}`}
    render(){if(!$('#crapsStatus',this.root))return;$('#crapsStatus',this.root).textContent=this.message;$('#crapsPointText',this.root).textContent=this.point?`POINT IS ${this.point}`:'COME OUT ROLL';$('#crapsPuck',this.root).textContent=this.point?this.point:'OFF';$('#crapsPuck',this.root).classList.toggle('on',this.point!==null);$('#crapsBet',this.root).textContent=formatL(this.pendingWager||this.bet);$('#crapsRoll',this.root).disabled=this.busy;$$('[data-craps-bet]',this.root).forEach(b=>{b.classList.toggle('active',b.dataset.crapsBet===this.selection);b.disabled=Boolean(this.point)||this.busy});$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=Boolean(this.point)||this.busy});this.renderDice()}
  }

  class DragonTigerGame extends GameBase {
    constructor(app,mount){super(app,mount);this.bet=1000;this.selection='dragon';this.dragon=null;this.tiger=null;this.status='龍か虎かを選択';}
    mount(){this.root.innerHTML=`<div class="game-stage dragon-stage asc-game-stage"><div class="table-status"><b id="dtStatus">${this.status}</b><small>ONE CARD · A LOW / K HIGH</small></div><div class="dragon-table"><section class="dragon-side"><header><i>龍</i><div><small>DRAGON</small><h3>蒼龍</h3></div></header><div id="dragonCard" class="dragon-card-slot"><span>龍</span></div></section><div class="dragon-versus"><i></i><b>VS</b><i></i></div><section class="tiger-side"><header><div><small>TIGER</small><h3>白虎</h3></div><i>虎</i></header><div id="tigerCard" class="dragon-card-slot"><span>虎</span></div></section></div><div class="dragon-bets"><button data-dt-bet="dragon" class="active"><b>DRAGON</b><span>2×</span></button><button data-dt-bet="tiger"><b>TIGER</b><span>2×</span></button><button data-dt-bet="tie"><b>TIE</b><span>9×</span></button><button data-dt-bet="suited"><b>SUITED TIE</b><span>51×</span></button></div><div class="bet-dock asc-bet-dock">${this.chipSelector(this.bet)}<div class="bet-readout"><small>YOUR BET</small><strong id="dtBet">${formatL(this.bet)}</strong></div><button id="dtDeal" class="table-button primary">DEAL</button></div></div>`;this.bindChips(this.root,v=>{if(this.busy)return;this.bet=v;this.render()});$$('[data-dt-bet]',this.root).forEach(b=>b.addEventListener('click',()=>{if(this.busy)return;this.selection=b.dataset.dtBet;this.app.audio.play('chip');this.render()}));$('#dtDeal',this.root).addEventListener('click',()=>this.deal());this.render()}
    async deal(){if(this.busy||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.busy=true;this.dragon=null;this.tiger=null;this.status='カードを配っています…';this.render();const deck=makeDeck(8);await wait(this.app.profile.data.settings.reducedMotion?30:320);if(this.disposed)return;this.dragon=deck.pop();this.app.audio.play('card');this.render();await wait(this.app.profile.data.settings.reducedMotion?30:420);if(this.disposed)return;this.tiger=deck.pop();this.app.audio.play('card');this.render();await wait(this.app.profile.data.settings.reducedMotion?20:260);if(this.disposed)return;this.resolve()}
    resolve(){const d=RANKS_CARDS.indexOf(this.dragon.rank),t=RANKS_CARDS.indexOf(this.tiger.rank),tie=d===t,suited=tie&&this.dragon.suit===this.tiger.suit;let result=d>t?'dragon':d<t?'tiger':'tie';let mult=0;if(this.selection===result)mult=result==='tie'?9:2;if(this.selection==='suited'&&suited)mult=51;const payout=Math.floor(this.bet*mult);this.status=suited?'SUITED TIE':tie?'TIE':result==='dragon'?'DRAGON WINS':'TIGER WINS';this.app.recordRound({game:'dragon',wager:this.bet,payout,label:this.status,detail:`${this.dragon.rank}${this.dragon.suit} · ${this.tiger.rank}${this.tiger.suit}`});this.busy=false;this.render();this.setTimeout(()=>{this.dragon=null;this.tiger=null;this.status='龍か虎かを選択';this.render()},1900)}
    render(){if(!$('#dtStatus',this.root))return;$('#dtStatus',this.root).textContent=this.status;$('#dtBet',this.root).textContent=formatL(this.bet);$('#dragonCard',this.root).innerHTML=this.dragon?cardHtml(this.dragon):'<span>龍</span>';$('#tigerCard',this.root).innerHTML=this.tiger?cardHtml(this.tiger):'<span>虎</span>';$('#dtDeal',this.root).disabled=this.busy;$$('[data-dt-bet]',this.root).forEach(b=>{b.classList.toggle('active',b.dataset.dtBet===this.selection);b.disabled=this.busy});$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.busy})}
  }

  const FORTUNE_SEGMENTS = [8,0,1,0,0,2,0,1,0,0,3,0,1,0,0,2,0,1,0,0,2,0,1,0].map((mult,i)=>({mult,label:mult?`×${mult}`:'MISS',tone:i%2?'violet':'gold'}));
  class FortuneWheelGame extends GameBase {
    constructor(app,mount){super(app,mount);this.bet=1000;this.rotation=0;this.result=null;}
    mount(){const step=360/FORTUNE_SEGMENTS.length;const colors=FORTUNE_SEGMENTS.map((s,i)=>`${s.tone==='gold'?'#a57225':'#4e286b'} ${i*step}deg ${(i+1)*step}deg`).join(',');const labels=FORTUNE_SEGMENTS.map((s,i)=>`<span style="--segment-angle:${i*step}deg">${s.label}</span>`).join('');this.root.innerHTML=`<div class="game-stage fortune-stage asc-game-stage"><div class="table-status"><b id="fortuneStatus">星座大輪を回してください</b><small>24 SEGMENTS · POINTER-SYNCED</small></div><div class="fortune-wheel-wrap"><div class="fortune-wheel-pointer">◆</div><div id="fortuneWheel" class="fortune-wheel" style="background:conic-gradient(from -7.5deg,${colors})">${labels}<i class="fortune-wheel-ring"></i><b class="fortune-wheel-hub">✺</b></div><div class="fortune-result"><small>LAST RESULT</small><strong id="fortuneResult">—</strong></div></div><div class="fortune-legend">${[0,1,2,3,8].map(x=>`<div class="mult-${x}"><i></i><b>${x?`×${x}`:'MISS'}</b><small>${x===8?'MOON JACKPOT':x===0?'配当なし':'返却倍率'}</small></div>`).join('')}</div><div class="bet-dock asc-bet-dock">${this.chipSelector(this.bet)}<div class="bet-readout"><small>YOUR BET</small><strong id="fortuneBet">${formatL(this.bet)}</strong></div><button id="fortuneSpin" class="spin-button">SPIN</button></div></div>`;this.bindChips(this.root,v=>{if(this.busy)return;this.bet=v;this.render()});$('#fortuneSpin',this.root).addEventListener('click',()=>this.spin());this.render()}
    async spin(){if(this.busy||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.busy=true;this.result=null;this.render();this.app.audio.play('spin');const index=randomInt(FORTUNE_SEGMENTS.length),step=360/FORTUNE_SEGMENTS.length,center=index*step,current=((this.rotation%360)+360)%360,target=((360-center)%360),delta=((target-current+360)%360)+(this.app.profile.data.settings.reducedMotion?360:2160);this.rotation+=delta;const wheel=$('#fortuneWheel',this.root);wheel.style.transitionDuration=this.app.profile.data.settings.reducedMotion?'.35s':'4.2s';wheel.style.transform=`rotate(${this.rotation}deg)`;wheel.dataset.targetIndex=String(index);await wait(this.app.profile.data.settings.reducedMotion?380:4300);if(this.disposed)return;this.result=FORTUNE_SEGMENTS[index];wheel.dataset.resultIndex=String(index);const payout=this.bet*this.result.mult;this.app.audio.play(this.result.mult>=3?'bigwin':this.result.mult?'win':'lose');this.app.recordRound({game:'wheel',wager:this.bet,payout,label:this.result.mult===8?'MOON JACKPOT':this.result.label,detail:`SEGMENT ${index+1}`});this.busy=false;this.render()}
    render(){if(!$('#fortuneStatus',this.root))return;$('#fortuneBet',this.root).textContent=formatL(this.bet);$('#fortuneSpin',this.root).disabled=this.busy;$('#fortuneResult',this.root).textContent=this.result?this.result.label:'—';$('#fortuneStatus',this.root).textContent=this.busy?'黄金の針が運命を探しています…':this.result?`${this.result.label} に停止しました`:'星座大輪を回してください';$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.busy})}
  }

  const combination=(n,k)=>{if(k<0||k>n)return 0;k=Math.min(k,n-k);let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return r};
  class MinesGame extends GameBase {
    constructor(app,mount){
      super(app,mount);this.bet=1000;this.mineCount=5;this.phase='idle';this.mines=new Set();this.revealed=new Set();this.multiplier=1;this.status='難易度を選んで採掘を開始';this.showMines=false;this.roundId=0;this.resetTimer=null;
    }
    get active(){return this.phase==='active'}
    mount(){
      this.root.innerHTML=`<div class="game-stage mines-stage asc-game-stage" data-mines-phase="idle"><div class="mines-top"><div><p class="eyebrow">ABYSSAL EXTRACTION</p><h3 id="minesStatus">${this.status}</h3><div id="minesRoundBadge" class="mines-round-badge"><i></i><b>ROUND IDLE</b><span>BETと地雷数を選択</span></div></div><div class="mines-multiplier"><small>CURRENT MULTIPLIER</small><strong id="minesMultiplier">×1.00</strong><span id="minesPotential">${formatL(this.bet)}</span></div></div><div class="mines-layout"><div class="mines-board-shell"><div class="mines-board-header"><span><i>◇</i> SEALED ABYSS GRID</span><b id="minesBoardState">待機中</b></div><div id="minesGrid" class="mines-grid" aria-label="ABYSSAL MINES盤面"></div></div><aside class="mines-controls"><p class="eyebrow">MINE COUNT</p><div class="mine-count-row">${[3,5,7,9].map(n=>`<button data-mine-count="${n}" class="${n===this.mineCount?'active':''}" type="button">${n}</button>`).join('')}</div><div class="mines-risk-readout"><div><small>SAFE TILES</small><b id="minesSafe">20</b></div><div><small>OPENED</small><b id="minesOpened">0</b></div></div>${this.chipSelector(this.bet)}<button id="minesStart" class="primary-cta mines-start-button" type="button"><span>採掘を開始</span><i>START ROUND</i></button><button id="minesCash" class="gold-button" type="button" disabled>CASH OUT</button><p class="mines-warning">ROUND LIVE中は開始ボタンが金色から青緑へ変化し、盤面上部に「採掘中」と表示されます。</p></aside></div></div>`;
      this.bindChips(this.root,v=>{if(this.phase!=='idle')return;this.bet=v;this.render()});
      $$('[data-mine-count]',this.root).forEach(b=>b.addEventListener('click',()=>{if(this.phase!=='idle')return;this.mineCount=Number(b.dataset.mineCount);this.app.audio.play('chip');this.render()}));
      $('#minesStart',this.root).addEventListener('click',()=>this.start());
      $('#minesCash',this.root).addEventListener('click',()=>this.cashOut());
      this.render();
    }
    clearReset(){if(this.resetTimer){clearTimeout(this.resetTimer);this.resetTimer=null}}
    start(){
      if(this.phase!=='idle'||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;
      this.clearReset();this.roundId++;this.phase='active';this.showMines=false;this.revealed.clear();this.multiplier=1;
      // Mines are generated atomically, but never reflected by a CSS class or glyph while sealed.
      this.mines=new Set(shuffled(Array.from({length:25},(_,i)=>i)).slice(0,this.mineCount));
      this.status='採掘中 — 星晶だと思う場所を選択';this.app.audio.play('chime');this.render();
    }
    reveal(index){
      if(this.phase!=='active'||this.revealed.has(index))return;
      this.revealed.add(index);
      if(this.mines.has(index)){this.status='深淵が開きました';this.app.audio.play('lose');this.finish(0,'MINE DETONATED',true);return}
      this.app.audio.play('chip');const safeOpened=[...this.revealed].filter(i=>!this.mines.has(i)).length;
      this.multiplier=Math.max(1.01,.96*combination(25,this.mineCount)/combination(25-safeOpened,this.mineCount));
      this.status=`SAFE ${safeOpened} · ×${this.multiplier.toFixed(2)}`;
      if(safeOpened>=25-this.mineCount)this.cashOut();else this.render();
    }
    cashOut(){if(this.phase!=='active'||![...this.revealed].some(i=>!this.mines.has(i)))return;const payout=Math.floor(this.bet*this.multiplier);this.finish(payout,'ABYSSAL CASH OUT',false)}
    finish(payout,label,revealMines){
      const token=this.roundId;this.phase=revealMines?'lost':'cashed';this.showMines=Boolean(revealMines);
      const safeCount=[...this.revealed].filter(i=>!this.mines.has(i)).length;
      this.app.recordRound({game:'mines',wager:this.bet,payout,label,detail:`${safeCount} SAFE · ${this.mineCount} MINES`});this.render();
      this.clearReset();this.resetTimer=this.setTimeout(()=>{if(token!==this.roundId)return;this.phase='idle';this.revealed.clear();this.mines.clear();this.multiplier=1;this.status='難易度を選んで採掘を開始';this.showMines=false;this.resetTimer=null;this.render()},this.app.profile.data.settings.reducedMotion?650:1900);
    }
    render(){
      const grid=$('#minesGrid',this.root);if(!grid)return;
      const stage=this.root.querySelector('.mines-stage');stage.dataset.minesPhase=this.phase;stage.classList.toggle('round-live',this.phase==='active');
      $('#minesStatus',this.root).textContent=this.status;$('#minesMultiplier',this.root).textContent=`×${this.multiplier.toFixed(2)}`;$('#minesPotential',this.root).textContent=formatL(Math.floor(this.bet*this.multiplier));$('#minesSafe',this.root).textContent=25-this.mineCount;
      const safeOpened=[...this.revealed].filter(i=>!this.mines.has(i)).length;$('#minesOpened',this.root).textContent=safeOpened;
      const badge=$('#minesRoundBadge',this.root),badgeB=badge.querySelector('b'),badgeSpan=badge.querySelector('span');
      const labels={idle:['ROUND IDLE','BETと地雷数を選択'],active:['ROUND LIVE','採掘中 · SEALED位置は完全非公開'],lost:['ROUND LOST','地雷位置を結果表示中'],cashed:['CASH OUT','配当を確定しました']};
      badgeB.textContent=labels[this.phase][0];badgeSpan.textContent=labels[this.phase][1];
      $('#minesBoardState',this.root).textContent=this.phase==='active'?`採掘中 · ${25-this.revealed.size} SEALED`:this.phase==='lost'?'結果公開中':this.phase==='cashed'?'回収成功':'待機中';
      grid.innerHTML=Array.from({length:25},(_,i)=>{
        const open=this.revealed.has(i),isMine=open&&this.mines.has(i),resultMine=this.showMines&&this.mines.has(i),ghost=resultMine&&!open;
        const state=isMine||resultMine?'mine':open?'safe':'sealed';
        // Closed tiles deliberately never receive mine-specific classes, labels, text or inline state.
        const cls=state==='sealed'?'mine-tile sealed':`mine-tile ${state==='safe'?'open':'mine'} ${ghost?'ghost':''}`;
        const glyph=state==='sealed'?'◇':state==='safe'?'✦':'◆';
        const label=state==='sealed'?`封印されたマス ${i+1}`:state==='safe'?`安全な星晶 ${i+1}`:`地雷 ${i+1}`;
        return `<button class="${cls}" data-mine-tile="${i}" type="button" aria-label="${label}" ${this.phase!=='active'||open?'disabled':''}><span>${glyph}</span><i></i></button>`;
      }).join('');
      $$('[data-mine-tile]',this.root).forEach(b=>b.addEventListener('click',()=>this.reveal(Number(b.dataset.mineTile))));
      const start=$('#minesStart',this.root);start.disabled=this.phase!=='idle';start.setAttribute('aria-pressed',String(this.phase==='active'));
      start.querySelector('span').textContent=this.phase==='active'?'採掘中':this.phase==='lost'?'結果を確認中':this.phase==='cashed'?'回収完了':'採掘を開始';
      start.querySelector('i').textContent=this.phase==='active'?'ROUND LIVE':this.phase==='idle'?'START ROUND':'PLEASE WAIT';
      $('#minesCash',this.root).disabled=this.phase!=='active'||safeOpened<1;
      $$('[data-mine-count]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.mineCount)===this.mineCount);b.disabled=this.phase!=='idle'});
      $$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.phase!=='idle'});
    }
  }

  const PLINKO_TABLES={
    low:[4,2,1.4,1.1,.8,.6,.45,.6,.8,1.1,1.4,2,4],
    medium:[9,3,1.5,.8,.45,.25,.15,.25,.45,.8,1.5,3,9],
    high:[22,5,2,.7,.3,.12,0,.12,.3,.7,2,5,22]
  };
  class PlinkoGame extends GameBase {
    constructor(app,mount){super(app,mount);this.bet=1000;this.risk='medium';this.rows=12;this.ball=null;this.resizeHandler=()=>this.draw();}
    mount(){this.root.innerHTML=`<div class="game-stage plinko-stage asc-game-stage"><div class="plinko-top"><div><p class="eyebrow">STARFALL PHYSICS</p><h3 id="plinkoStatus">星球をDROPしてください</h3></div><div class="plinko-risk">${['low','medium','high'].map(x=>`<button data-plinko-risk="${x}" class="${x===this.risk?'active':''}">${x.toUpperCase()}</button>`).join('')}</div></div><div class="plinko-machine"><canvas id="plinkoCanvas"></canvas><div id="plinkoBins" class="plinko-bins"></div></div><div class="bet-dock asc-bet-dock">${this.chipSelector(this.bet)}<div class="bet-readout"><small>YOUR BET</small><strong id="plinkoBet">${formatL(this.bet)}</strong></div><button id="plinkoDrop" class="spin-button">DROP</button></div></div>`;this.canvas=$('#plinkoCanvas',this.root);this.ctx=this.canvas.getContext('2d');this.bindChips(this.root,v=>{if(this.busy)return;this.bet=v;this.render()});$$('[data-plinko-risk]',this.root).forEach(b=>b.addEventListener('click',()=>{if(this.busy)return;this.risk=b.dataset.plinkoRisk;this.app.audio.play('chip');this.render()}));$('#plinkoDrop',this.root).addEventListener('click',()=>this.drop());window.addEventListener('resize',this.resizeHandler);this.render();requestAnimationFrame(()=>this.draw())}
    unmount(){window.removeEventListener('resize',this.resizeHandler);super.unmount()}
    geometry(){const rect=this.canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),top=34,bottom=h-54,margin=clamp(w*.04,18,36),gapY=(bottom-top)/this.rows,spacing=(w-margin*2)/(this.rows+1);return{w,h,top,bottom,margin,gapY,spacing}}
    resize(){const g=this.geometry(),dpr=Math.min(2,devicePixelRatio||1),machine=this.canvas.closest('.plinko-machine');if(machine)machine.style.setProperty('--plinko-margin',`${g.margin}px`);if(this.canvas.width!==Math.floor(g.w*dpr)||this.canvas.height!==Math.floor(g.h*dpr)){this.canvas.width=Math.floor(g.w*dpr);this.canvas.height=Math.floor(g.h*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0)}return g}
    pathFor(choices){const g=this.geometry(),points=[{x:g.w/2,y:16}],rights=choices.reduce((a,x)=>a+(x?1:0),0);let rCount=0;choices.forEach((right,row)=>{if(right)rCount++;points.push({x:g.w/2+(rCount-(row+1)/2)*g.spacing,y:g.top+row*g.gapY})});points.push({x:g.margin+(rights+.5)*g.spacing,y:g.bottom+22});return{points,bin:rights,geometry:g}}
    draw(ball=this.ball){const g=this.resize(),ctx=this.ctx;ctx.clearRect(0,0,g.w,g.h);const grad=ctx.createLinearGradient(0,0,0,g.h);grad.addColorStop(0,'rgba(112,66,150,.2)');grad.addColorStop(1,'rgba(8,5,16,.02)');ctx.fillStyle=grad;ctx.fillRect(0,0,g.w,g.h);for(let row=0;row<this.rows;row++){const count=row+1,y=g.top+row*g.gapY;for(let i=0;i<count;i++){const x=g.w/2+(i-(count-1)/2)*g.spacing;ctx.beginPath();ctx.arc(x,y,4.2,0,Math.PI*2);ctx.shadowBlur=10;ctx.shadowColor='rgba(244,196,102,.65)';ctx.fillStyle='#e8c16c';ctx.fill();ctx.shadowBlur=0}}for(let i=0;i<=this.rows+1;i++){const x=g.margin+i*g.spacing;ctx.beginPath();ctx.moveTo(x,g.bottom+8);ctx.lineTo(x,g.h);ctx.strokeStyle='rgba(210,174,102,.28)';ctx.stroke()}if(ball){ctx.beginPath();ctx.arc(ball.x,ball.y,9,0,Math.PI*2);ctx.shadowBlur=24;ctx.shadowColor='#fff0a4';ctx.fillStyle='#fff1b1';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#9b6226';ctx.stroke();ctx.shadowBlur=0}}
    async drop(){if(this.busy||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.busy=true;this.render();this.app.audio.play('spin');const choices=Array.from({length:this.rows},()=>cryptoFloat()>=.5),path=this.pathFor(choices),duration=this.app.profile.data.settings.reducedMotion?420:2400,start=performance.now();await new Promise(resolve=>{const animate=now=>{if(this.disposed)return resolve();const t=clamp((now-start)/duration,0,1),segments=path.points.length-1,progress=t*segments,index=Math.min(segments-1,Math.floor(progress)),local=progress-index,a=path.points[index],b=path.points[index+1],ease=local<.5?2*local*local:1-Math.pow(-2*local+2,2)/2;this.ball={x:a.x+(b.x-a.x)*ease,y:a.y+(b.y-a.y)*local};this.draw();if(t<1)requestAnimationFrame(animate);else resolve()};requestAnimationFrame(animate)});if(this.disposed)return;const mult=PLINKO_TABLES[this.risk][path.bin],payout=Math.floor(this.bet*mult);this.ball=null;this.draw();this.app.audio.play(mult>=3?'bigwin':mult>=1?'win':'lose');this.app.recordRound({game:'plinko',wager:this.bet,payout,label:`PLINKO ×${mult}`,detail:`BIN ${path.bin+1} · ${this.risk.toUpperCase()}`});$('#plinkoStatus',this.root).textContent=`POCKET ×${mult} · ${formatL(payout)}`;this.busy=false;this.render();this.setTimeout(()=>{if($('#plinkoStatus',this.root))$('#plinkoStatus',this.root).textContent='星球をDROPしてください'},1500)}
    render(){if(!$('#plinkoBet',this.root))return;$('#plinkoBet',this.root).textContent=formatL(this.bet);$('#plinkoDrop',this.root).disabled=this.busy;$$('[data-plinko-risk]',this.root).forEach(b=>{b.classList.toggle('active',b.dataset.plinkoRisk===this.risk);b.disabled=this.busy});$$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.busy});const values=PLINKO_TABLES[this.risk];$('#plinkoBins',this.root).innerHTML=values.map((v,i)=>`<span class="${v>=5?'extreme':v>=1?'positive':'risk'}" style="--bin-index:${i}">${v}×</span>`).join('');requestAnimationFrame(()=>this.draw())}
  }

  class HiLoGame extends GameBase {
    constructor(app,mount){super(app,mount);this.bet=1000;this.deck=makeDeck(4);this.current=null;this.pending=null;this.phase='idle';this.multiplier=1;this.correct=0;this.history=[];this.status='BETを選んでSTART';this.roundId=0;this.resetTimer=null;}
    get active(){return this.phase==='active'||this.phase==='revealing'}
    mount(){
      this.root.innerHTML=`<div class="game-stage hilo-stage asc-game-stage"><div class="table-status"><b id="hiloStatus">${this.status}</b><small>INPUT LOCKED REVEAL · BUILD THE STREAK</small></div><div class="hilo-table"><div class="hilo-history" id="hiloHistory"></div><div class="hilo-card-stage"><div class="hilo-phase-pill" id="hiloPhasePill"><i></i><b>READY</b></div><div id="hiloCurrent" class="hilo-current-placeholder card-row"><span>?</span></div><div id="hiloRevealCurtain" class="hilo-reveal-curtain" hidden><span>次のカードを公開中</span><i></i></div><div class="hilo-probabilities"><div><small>LOW CHANCE</small><b id="hiloLowChance">—</b></div><div><small>CURRENT MULTI</small><strong id="hiloMulti">×1.00</strong></div><div><small>HIGH CHANCE</small><b id="hiloHighChance">—</b></div></div></div><div class="hilo-actions"><button id="hiloLow" class="hilo-low" type="button" disabled>↓ LOW</button><button id="hiloCash" class="hilo-cash" type="button" disabled>CASH OUT</button><button id="hiloHigh" class="hilo-high" type="button" disabled>HIGH ↑</button></div></div><div class="bet-dock asc-bet-dock">${this.chipSelector(this.bet)}<div class="bet-readout"><small>BASE BET</small><strong id="hiloBet">${formatL(this.bet)}</strong></div><button id="hiloStart" class="table-button primary" type="button">START</button></div></div>`;
      this.bindChips(this.root,v=>{if(this.phase!=='idle')return;this.bet=v;this.render()});
      $('#hiloStart',this.root).addEventListener('click',()=>this.start());$('#hiloLow',this.root).addEventListener('click',()=>this.guess('low'));$('#hiloHigh',this.root).addEventListener('click',()=>this.guess('high'));$('#hiloCash',this.root).addEventListener('click',()=>this.cash());this.render();
    }
    clearReset(){if(this.resetTimer){clearTimeout(this.resetTimer);this.resetTimer=null}}
    draw(){if(this.deck.length<20)this.deck=makeDeck(4);return this.deck.pop()}
    rank(card){return RANKS_CARDS.indexOf(card.rank)+1}
    start(){if(this.phase!=='idle'||this.busy||!this.canAfford(this.bet)||!this.app.profile.spend(this.bet))return;this.clearReset();this.roundId++;this.phase='active';this.current=this.draw();this.pending=null;this.multiplier=1;this.correct=0;this.history=[];this.status='次のカードを予想';this.app.audio.play('card');this.render()}
    async guess(direction){
      if(this.phase!=='active'||this.busy)return;
      const currentRank=this.rank(this.current),favourable=direction==='high'?13-currentRank:currentRank-1;if(favourable<=0)return;
      // Lock immediately, before any draw, sound, DOM update or await. Rapid taps cannot enter twice.
      this.busy=true;this.phase='revealing';const token=this.roundId,probability=favourable/13,next=this.draw();this.pending=next;this.status=`${direction==='high'?'HIGH':'LOW'}を選択 · 公開中…`;this.render();this.app.audio.play('card');
      await wait(this.app.profile.data.settings.reducedMotion?45:330);if(this.disposed||token!==this.roundId)return;
      const nextRank=this.rank(next),correct=direction==='high'?nextRank>currentRank:nextRank<currentRank;
      this.history.unshift({card:this.current,direction,result:next,correct});this.current=next;this.pending=null;
      if(!correct){this.status=nextRank===currentRank?'同ランク — STREAK LOST':'STREAK LOST';this.app.audio.play('lose');this.busy=false;this.finish(0,'HI-LO STREAK LOST');return}
      this.correct++;this.multiplier=Math.min(250,this.multiplier*Math.max(1.05,.94/probability));this.status=`CORRECT ${this.correct} · ×${this.multiplier.toFixed(2)}`;this.app.audio.play('win');this.busy=false;this.phase='active';
      if(this.correct>=12)this.cash();else this.render();
    }
    cash(){if(this.phase!=='active'||this.busy||!this.correct)return;const payout=Math.floor(this.bet*this.multiplier);this.finish(payout,`${this.correct} CARD STREAK`)}
    finish(payout,label){
      const token=this.roundId;this.phase='result';this.busy=false;this.app.recordRound({game:'hilo',wager:this.bet,payout,label,detail:`${this.correct} CORRECT · ×${this.multiplier.toFixed(2)}`});this.render();this.clearReset();
      this.resetTimer=this.setTimeout(()=>{if(token!==this.roundId)return;this.current=null;this.pending=null;this.multiplier=1;this.correct=0;this.history=[];this.status='BETを選んでSTART';this.phase='idle';this.resetTimer=null;this.render()},this.app.profile.data.settings.reducedMotion?650:1900);
    }
    render(){
      if(!$('#hiloStatus',this.root))return;$('#hiloStatus',this.root).textContent=this.status;$('#hiloBet',this.root).textContent=formatL(this.bet);$('#hiloMulti',this.root).textContent=`×${this.multiplier.toFixed(2)}`;
      const cardMount=$('#hiloCurrent',this.root);if(this.current){cardMount.querySelector(':scope > span')?.remove();syncCardRow(cardMount,[this.current])}else{cardMount.innerHTML='<span>?</span>'}
      const rank=this.current?this.rank(this.current):0;$('#hiloLowChance',this.root).textContent=this.current?`${Math.round((rank-1)/13*100)}%`:'—';$('#hiloHighChance',this.root).textContent=this.current?`${Math.round((13-rank)/13*100)}%`:'—';
      $('#hiloHistory',this.root).innerHTML=this.history.slice(0,7).map(h=>`<div class="${h.correct?'correct':'wrong'}"><span>${h.card.rank}${h.card.suit}</span><i>${h.direction==='high'?'↑':'↓'}</i><b>${h.result.rank}${h.result.suit}</b></div>`).join('');
      const revealing=this.phase==='revealing';$('#hiloRevealCurtain',this.root).hidden=!revealing;const pill=$('#hiloPhasePill',this.root);pill.className=`hilo-phase-pill ${this.phase}`;pill.querySelector('b').textContent=this.phase==='idle'?'READY':revealing?'REVEAL LOCK':this.phase==='result'?'ROUND RESULT':'STREAK LIVE';
      const start=$('#hiloStart',this.root);start.disabled=this.phase!=='idle'||this.busy;start.textContent=this.phase==='idle'?'START':this.phase==='result'?'RESULT':'IN PLAY';
      $('#hiloCash',this.root).disabled=this.phase!=='active'||this.busy||!this.correct;$('#hiloLow',this.root).disabled=this.phase!=='active'||this.busy||rank<=1;$('#hiloHigh',this.root).disabled=this.phase!=='active'||this.busy||rank>=13;
      $$('[data-chip]',this.root).forEach(b=>{b.classList.toggle('active',Number(b.dataset.chip)===this.bet);b.disabled=this.phase!=='idle'||this.busy});
    }
  }


  // ---------- Integration patches ----------
  const originalProfileAddXp = ProfileStore.prototype.addXp;
  ProfileStore.prototype.addXp = function(amount) {
    const oldLevel = this.data.level;
    const boost = this.app.ascension ? 1 + this.app.ascension.effect('xp') : 1;
    originalProfileAddXp.call(this, Math.floor(amount * boost));
    if (this.app.ascension && this.data.level > oldLevel) this.app.ascension.awardLevelPoints(oldLevel, this.data.level);
  };

  const originalProfileReset = ProfileStore.prototype.reset;
  ProfileStore.prototype.reset = function(name) {
    originalProfileReset.call(this,name);
    if (this.app.ascension) {
      this.data.ascension = defaultAscension();
      this.app.ascension.ensureData();
      this.app.ascension.ensureStarterCollection();
      this.app.ascension.ensureWeekly();
      this.app.ascension.applyCosmetics();
      this.app.ascension.updateAll();
    }
  };

  const originalRecordRound = CasinoApp.prototype.recordRound;
  CasinoApp.prototype.recordRound = function(payload) {
    const net = originalRecordRound.call(this,payload);
    this.ascension?.onRound({...payload,net});
    return net;
  };

  const originalAddJackpotCharge = CasinoApp.prototype.addJackpotCharge;
  CasinoApp.prototype.addJackpotCharge = function(wager,win,event) {
    originalAddJackpotCharge.call(this,wager,win,event);
    if (!this.ascension) return;
    const extra = Math.floor((1 + Math.floor(wager/500) + (win?2:0)) * this.ascension.effect('vault'));
    if (extra > 0) {
      const j=this.profile.data.jackpot,wasReady=j.ready;j.charge=clamp(j.charge+extra,0,100);j.ready=j.charge>=100;
      if(j.ready&&!wasReady)this.toast('能力星座が金庫と共鳴','ECLIPSE VAULTが解放されました。','◇');
      this.profile.save();
    }
  };

  const originalClaimDaily = CasinoApp.prototype.claimDaily;
  CasinoApp.prototype.claimDaily = function() {
    const before=this.profile.data.balance,already=this.profile.data.lastDaily===dateKey();
    originalClaimDaily.call(this);
    if(!already&&this.ascension){const base=this.profile.data.balance-before,bonus=Math.floor(base*this.ascension.effect('daily'));if(bonus>0){const paid=this.profile.credit(bonus,'daily');this.toast('深夜の恩寵',paid?`追加ギフト +${formatL(paid)}${paid<bonus?' · 残額NOTES':''}`:'追加分はCROWN NOTESとして保管されました。','🎁')}}
  };

  const originalUpdateHud = CasinoApp.prototype.updateHud;
  CasinoApp.prototype.updateHud = function() {
    originalUpdateHud.call(this);
    this.ascension?.updateAll();
  };

  const originalShowLobby = CasinoApp.prototype.showLobby;
  CasinoApp.prototype.showLobby = function() {
    originalShowLobby.call(this);
    this.ascension?.updateAll();
  };

  const originalAvatarGlyph = CasinoApp.prototype.avatarGlyph;
  CasinoApp.prototype.avatarGlyph = function() {
    const id=this.profile.data.ascension?.collection?.equipped?.avatar,item=COLLECTION.find(x=>x.id===id);
    return item?.glyph || originalAvatarGlyph.call(this);
  };

  const originalRenderProfile = CasinoApp.prototype.renderProfile;
  CasinoApp.prototype.renderProfile = function(tab='stats') {
    if (tab === 'mastery' && this.ascension) {
      const p=this.profile.data,r=this.profile.rank();$('#profileAvatar').textContent=this.avatarGlyph();$('#profileName').textContent=p.name;$('#profileRank').textContent=`${r.name} · Lv.${p.level}`;$('#profileBalance').textContent=fmt.format(p.balance);this.ascension.renderProfileMastery($('#profileTabContent'));return;
    }
    if (tab === 'duel' && this.ascension) {
      const p=this.profile.data,r=this.profile.rank();$('#profileAvatar').textContent=this.avatarGlyph();$('#profileName').textContent=p.name;$('#profileRank').textContent=`${r.name} · Lv.${p.level}`;$('#profileBalance').textContent=fmt.format(p.balance);this.ascension.renderProfileDuel($('#profileTabContent'));return;
    }
    originalRenderProfile.call(this,tab);
  };

  CasinoApp.prototype.openGame = function(id) {
    if(!GAME_META[id])return;
    this.closeModal();this.gameInstance?.unmount?.();this.currentGame=id;this.profile.data.lastGame=id;this.profile.save();const m=this.gameMeta(id);$('#gameEyebrow').textContent=m.eyebrow;$('#gameTitle').textContent=m.title;$('#gameMount').innerHTML='';this.showScreen('gameScreen');const activeGameScreen=$('#gameScreen');if(activeGameScreen)activeGameScreen.scrollTop=0;this.updateMobileNav('');
    const classes={blackjack:BlackjackGame,roulette:RouletteGame,slots:SlotsGame,baccarat:BaccaratGame,poker:PokerGame,sicbo:SicBoGame,keno:KenoGame,craps:CrapsGame,dragon:DragonTigerGame,wheel:FortuneWheelGame,mines:MinesGame,plinko:PlinkoGame,hilo:HiLoGame};
    const GameClass=classes[id];if(!GameClass)return;this.gameInstance=new GameClass(this,$('#gameMount'));this.gameInstance.mount();this.room.presence();this.audio.play('chime');this.updateNightEventUi();this.ascension?.updateAll();
  };

  CasinoApp.prototype.updateTicker = function() {
    const event=this.activeNightEvent(),festival=this.ascension?.festival();
    const local=[`<span><b>ETERNAL CROWN</b> 18ゲーム・120種蒐集・周回遠征</span>`,`<span><b>CROWN DUEL</b> 友達とリアルタイムPVP</span>`,`<span><b>CO-OP RAID</b> ルーム全員で夜宮ボスを討伐</span>`,festival?`<span><b>${festival.name}</b> ${festival.desc}</span>`:'',event?`<span><b>${event.name}</b> ${event.desc}</span>`:`<span><b>PLAY MONEY</b> 購入・換金・譲渡はできません</span>`].filter(Boolean);
    const room=(this.room?.feed||[]).slice(0,5).map(x=>`<span>${x.html||escapeHtml(x.text||'')}</span>`);$('#liveTicker').innerHTML=[...room,...local,...room,...local].join('');
  };

  const originalRoomHandle = RoomClient.prototype.handle;
  RoomClient.prototype.handle = function(msg) {
    originalRoomHandle.call(this,msg);
    if (msg.raid) this.app.ascension?.handleRaidState(msg.raid);
    if (msg.type === 'raid' || msg.type === 'raid_defeated') this.app.ascension?.handleRaidState(msg.raid);
    if (msg.type === 'duel' && this.app.pvp?.match?.id === msg.matchId) this.app.pvp.poll();
  };

  const originalRoomRender = RoomClient.prototype.render;
  RoomClient.prototype.render = function() {
    originalRoomRender.call(this);
    this.app.ascension?.updateAll();
  };

  // Install after the base application has booted.
  const casino = window.__LUX_NOCTIS__;
  if (casino) {
    casino.ascension = new AscensionSystem(casino);
    casino.pvp = new PvpClient(casino);
    casino.ascension.updateAll();
    casino.updateHud();
    casino.updateTicker();
    window.__LUX_ASCENSION__ = casino.ascension;
  }
})();
