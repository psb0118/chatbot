/**
 * FLOVER BOT — 폰 전용 (메신저봇 R / API2)
 *
 * 서버도, 데이터베이스도, 인터넷도 필요 없습니다.
 * 폰에 메신저봇 R만 설치되어 있으면 이 파일 하나로 동작합니다.
 * 기록은 앱의 로컬 저장소(Database)에 JSON으로 저장됩니다.
 *
 * ── 붙이는 순서 ────────────────────────────────────────────────
 * 1. 메신저봇 R → 봇 추가
 * 2. 봇 옵션: "레거시 API 사용" 체크 해제, "통합된 매개변수 사용" 체크 해제
 *    (이 스크립트는 API2 방식이라 bot.addListener 로 메시지를 받습니다)
 * 3. 스크립트 전체를 붙여넣기 → 봇 스위치 ON → 방에서 !사용법
 *
 * ── 주의 ──────────────────────────────────────────────────────
 * · 기록은 폰 안에만 있습니다. 앱을 지우거나 폰을 초기화하면 사라집니다.
 * · 닉네임을 바꾸면 앱이 msg.author.hash 를 주는 경우에만 같은 사람으로
 *   이어집니다. 그래서 닉네임을 바꾸기 전에 !정보 로 회원번호를 적어 두고,
 *   신원이 끊기면 !연동 <회원번호> 로 다시 붙이면 됩니다.
 */

// ── 설정 ───────────────────────────────────────────────────────
var CONFIG = {
  DB_NAME: 'flover_data.json',
  NAME_MAX: 20,
  SINCE_MIN: '2017-01-01',

  // 레벨 = [√(EXP / 100)] + 1
  EXP_PER_MESSAGE: 2,
  MESSAGE_COOLDOWN_MS: 5000,
  MESSAGE_EXP_DAILY_CAP: 200
};

// ── 데이터 (여기만 고치면 됩니다) ──────────────────────────────
var MEMBERS = [
  '이새롬', '송하영', '장규리', '박지원', '노지선',
  '이서연', '이채영', '이나경', '백지헌'
];

/**
 * !추천곡 은 여기서 한 곡을 뽑습니다.
 * 2017 프리데뷔 〈유리구두〉 ~ 2026 정규 2집 《Glow ME》까지 수록곡·일본 데뷔·OST 전부.
 * 반주(instrumental) 트랙과, 발표 예정이었다 취소된 2020 일본 프리데뷔 싱글은 뺐습니다.
 */
