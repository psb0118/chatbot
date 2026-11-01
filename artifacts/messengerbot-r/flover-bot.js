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
 * 3. 아래 ADMIN_SETUP_CODE 를 본인만 아는 값으로 바꾸고 전체를 붙여넣기
 * 4. 봇 스위치 ON → 방에서 !도움말
 *
 * ── 주의 ──────────────────────────────────────────────────────
 * · 기록은 폰 안에만 있습니다. 앱을 지우거나 폰을 초기화하면 사라집니다.
 *   !백업 으로 파일을 만들어 두세요(같은 폰 안에 저장됨).
 * · 닉네임을 바꾸면 앱 버전에 따라 다른 사람으로 잡힐 수 있습니다.
 */

// ── 설정 ───────────────────────────────────────────────────────
var CONFIG = {
  // ↓↓↓ 반드시 바꾸세요. 이 값이 그대로면 !관리자등록 이 거부됩니다.
  ADMIN_SETUP_CODE: 'CHANGE_THIS_TO_YOUR_OWN_SECRET',

  DB_NAME: 'flover_data.json',
  BACKUP_PREFIX: 'flover_backup_',

  EXP_PER_LEVEL: 100,
  EXP_PER_MESSAGE: 2,
  MESSAGE_EXP_DAILY_CAP: 200,
  MESSAGE_COOLDOWN_MS: 5000,
  ATTENDANCE_EXP: 50,
  QUIZ_EXP: 30,

  QUIZ_TTL_MS: 10 * 60 * 1000,
  RANK_LIMIT: 5
};

// ── 데이터 (여기만 고치면 됩니다) ──────────────────────────────
var MEMBERS = [
  '이새롬', '송하영', '장규리', '박지원', '노지선',
  '이서연', '이채영', '이나경', '백지헌'
];

// 노래 퀴즈: hint 는 정답이 드러나지 않게 적어 주세요.
var SONGS = [
  { title: 'Glass Shoes', hint: '데뷔 전 리얼리티의 마지막 무대 곡' },
  { title: 'To Heart', hint: '정식 데뷔 앨범의 타이틀곡' },
  { title: 'LOVE BOMB', hint: '두 번째 미니앨범 타이틀곡' },
  { title: 'FUN!', hint: '여름에 어울리는 세 번째 미니앨범 타이틀곡' },
  { title: 'Feel Good (SECRET CODE)', hint: '첫 정규앨범 타이틀곡' },
  { title: 'WE GO', hint: '첫 정규앨범의 수록곡, 여름 시즌 송' }
];