var SONGS = [
  // 프리데뷔 (2017)
  { title: '유리구두 (Glass Shoes)', album: '유리구두 · 2017' },

  // 1st Mini 《To. Heart》 (2018-01-24)
  { title: '나에게로 오는 길 (Intro.)', album: 'To. Heart · 2018' },
  { title: 'To Heart', album: 'To. Heart · 2018' },
  { title: '환상속의 그대 (Miracle)', album: 'To. Heart · 2018' },
  { title: '피노키오 (Pinocchio)', album: 'To. Heart · 2018' },
  { title: 'Be With You', album: 'To. Heart · 2018' },
  { title: '유리구두 (MAMA Ver.)', album: 'To. Heart · 2018' },

  // 2nd Mini 《To. Day》 (2018-06-05)
  { title: '다가가고 싶어 (Close To You)', album: 'To. Day · 2018' },
  { title: '너를 따라, 너에게 (Think of You)', album: 'To. Day · 2018' },
  { title: '두근두근 (DKDK)', album: 'To. Day · 2018' },
  { title: '22세기 소녀 (22Century Girl)', album: 'To. Day · 2018' },
  { title: 'CLOVER', album: 'To. Day · 2018' },
  { title: 'FIRST LOVE', album: 'To. Day · 2018' },

  // Special Single 《From.9》 (2018-10-10)
  { title: 'LOVE BOMB', album: 'From.9 · 2018' },
  { title: 'DANCING QUEEN', album: 'From.9 · 2018' },
  { title: '물들어 (Coloring)', album: 'From.9 · 2018' },
  { title: '두근두근 (From.9 Ver.)', album: 'From.9 · 2018' },
  { title: '22세기 소녀 (From.9 Ver.)', album: 'From.9 · 2018' },

  // Single 《FUN FACTORY》 (2019-06-04)
  { title: 'FUN!', album: 'FUN FACTORY · 2019' },
  { title: 'LOVE RUMPUMPUM', album: 'FUN FACTORY · 2019' },
  { title: 'FLY HIGH', album: 'FUN FACTORY · 2019' },

  // 3rd Mini 《My Little Society》 (2020-09-16)
  { title: 'Feel Good (SECRET CODE)', album: 'My Little Society · 2020' },
  { title: 'Weather', album: 'My Little Society · 2020' },
  { title: '별의 밤 (Starry Night)', album: 'My Little Society · 2020' },
  { title: 'Somebody to love', album: 'My Little Society · 2020' },
  { title: '물고기 (Mulgogi)', album: 'My Little Society · 2020' },

  // Single 《9 WAY TICKET》 (2021-05-17)
  { title: 'Airplane Mode', album: '9 WAY TICKET · 2021' },
  { title: 'WE GO', album: '9 WAY TICKET · 2021' },
  { title: 'Promise', album: '9 WAY TICKET · 2021' },

  // Special Single 《Talk & Talk》 (2021-09-01)
  { title: 'Talk & Talk', album: 'Talk & Talk · 2021' },

  // 4th Mini 《Midnight Guest》 (2022-01-17)
  { title: 'Escape Room', album: 'Midnight Guest · 2022' },
  { title: 'DM', album: 'Midnight Guest · 2022' },
  { title: 'Love is Around', album: 'Midnight Guest · 2022' },
  { title: 'Hush Hush', album: 'Midnight Guest · 2022' },
  { title: '0g', album: 'Midnight Guest · 2022' },

  // 5th Mini 《from our Memento Box》 (2022-06-27)
  { title: 'Up And', album: 'from our Memento Box · 2022' },
  { title: 'Stay This Way', album: 'from our Memento Box · 2022' },
  { title: 'Blind Letter', album: 'from our Memento Box · 2022' },
  { title: 'Cheese', album: 'from our Memento Box · 2022' },
  { title: 'Rewind', album: 'from our Memento Box · 2022' },

  // 1st Album 《Unlock My World》 (2023-06-05)
  { title: 'Attitude', album: 'Unlock My World · 2023' },
  { title: '#menow', album: 'Unlock My World · 2023' },
  { title: 'Wishlist', album: 'Unlock My World · 2023' },
  { title: 'In the Mirror', album: 'Unlock My World · 2023' },
  { title: "Don't Care", album: 'Unlock My World · 2023' },
  { title: 'Prom Night', album: 'Unlock My World · 2023' },
  { title: 'Bring It On', album: 'Unlock My World · 2023' },
  { title: 'What I Want', album: 'Unlock My World · 2023' },
  { title: 'My Night Routine', album: 'Unlock My World · 2023' },
  { title: '눈맞춤 (Eye Contact)', album: 'Unlock My World · 2023' },

  // Single 《Supersonic》 (2024-08-12)
  { title: 'Supersonic', album: 'Supersonic · 2024' },
  { title: 'Beat the Heat', album: 'Supersonic · 2024' },
  { title: 'Take A Chance', album: 'Supersonic · 2024' },

  // Special Single 《from》 (2024-12-23)
  { title: 'from', album: 'from · 2024' },

  // 6th Mini 《From Our 20's》 (2025-06-25)
  { title: 'LIKE YOU BETTER', album: "From Our 20's · 2025" },
  { title: 'REBELUTIONAL', album: "From Our 20's · 2025" },
  { title: 'Love=Disaster', album: "From Our 20's · 2025" },
  { title: 'Strawberry Mimosa', album: "From Our 20's · 2025" },
  { title: 'Twisted Love', album: "From Our 20's · 2025" },
  { title: 'Merry Go Round', album: "From Our 20's · 2025" },

  // Special Digital Single (2025-12-02)
  { title: '하얀 그리움 (White Memories)', album: '하얀 그리움 · 2025' },

  // Japan 1st EP 《LIKE YOU BETTER (Japanese ver.)》 (2026-04-01)
  { title: 'LIKE YOU BETTER (Japanese ver.)', album: 'Japan 1st EP · 2026' },
  { title: 'Love=Disaster (Japanese ver.)', album: 'Japan 1st EP · 2026' },
  { title: 'Sky Runner', album: 'Japan 1st EP · 2026' },

  // 2nd Album 《Glow ME》 (2026-07-21)
  { title: 'ETERNAL', album: 'Glow ME · 2026' },
  { title: 'Vitamin ME', album: 'Glow ME · 2026' },
  { title: 'Pocket Treat', album: 'Glow ME · 2026' },
  { title: 'Blue Heart', album: 'Glow ME · 2026' },
  { title: 'Screen Time', album: 'Glow ME · 2026' },
  { title: 'Teacher', album: 'Glow ME · 2026' },
  { title: 'Cold Blood', album: 'Glow ME · 2026' },
  { title: 'Why do I cry?', album: 'Glow ME · 2026' },
  { title: 'DAY1', album: 'Glow ME · 2026' },
  { title: 'Wonderland', album: 'Glow ME · 2026' },

  // 앨범 밖 싱글·리메이크·OST
  { title: '별 (Star)', album: 'Cyworld BGM 2021 · 2021' },
  { title: 'Stay Alive', album: '크레이지 러브 OST · 2022' },
  { title: '달빛바다 (Sea of Moonlight)', album: '여름방학 프로젝트 · 2022' },
  { title: 'Love Me Back', album: 'Operation: True Love OST · 2023' },
  { title: 'Touchdown', album: 'The Winning Try OST · 2025' },
  { title: 'Swipe It Out', album: '월간남친 OST · 2026' }
];