// 일반 퀴즈: a 는 정답 비교용(공백·대소문자 무시), hint 는 힌트.
var QUIZZES = [
  { q: '이 그룹의 데뷔 연도는?', a: '2018', hint: '네 자리 숫자' },
  { q: '멤버는 모두 몇 명?', a: '9', hint: '한 자리 숫자' },
  { q: '공식 팬덤 이름은?', a: 'flover', hint: 'F로 시작' },
  { q: '데뷔 싱글 앨범 제목은?', a: 'glass shoes', hint: '영어 두 단어' }
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

function levelFor(totalExp) {
  return Math.floor(Math.max(0, totalExp) / CONFIG.EXP_PER_LEVEL) + 1;
}

function expInLevel(totalExp) {
  return Math.max(0, totalExp) % CONFIG.EXP_PER_LEVEL;
}

function tierFor(level) {
  if (level >= 50) return 'Moon';
  if (level >= 35) return 'Star';
  if (level >= 20) return 'Flover';
  if (level >= 10) return 'Blossom';
  if (level >= 5) return 'Bloom';
  return 'Sprout';
}

/** 정답 비교용 정규화: 소문자, 공백·문장부호 제거 */
function normalizeAnswer(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s.,!?~'"()\[\]{}·:;\-]/g, '');
}

/**
 * 비밀번호는 그대로 저장하지 않습니다. 다만 이건 로컬 파일을 눈으로 보기
 * 어렵게 만드는 수준이고, 암호학적으로 안전한 해시는 아닙니다.
 */
function hashPassword(password) {
  var text = 'flover:' + String(password);
  var hash = 5381;
  for (var i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(36);
}

/**
 * 사용자 식별자.
 * 앱이 msg.author.hash 를 주면 그걸 쓰고(0.7.36a+), 없으면 방+닉네임으로
 * 대신합니다. 후자는 닉네임을 바꾸면 새 사람이 됩니다.
 */
function identityOf(msg) {
  var hash = msg.author ? msg.author.hash : null;
  if (hash) return 'h:' + hash;
  return 'n:' + msg.room + ':' + (msg.author ? msg.author.name : '알수없음');
}

function displayNameOf(msg) {
  return (msg.author && msg.author.name) || '알수없음';
}

// ── 저장소 ─────────────────────────────────────────────────────
function emptyDb() {
  return { version: 2, users: {}, banned: {}, quizzes: {}, notice: '' };
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
  db.version = raw.version || 2;
  db.users = raw.users && typeof raw.users === 'object' ? raw.users : {};
  db.banned = raw.banned && typeof raw.banned === 'object' ? raw.banned : {};
  db.quizzes = raw.quizzes && typeof raw.quizzes === 'object' ? raw.quizzes : {};
  db.notice = typeof raw.notice === 'string' ? raw.notice : '';
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

function userLine(user) {
  var level = levelFor(user.totalExp);
  return user.name + ' · Lv.' + level + ' ' + tierFor(level) +
    ' · ' + expInLevel(user.totalExp) + '/' + CONFIG.EXP_PER_LEVEL +
    ' EXP (누적 ' + user.totalExp + ')';
}

function helpText(isAdmin) {
  var lines = [
    '[ 플로버 봇 명령어 ]',
    '!가입 <닉네임> <비밀번호> — 가입',
    '!로그인 <닉네임> <비밀번호> — 로그인',
    '!로그아웃 — 로그아웃',
    '!내정보 — 내 레벨·EXP',
    '!출석 — 오늘 출석 (+' + CONFIG.ATTENDANCE_EXP + ' EXP)',
    '!랭킹 — 누적 EXP 상위 ' + CONFIG.RANK_LIMIT + '명',
    '!퀴즈 — 일반 퀴즈',
    '!노래퀴즈 — 노래 맞히기',
    '!힌트 — 진행 중인 퀴즈 힌트',
    '!정답 <답> — 정답 제출',
    '!멤버 — 멤버 목록',
    '!공지 — 공지 확인',
    '!도움말 — 이 목록'
  ];

  if (isAdmin) {
    lines.push('');
    lines.push('[ 관리자 ]');
    lines.push('!관리자등록 <코드> — 관리자 권한 얻기');
    lines.push('!회원목록 — 가입자 목록');
    lines.push('!회원조회 <닉네임> — 한 명 자세히');
    lines.push('!밴 <닉네임> — 이용 제한');
    lines.push('!밴해제 <닉네임> — 제한 해제');
    lines.push('!공지등록 <문구> — 공지 설정');
    lines.push('!백업 — 기록 백업 파일 만들기');
  }

  return lines.join('\n');
}

// ── 사용자 상태 ────────────────────────────────────────────────
function findUserByName(db, name) {
  var target = String(name || '').toLowerCase();
  for (var id in db.users) {
    if (!db.users.hasOwnProperty(id)) continue;
    if (String(db.users[id].name).toLowerCase() === target) return db.users[id];
  }
  return null;
}

function isBanned(db, msg) {
  return Boolean(db.banned[identityOf(msg)]);
}

/** 로그인 세션은 메모리에만 둡니다(앱을 껐다 켜면 다시 로그인). */
var sessions = {};

function currentUser(db, msg) {
  var id = sessions[identityOf(msg)];
  if (!id || !db.users[id]) return null;
  return db.users[id];
}

function addExp(user, amount) {
  var before = levelFor(user.totalExp);
  user.totalExp += amount;
  var after = levelFor(user.totalExp);
  return { before: before, after: after, up: after > before };
}

/** 채팅만으로 레벨업하지 않도록 하루 상한과 쿨다운을 둡니다. */
function recordActivity(db, msg) {
  var id = identityOf(msg);
  var user = db.users[id];
  if (!user) return;

  var now = nowMs();
  var day = kstDay(now);

  if (user.expDay !== day) {
    user.expDay = day;
    user.expDayAmount = 0;
  }

  if (now - (user.lastMessageAt || 0) < CONFIG.MESSAGE_COOLDOWN_MS) return;
  if (user.expDayAmount >= CONFIG.MESSAGE_EXP_DAILY_CAP) return;

  user.lastMessageAt = now;
  user.expDayAmount += CONFIG.EXP_PER_MESSAGE;
  addExp(user, CONFIG.EXP_PER_MESSAGE);
}

// ── 퀴즈 ───────────────────────────────────────────────────────
function startQuiz(db, msg, kind) {
  var room = msg.room;
  var question;
  var answer;
  var hint;
  var intro;

  if (kind === 'song') {
    if (SONGS.length === 0) {
      say(msg, '노래 목록이 비어 있어요. 스크립트의 SONGS 를 채워 주세요.');
      return;
    }
    question = pick(SONGS);
    answer = question.title;
    hint = question.hint || '제목을 맞혀 주세요.';
    intro = '🎵 노래 퀴즈! 아래 힌트로 노래 제목을 맞혀 주세요.';
  } else {
    if (QUIZZES.length === 0) {
      say(msg, '퀴즈 목록이 비어 있어요. 스크립트의 QUIZZES 를 채워 주세요.');
      return;
    }
    question = pick(QUIZZES);
    answer = question.a;
    hint = question.hint || '정답을 맞혀 주세요.';
    intro = '❓ 퀴즈!';
  }

  db.quizzes[room] = {
    answer: answer,
    question: kind === 'song' ? null : question.q,
    hint: hint,
    kind: kind,
    startedBy: displayNameOf(msg),
    at: nowMs()
  };

  var lines = [intro];
  if (db.quizzes[room].question) lines.push(db.quizzes[room].question);
  lines.push('힌트: ' + hint);
  lines.push('정답은 "!정답 <답>" 으로 보내 주세요. (정답 ' + CONFIG.QUIZ_EXP + ' EXP)');
  say(msg, lines.join('\n'));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function answeredQuiz(db, msg, text) {
  var room = msg.room;
  var quiz = db.quizzes[room];

  if (!quiz) {
    say(msg, '진행 중인 퀴즈가 없어요. "!퀴즈" 로 시작해 주세요.');
    return;
  }

  if (nowMs() - quiz.at > CONFIG.QUIZ_TTL_MS) {
    delete db.quizzes[room];
    saveDb(db);
    say(msg, '퀴즈 시간이 지나서 종료됐어요. "!퀴즈" 로 다시 시작해 주세요.');
    return;
  }

  if (normalizeAnswer(text) !== normalizeAnswer(quiz.answer)) {
    say(msg, '틀렸어요. 다시 도전하거나 "!힌트" 를 확인해 보세요.');
    return;
  }

  var user = currentUser(db, msg);
  var message = '정답! "' + quiz.answer + '"';

  if (user) {
    var result = addExp(user, CONFIG.QUIZ_EXP);
    message += '\n+' + CONFIG.QUIZ_EXP + ' EXP · ' + userLine(user);
    if (result.up) message += '\n레벨 업! Lv.' + result.after;
  } else {
    message += '\n(로그인하면 EXP를 받을 수 있어요: !로그인 <닉네임> <비밀번호>)';
  }

  delete db.quizzes[room];
  saveDb(db);
  say(msg, message);
}

// ── 관리자 ─────────────────────────────────────────────────────
function isAdmin(user) {
  return Boolean(user && user.admin);
}

function adminCommand(db, msg, command, args) {
  var user = currentUser(db, msg);

  if (!isAdmin(user)) {
    say(msg, '관리자만 사용할 수 있는 명령어예요.');
    return;
  }

  switch (command) {
    case '회원목록':
      return listUsers(db, msg);
    case '회원조회':
      return showUser(db, msg, args[0]);
    case '밴':
      return banUser(db, msg, args[0]);
    case '밴해제':
      return unbanUser(db, msg, args[0]);
    case '공지등록':
      return setNotice(db, msg, args.join(' '));
    case '백업':
      return backup(db, msg);
    default:
      say(msg, '알 수 없는 관리자 명령어예요. "!도움말" 을 확인해 주세요.');
  }
}

function listUsers(db, msg) {
  var ids = Object.keys(db.users);
  if (ids.length === 0) {
    say(msg, '아직 가입자가 없어요.');
    return;
  }

  var lines = ['[ 가입자 ' + ids.length + '명 ]'];
  ids.sort(function (a, b) {
    return db.users[b].totalExp - db.users[a].totalExp;
  });
  for (var i = 0; i < ids.length; i += 1) {
    var user = db.users[ids[i]];
    var level = levelFor(user.totalExp);
    lines.push((i + 1) + '. ' + user.name + ' · Lv.' + level + ' · ' + user.totalExp + ' EXP' +
      (db.banned[ids[i]] ? ' · 제한됨' : ''));
  }
  say(msg, lines.join('\n'));
}

function showUser(db, msg, name) {
  if (!name) {
    say(msg, '사용법: !회원조회 <닉네임>');
    return;
  }

  var user = findUserByName(db, name);
  if (!user) {
    say(msg, '"' + name + '" 닉네임의 가입자를 찾을 수 없어요.');
    return;
  }

  var lines = [
    userLine(user),
    '가입일: ' + (user.createdDay || '-'),
    '출석: ' + Object.keys(user.attendance || {}).length + '회',
    '관리자: ' + (user.admin ? '예' : '아니오'),
    '제한: ' + (db.banned[user.id] ? '예' : '아니오')
  ];
  say(msg, lines.join('\n'));
}

function banUser(db, msg, name) {
  var user = name ? findUserByName(db, name) : null;
  if (!user) {
    say(msg, '사용법: !밴 <닉네임> (가입한 닉네임과 같아야 해요)');
    return;
  }
  if (user.admin) {
    say(msg, '관리자는 제한할 수 없어요.');
    return;
  }

  db.banned[user.id] = { name: user.name, at: nowMs(), by: displayNameOf(msg) };
  saveDb(db);
  say(msg, user.name + ' 님의 이용을 제한했어요.');
}

function unbanUser(db, msg, name) {
  var user = name ? findUserByName(db, name) : null;
  if (!user) {
    say(msg, '사용법: !밴해제 <닉네임>');
    return;
  }

  delete db.banned[user.id];
  saveDb(db);
  say(msg, user.name + ' 님의 제한을 풀었어요.');
}

function setNotice(db, msg, text) {
  if (!text) {
    say(msg, '사용법: !공지등록 <문구>');
    return;
  }
  db.notice = text;
  saveDb(db);
  say(msg, '공지를 설정했어요.');
}

function backup(db, msg) {
  var name = CONFIG.BACKUP_PREFIX + kstDay() + '.json';
  try {
    Database.writeObject(name, db);
  } catch (e) {
    Log.e('백업 실패: ' + e, false);
    say(msg, '백업에 실패했어요.');
    return;
  }
  say(msg, '백업 파일을 만들었어요: ' + name +
    '\n가입자 ' + Object.keys(db.users).length + '명 · 같은 폰 안에 저장됩니다.');
}

// ── 명령 처리 ──────────────────────────────────────────────────
function handleSignUp(db, msg, args) {
  if (args.length < 2) {
    say(msg, '사용법: !가입 <닉네임> <비밀번호>');
    return;
  }

  var name = args[0];
  var password = args[1];
  var id = identityOf(msg);

  if (name.length > 12) {
    say(msg, '닉네임은 12자 이내로 정해 주세요.');
    return;
  }
  if (password.length < 4) {
    say(msg, '비밀번호는 4자 이상으로 정해 주세요.');
    return;
  }
  if (db.users[id]) {
    say(msg, '이미 가입되어 있어요. "!내정보" 로 확인하거나 "!로그인" 을 해 주세요.');
    return;
  }
  if (findUserByName(db, name)) {
    say(msg, '이미 사용 중인 닉네임이에요. 다른 닉네임을 써 주세요.');
    return;
  }

  db.users[id] = {
    id: id,
    name: name,
    pw: hashPassword(password),
    createdDay: kstDay(),
    totalExp: 0,
    attendance: {},
    expDay: kstDay(),
    expDayAmount: 0,
    lastMessageAt: 0,
    admin: false
  };

  sessions[id] = id;
  saveDb(db);
  say(msg, '가입 완료! 환영해요, ' + name + ' 님.\n' + userLine(db.users[id]) +
    '\n"!출석" 으로 매일 ' + CONFIG.ATTENDANCE_EXP + ' EXP를 받을 수 있어요.');
}

function handleLogin(db, msg, args) {
  if (args.length < 2) {
    say(msg, '사용법: !로그인 <닉네임> <비밀번호>');
    return;
  }

  var user = findUserByName(db, args[0]);
  if (!user || user.pw !== hashPassword(args[1])) {
    say(msg, '닉네임 또는 비밀번호가 맞지 않아요.');
    return;
  }

  sessions[identityOf(msg)] = user.id;
  say(msg, '로그인했어요.\n' + userLine(user));
}

function handleAttendance(db, msg) {
  var user = currentUser(db, msg);
  if (!user) {
    say(msg, '로그인이 필요해요. "!로그인 <닉네임> <비밀번호>" 를 보내 주세요.');
    return;
  }

  var day = kstDay();
  if (!user.attendance) user.attendance = {};
  if (user.attendance[day]) {
    say(msg, '오늘 출석은 이미 완료했어요. (한국 시간 자정에 초기화)');
    return;
  }

  user.attendance[day] = true;
  var result = addExp(user, CONFIG.ATTENDANCE_EXP);
  saveDb(db);

  var lines = [
    '출석 완료! +' + CONFIG.ATTENDANCE_EXP + ' EXP (' + day + ')',
    userLine(user)
  ];
  if (result.up) lines.push('레벨 업! Lv.' + result.after + ' ' + tierFor(result.after));
  lines.push('이번 달 출석 ' + countThisMonth(user.attendance, day) + '회');
  say(msg, lines.join('\n'));
}

function countThisMonth(attendance, day) {
  var month = day.slice(0, 7);
  var count = 0;
  for (var key in attendance) {
    if (attendance.hasOwnProperty(key) && key.indexOf(month) === 0) count += 1;
  }
  return count;
}

function handleRanking(db, msg) {
  var ids = Object.keys(db.users);
  if (ids.length === 0) {
    say(msg, '아직 가입자가 없어요. "!가입 <닉네임> <비밀번호>" 로 시작해 보세요.');
    return;
  }

  ids.sort(function (a, b) {
    return db.users[b].totalExp - db.users[a].totalExp;
  });

  var lines = ['[ 누적 EXP 랭킹 ]'];
  var limit = Math.min(CONFIG.RANK_LIMIT, ids.length);
  for (var i = 0; i < limit; i += 1) {
    var user = db.users[ids[i]];
    lines.push((i + 1) + '. ' + user.name + ' · Lv.' + levelFor(user.totalExp) +
      ' · ' + user.totalExp + ' EXP');
  }
  say(msg, lines.join('\n'));
}

function handleAdminSetup(db, msg, args) {
  var code = args[0];
  if (!code) {
    say(msg, '사용법: !관리자등록 <코드>');
    return;
  }

  // 설정 파일에서 코드를 바꾸지 않았으면 아무도 관리자가 될 수 없습니다.
  if (CONFIG.ADMIN_SETUP_CODE === 'CHANGE_THIS_TO_YOUR_OWN_SECRET') {
    say(msg, '관리자 등록이 잠겨 있어요. 스크립트의 ADMIN_SETUP_CODE 를 본인만 아는 값으로 바꾼 뒤 다시 시도해 주세요.');
    return;
  }

  if (code !== CONFIG.ADMIN_SETUP_CODE) {
    say(msg, '코드가 맞지 않아요.');
    return;
  }

  var user = currentUser(db, msg);
  if (!user) {
    say(msg, '먼저 "!가입 <닉네임> <비밀번호>" 로 가입해 주세요.');
    return;
  }

  user.admin = true;
  saveDb(db);
  say(msg, user.name + ' 님이 관리자가 되었어요. "!도움말" 로 관리자 명령을 확인하세요.');
}

function handleMessage(msg) {
  if (!msg || typeof msg.content !== 'string') return;

  var text = msg.content.trim();
  if (text.indexOf('!') !== 0 && text.indexOf('！') !== 0) return;

  var body = text.replace(/^[!！]\s*/, '');
  if (!body) return;

  var parts = body.split(/\s+/);
  var command = parts[0];
  var args = parts.slice(1);

  var db = loadDb();

  try {
    if (isBanned(db, msg)) {
      say(msg, '이용이 제한된 사용자예요. 운영진에게 문의해 주세요.');
      return;
    }

    var user = currentUser(db, msg);
    recordActivity(db, msg);

    switch (command) {
      case '도움말':
      case '명령어':
      case 'help':
        say(msg, helpText(isAdmin(user)));
        return;

      case '가입':
        handleSignUp(db, msg, args);
        return;

      case '로그인':
        handleLogin(db, msg, args);
        return;

      case '로그아웃':
        delete sessions[identityOf(msg)];
        say(msg, '로그아웃했어요.');
        return;

      case '내정보':
        if (!user) {
          say(msg, '로그인이 필요해요. "!로그인 <닉네임> <비밀번호>"');
          return;
        }
        say(msg, userLine(user) + '\n출석 ' + Object.keys(user.attendance || {}).length + '회');
        return;

      case '출석':
        handleAttendance(db, msg);
        return;

      case '랭킹':
        handleRanking(db, msg);
        return;

      case '멤버':
        say(msg, '[ 멤버 ' + MEMBERS.length + '명 ]\n' + MEMBERS.join(', '));
        return;

      case '공지':
        say(msg, db.notice ? '[ 공지 ]\n' + db.notice : '등록된 공지가 없어요.');
        return;

      case '퀴즈':
        startQuiz(db, msg, 'general');
        return;

      case '노래퀴즈':
        startQuiz(db, msg, 'song');
        return;

      case '힌트':
        handleHint(db, msg);
        return;

      case '정답':
        answeredQuiz(db, msg, args.join(' '));
        return;

      case '관리자등록':
        handleAdminSetup(db, msg, args);
        return;

      case '회원목록':
      case '회원조회':
      case '밴':
      case '밴해제':
      case '공지등록':
      case '백업':
        adminCommand(db, msg, command, args);
        return;

      default:
        // 예전에는 여기서 "관리자만 사용할 수 있는" 이 나와서 오타가 오해를 샀습니다.
        say(msg, '알 수 없는 명령어예요: ' + command + '\n"!도움말" 을 확인해 주세요.');
        return;
    }
  } catch (e) {
    Log.e('명령 처리 실패(' + command + '): ' + e, false);
    say(msg, '처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  } finally {
    saveDb(db);
  }
}

function handleHint(db, msg) {
  var quiz = db.quizzes[msg.room];
  if (!quiz) {
    say(msg, '진행 중인 퀴즈가 없어요. "!퀴즈" 또는 "!노래퀴즈" 로 시작해 주세요.');
    return;
  }

  var left = Math.round((CONFIG.QUIZ_TTL_MS - (nowMs() - quiz.at)) / 1000);
  say(msg, '힌트: ' + quiz.hint +
    (left > 0 ? '\n남은 시간 약 ' + left + '초' : ''));
}

// ── 등록 ───────────────────────────────────────────────────────
var bot = BotManager.getCurrentBot();
bot.addListener(Event.MESSAGE, handleMessage);
Log.i('FLOVER BOT 준비 완료 (폰 전용, 서버 불필요)');