/**
 * 사용법의 "추가 명령어" 칸에 그대로 나옵니다. 원하는 만큼 직접 적으면 됩니다.
 * 형식: '· !명령 — 설명'
 */
var EXTRA_COMMANDS = [
  '· !레벨 회원번호 — 그 회원번호의 레벨 보기'
];

// ── 공통 유틸 ──────────────────────────────────────────────────
function nowMs() {
  return new Date().getTime();
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** 한국 시간 기준 YYYY-MM-DD */
function kstDay(ms) {
  var d = new Date((ms || nowMs()) + 9 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/** 레벨 = [√(EXP / 100)] + 1 */
function levelForExp(exp) {
  return Math.floor(Math.sqrt(Math.max(0, exp) / 100)) + 1;
}

/** 그 레벨에 처음 도달하는 최소 EXP */
function expForLevel(level) {
  var step = Math.max(1, level) - 1;
  return 100 * step * step;
}

/**
 * 사용자 식별자.
 * 앱이 msg.author.hash 를 주면 그걸 쓰고(0.7.36a+), 없으면 방+닉네임으로
 * 대신합니다. 후자는 닉네임을 바꾸면 새 사람이 되므로 !연동 으로 복구합니다.
 */
function identityOf(msg) {
  var hash = msg.author ? msg.author.hash : null;
  if (hash) return 'h:' + hash;
  return 'n:' + msg.room + ':' + ((msg.author && msg.author.name) || '알수없음');
}

function displayNameOf(msg) {
  var name = (msg.author && msg.author.name) || '알수없음';
  return String(name).replace(/^\s+|\s+$/g, '');
}

/** 멤버 이름 맞추기: 정확히 일치하거나, 한 명으로만 좁혀지는 앞/뒷부분 */
function matchMember(text) {
  var raw = String(text || '').replace(/\s/g, '').toLowerCase();
  if (!raw) return null;

  var exact = null;
  var partial = [];
  for (var i = 0; i < MEMBERS.length; i += 1) {
    var flat = MEMBERS[i].replace(/\s/g, '').toLowerCase();
    if (flat === raw) exact = MEMBERS[i];
    else if (flat.indexOf(raw) >= 0) partial.push(MEMBERS[i]);
  }

  if (exact) return exact;
  if (partial.length === 1) return partial[0];
  return null;
}

/** 2021-05-04, 2021.5.4, 2021/05/04, 20210504 모두 허용 */
function parseDateInput(text) {
  var raw = String(text || '').replace(/\s/g, '');
  var m = raw.match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/);
  if (!m) return null;

  var year = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  var probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() + 1 !== month ||
      probe.getUTCDate() !== day) {
    return null;
  }

  return year + '-' + pad2(month) + '-' + pad2(day);
}

/** 6자리 회원번호. 이미 쓰는 번호는 건너뜁니다. */
function makeMemberId(db) {
  for (var attempt = 0; attempt < 300; attempt += 1) {
    var id = String(100000 + Math.floor(Math.random() * 900000));
    if (!db.users[id]) return id;
  }
  var seq = 100000;
  while (db.users[String(seq)]) seq += 1;
  return String(seq);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ── 저장소 ─────────────────────────────────────────────────────
function emptyDb() {
  return { version: 4, users: {}, links: {} };
}

function loadDb() {
  var raw = null;
  try {
    if (Database.exists(CONFIG.DB_NAME)) {
      raw = Database.readObject(CONFIG.DB_NAME);
    }
  } catch (e) {
    Log.e('DB 읽기 실패: ' + e, false);
    raw = null;
  }

  // readObject 는 파일이 깨졌거나 비어 있으면 null 을 돌려줄 수 있습니다.
  if (!raw || typeof raw !== 'object') return emptyDb();

  var db = emptyDb();
  db.version = raw.version || 4;
  db.users = raw.users && typeof raw.users === 'object' ? raw.users : {};
  db.links = raw.links && typeof raw.links === 'object' ? raw.links : {};
  return db;
}

function saveDb(db) {
  try {
    Database.writeObject(CONFIG.DB_NAME, db);
    return true;
  } catch (e) {
    Log.e('DB 저장 실패: ' + e, false);
    return false;
  }
}

// ── 답장 ───────────────────────────────────────────────────────
function say(msg, text) {
  try {
    msg.reply(text);
  } catch (e) {
    Log.e('답장 실패: ' + e, false);
  }
}

// ── 사용자 찾기 ────────────────────────────────────────────────
/** 지금 이 사람에게 연결된 회원. 없으면 null */
function currentUser(db, msg) {
  var id = db.links[identityOf(msg)];
  if (!id || !db.users[id]) return null;
  return db.users[id];
}

function needUser(db, msg) {
  var user = currentUser(db, msg);
  if (!user) {
    say(msg, '아직 가입하지 않았어요. "!가입" 을 먼저 보내 주세요.');
    return null;
  }
  return user;
}

function addExp(user, amount) {
  user.totalExp = Math.max(0, (user.totalExp || 0) + amount);
}

/** 채팅으로 EXP를 줍니다. 도배를 막으려고 쿨다운과 하루 상한을 둡니다. */
function recordActivity(db, msg) {
  var user = currentUser(db, msg);
  if (!user) return;

  var now = nowMs();
  var day = kstDay(now);

  if (user.expDay !== day) {
    user.expDay = day;
    user.expDayAmount = 0;
  }
  if (now - (user.lastMessageAt || 0) < CONFIG.MESSAGE_COOLDOWN_MS) return;
  if ((user.expDayAmount || 0) >= CONFIG.MESSAGE_EXP_DAILY_CAP) return;

  user.lastMessageAt = now;
  user.expDayAmount = (user.expDayAmount || 0) + CONFIG.EXP_PER_MESSAGE;
  addExp(user, CONFIG.EXP_PER_MESSAGE);
}

// ── 사용법 ─────────────────────────────────────────────────────
function usageText() {
  var lines = [
    '[ 플로버 봇 사용법 ]',
    '👤 !정보 — 내 정보 보기',
    '🔗 !연동 회원번호 — 회원번호로 기록 다시 연결',
    '💖 !최애 — 내 최애 멤버',
    '🗓️ !입덕 — 내 입덕일',
    '🎵 !추천곡 — 오늘의 추천곡 (전곡 ' + SONGS.length + '곡 중 랜덤)',
    '😍 !최애등록 멤버 — 최애 멤버 등록',
    '🗓 !입덕등록 날짜 — 입덕일 등록 (예: !입덕등록 2021-05-04)',
    '🆔 !이름변경 이름 — 봇에서 부를 이름 변경',
    '🎉 !가입 — 회원가입 (회원번호 발급)'
  ];

  lines.push('');
  lines.push('[ 추가 명령어 ]');
  if (EXTRA_COMMANDS.length === 0) {
    lines.push('· 준비 중이에요');
  } else {
    for (var i = 0; i < EXTRA_COMMANDS.length; i += 1) lines.push(EXTRA_COMMANDS[i]);
  }

  return lines.join('\n');
}

// ── 가입 / 연동 ────────────────────────────────────────────────
function handleSignUp(db, msg) {
  var identity = identityOf(msg);
  var linked = db.links[identity];
  if (linked && db.users[linked]) {
    say(msg, '이미 가입한 회원이에요 🍀\n👤 이름 : ' + db.users[linked].name +
      '\n🆔 회원번호 : ' + linked + '\n"!정보" 로 확인해 보세요.');
    return;
  }

  var name = displayNameOf(msg);
  if (!name || name === '알수없음') {
    say(msg, '닉네임을 읽을 수 없어요. 프로필 이름을 확인한 뒤 다시 시도해 주세요.');
    return;
  }
  if (name.length > CONFIG.NAME_MAX) name = name.slice(0, CONFIG.NAME_MAX);

  var id = makeMemberId(db);
  db.users[id] = {
    name: name,
    fav: '',
    since: '',
    totalExp: 0,
    expDay: kstDay(),
    expDayAmount: 0,
    lastMessageAt: 0
  };
  db.links[identity] = id;
  saveDb(db);

  say(msg, '🎉 회원가입 완료 🍀\n👤 이름 : ' + name + '\n🆔 회원번호 : ' + id);
}

function handleLink(db, msg, args) {
  var code = String(args[0] || '').replace(/[^0-9]/g, '');
  if (!code) {
    say(msg, '사용법: !연동 회원번호 (예: !연동 760728)');
    return;
  }

  var user = db.users[code];
  if (!user) {
    say(msg, '회원번호 ' + code + ' 을(를) 찾을 수 없어요. "!정보" 로 번호를 다시 확인해 주세요.');
    return;
  }

  var identity = identityOf(msg);
  var linked = db.links[identity];
  if (linked && linked !== code && db.users[linked]) {
    say(msg, '이미 회원번호 ' + linked + ' (' + db.users[linked].name +
      ') 로 연결되어 있어요.\n다른 번호로 옮기려면 운영진에게 알려 주세요.');
    return;
  }
  if (linked === code && db.users[code]) {
    say(msg, '이미 연결되어 있어요 🍀\n👤 이름 : ' + user.name + '\n🆔 회원번호 : ' + code);
    return;
  }

  db.links[identity] = code;
  saveDb(db);
  say(msg, '🔗 연동 완료 🍀\n👤 이름 : ' + user.name + '\n🆔 회원번호 : ' + code);
}

// ── 정보 / 최애 / 입덕 / 이름 ──────────────────────────────────
function handleInfo(db, msg) {
  var user = needUser(db, msg);
  if (!user) return;

  var lines = [
    '👤 내 정보',
    '👤 이름 : ' + user.name,
    '🆔 회원번호 : ' + db.links[identityOf(msg)],
    '💖 최애 : ' + (user.fav || '아직 없음 (!최애등록 멤버)'),
    '🗓️ 입덕 : ' + (user.since || '아직 없음 (!입덕등록 날짜)'),
    '📈 레벨 : Lv.' + levelForExp(user.totalExp) + ' · ' + Math.max(0, user.totalExp || 0) + ' EXP'
  ];
  say(msg, lines.join('\n'));
}

function handleFav(db, msg) {
  var user = needUser(db, msg);
  if (!user) return;
  say(msg, user.fav
    ? '💖 최애 : ' + user.fav
    : '💖 아직 최애를 등록하지 않았어요. "!최애등록 멤버" 로 등록해 주세요.\n멤버: ' + MEMBERS.join(', '));
}

function handleSetFav(db, msg, args) {
  var user = needUser(db, msg);
  if (!user) return;

  var text = args.join(' ');
  if (!text) {
    say(msg, '사용법: !최애등록 멤버\n멤버: ' + MEMBERS.join(', '));
    return;
  }

  var member = matchMember(text);
  if (!member) {
    say(msg, '"' + text + '" 에 해당하는 멤버를 찾지 못했어요.\n멤버: ' + MEMBERS.join(', '));
    return;
  }

  user.fav = member;
  saveDb(db);
  say(msg, '😍 최애를 ' + member + ' 님으로 등록했어요!');
}

function handleSince(db, msg) {
  var user = needUser(db, msg);
  if (!user) return;
  say(msg, user.since
    ? '🗓️ 입덕일 : ' + user.since
    : '🗓️ 아직 입덕일을 등록하지 않았어요. "!입덕등록 날짜" 로 등록해 주세요.');
}

function handleSetSince(db, msg, args) {
  var user = needUser(db, msg);
  if (!user) return;

  var text = args.join(' ');
  if (!text) {
    say(msg, '사용법: !입덕등록 날짜 (예: !입덕등록 2021-05-04)');
    return;
  }

  var day = parseDateInput(text);
  if (!day) {
    say(msg, '날짜를 알아보지 못했어요. 예: !입덕등록 2021-05-04');
    return;
  }
  if (day > kstDay()) {
    say(msg, '아직 오지 않은 날짜예요. 오늘(' + kstDay() + ') 이전 날짜로 적어 주세요.');
    return;
  }
  if (day < CONFIG.SINCE_MIN) {
    say(msg, '입덕일이 너무 이른 것 같아요. ' + CONFIG.SINCE_MIN + ' 이후로 적어 주세요.');
    return;
  }

  user.since = day;
  saveDb(db);
  say(msg, '🗓️ 입덕일을 ' + day + ' 로 저장했어요!');
}

function handleRename(db, msg, args) {
  var user = needUser(db, msg);
  if (!user) return;

  var name = args.join(' ').replace(/^\s+|\s+$/g, '');
  if (!name) {
    say(msg, '사용법: !이름변경 이름');
    return;
  }
  if (name.length > CONFIG.NAME_MAX) {
    say(msg, '이름은 ' + CONFIG.NAME_MAX + '자 이내로 정해 주세요.');
    return;
  }

  var before = user.name;
  user.name = name;
  saveDb(db);
  say(msg, '🆔 이름을 ' + before + ' → ' + name + ' 으로 바꿨어요.');
}

function handleRecommend(db, msg) {
  if (SONGS.length === 0) {
    say(msg, '추천곡 목록이 비어 있어요. 스크립트의 SONGS 를 채워 주세요.');
    return;
  }
  var song = pick(SONGS);
  say(msg, '🎵 오늘의 추천곡\n' + song.title + ' — fromis_9\n💿 ' + song.album + '\n한 번 들어 보세요 🍀');
}

// ── 레벨 ───────────────────────────────────────────────────────
function levelLines(id, user) {
  var exp = Math.max(0, user.totalExp || 0);
  var level = levelForExp(exp);
  var next = expForLevel(level + 1);

  return [
    '🎚️ 레벨 조회 · ' + id,
    '👤 이름 : ' + user.name,
    '📈 Lv.' + level + ' · ' + exp + ' EXP',
    '⬆️ 다음 레벨까지 ' + Math.max(0, next - exp) + ' EXP'
  ];
}

function handleLevel(db, msg, args) {
  var given = String(args[0] || '');
  var code = given.replace(/[^0-9]/g, '');

  if (given && !code) {
    say(msg, '회원번호는 숫자 6자리예요. (예: !레벨 792642)');
    return;
  }

  if (!code) {
    var mine = currentUser(db, msg);
    if (!mine) {
      say(msg, '사용법: !레벨 회원번호 (예: !레벨 792642)');
      return;
    }
    say(msg, levelLines(db.links[identityOf(msg)], mine).join('\n'));
    return;
  }

  var user = db.users[code];
  if (!user) {
    say(msg, '회원번호 ' + code + ' 을(를) 찾을 수 없어요. "!정보" 로 번호를 다시 확인해 주세요.');
    return;
  }

  say(msg, levelLines(code, user).join('\n'));
}

// ── 명령 처리 ──────────────────────────────────────────────────
function handleMessage(msg) {
  if (!msg || typeof msg.content !== 'string') return;

  var text = msg.content.replace(/^\s+|\s+$/g, '');
  if (text.indexOf('!') !== 0 && text.indexOf('！') !== 0) return;

  var body = text.replace(/^[!！]\s*/, '');
  if (!body) return;

  var parts = body.split(/\s+/);
  var command = parts[0];
  var args = parts.slice(1);

  var db = loadDb();

  try {
    recordActivity(db, msg);

    switch (command) {
      case '가입':
      case '회원가입':
        handleSignUp(db, msg);
        return;

      case '연동':
        handleLink(db, msg, args);
        return;

      case '정보':
      case '내정보':
        handleInfo(db, msg);
        return;

      case '최애':
        handleFav(db, msg);
        return;

      case '최애등록':
        handleSetFav(db, msg, args);
        return;

      case '입덕':
        handleSince(db, msg);
        return;

      case '입덕등록':
        handleSetSince(db, msg, args);
        return;

      case '이름변경':
        handleRename(db, msg, args);
        return;

      case '추천곡':
        handleRecommend(db, msg);
        return;

      case '레벨':
        handleLevel(db, msg, args);
        return;

      case '사용법':
      case '도움말':
      case '명령어':
      case 'help':
        say(msg, usageText());
        return;

      default:
        say(msg, '알 수 없는 명령어예요: ' + command + '\n"!사용법" 을 확인해 주세요.');
        return;
    }
  } catch (e) {
    Log.e('명령 처리 실패(' + command + '): ' + e, false);
    say(msg, '처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  } finally {
    saveDb(db);
  }
}

// ── 등록 ───────────────────────────────────────────────────────
var bot = BotManager.getCurrentBot();
bot.addListener(Event.MESSAGE, handleMessage);
Log.i('FLOVER BOT 준비 완료 (폰 전용, 서버 불필요)');
