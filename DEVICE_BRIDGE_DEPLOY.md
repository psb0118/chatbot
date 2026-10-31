# 기기 브리지 배포 체크리스트

기기(폰)에서 카톡 알림을 읽어 봇이 답하는 방식의 배포 순서입니다. 카카오가 우리
서버를 호출하는 공식 스킬과 달리, **폰이 우리 서버를 호출**합니다.

```
공기계(카톡 로그인) ─ 메신저봇R + 스크립트
        │  GET /api/bridge/kakao?secret=…&room=…&sender=…&text=!출석
        ▼
   API 서버 (Postgres)  ──  웹/관리자 화면(선택, Clerk 필요)
```

---

## 0. 준비물

- [ ] 공기계 1대 + **봇 전용 카카오 계정**(본 계정과 분리)
- [ ] 오픈채팅방(봇 계정이 참여 중)
- [ ] Postgres (Neon / Supabase / Railway Postgres 등)
- [ ] Node 서버 호스팅 (Railway / Render / Fly.io 등) + 공인 HTTPS 도메인
- [ ] 메신저봇R 설치 (Play 스토어)
- [ ] (선택) 관리자 화면을 쓸 경우: Clerk 프로젝트 + 관리자 이메일

---

## 1. 데이터베이스 만들기

1. Postgres 인스턴스를 만들고 **연결 문자열**을 복사합니다.
2. SSL이 필요한 관리형 DB는 뒤에 `?sslmode=require`를 붙입니다.

```
postgresql://user:password@host:5432/dbname?sslmode=require
```

- [ ] `DATABASE_URL` 확보

---

## 2. API 서버 배포

호스팅에 아래를 등록합니다(모노레포 루트 기준).

| 항목 | 값 |
| --- | --- |
| Install / Build | `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build` |
| Start | `pnpm --filter @workspace/api-server run start` |
| Health check | `/api/healthz` |
| Node | 22 이상 권장 (개발 검증은 24) |
| Port | 호스팅이 주는 `PORT` 사용 (미설정 시 5000, `0.0.0.0` 바인딩) |

- [ ] 빌드 성공 (`dist/index.js` 생성)
- [ ] 서버 기동 후 `https://<도메인>/api/healthz` → `200 {"status":"ok"}`

---

## 3. 환경변수

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres 연결 문자열 |
| `DEVICE_BRIDGE_SECRET` | ✅ | 기기 브리지 비밀키. **비어 있으면 `/api/bridge/kakao`가 503으로 닫힘** |
| `PUBLIC_APP_URL` | 선택 | 웹 주소. 답변의 "웹에서 열기" 버튼에 사용 |
| `PORT` | 선택 | 호스팅이 주입 |
| `ATTENDANCE_EXP` | 선택 | 출석 EXP (기본 50) |
| `EVENT_CLAIM_WINDOW_MINUTES` | 선택 | 이벤트 신청 허용 창 (기본 5분) |
| `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` | 선택 | 웹 로그인·관리자 화면용. **기기 봇만 쓸 때는 불필요** |
| `ADMIN_EMAILS` | 선택 | 관리자 화면용. 없으면 관리자 API 503 |
| `CORS_ORIGINS` | 선택 | 웹을 다른 도메인에 둘 때 |

- [ ] `DATABASE_URL`, `DEVICE_BRIDGE_SECRET` 입력
- [ ] 비밀키는 채팅/깃에 남기지 말고 호스팅 환경변수로만

---

## 4. 스키마 적용

`drizzle-kit`은 `.env`가 아니라 **셸 환경변수**를 읽습니다.

```bash
export DATABASE_URL="postgresql://…?sslmode=require"
pnpm --filter @workspace/db run migrate    # 필수: 테이블 생성
pnpm --filter @workspace/scripts run seed  # 선택: 기본 이벤트 3종
```

- [ ] `migrate` 성공 (members / attendance / events / admin_logs 생성)
- [ ] (선택) `seed` 실행

---

## 5. 배포 확인 (폰 없이 먼저)

```bash
# 1) 살아 있나
curl -s https://<도메인>/api/healthz

# 2) 시크릿이 틀리면 401
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<도메인>/api/bridge/kakao?secret=wrong&room=테스트&sender=테스터&text=!사용법"

# 3) 시크릿이 맞으면 명령어 목록이 평문으로
curl -s "https://<도메인>/api/bridge/kakao?secret=<DEVICE_BRIDGE_SECRET>&room=테스트&sender=테스터&text=!사용법"
```

- [ ] `healthz` 200
- [ ] 틀린 시크릿 401
- [ ] `!사용법` 응답에 `!가입`, `!출석` 포함
- [ ] `!가입` 시 "가입이 완료됐어요" + 코드 (DB가 붙어 있다는 증거)

> `!가입`이 "지금은 기록을 처리할 수 없어요"로 오면 `DATABASE_URL` 미설정 또는
> 마이그레이션 누락입니다.

---

## 6. 기기 준비

- [ ] 공기계에 **봇 전용 카카오 계정**으로 로그인
- [ ] 오픈채팅방 참여
- [ ] 메신저봇R 설치 → **알림 접근 권한** 허용
- [ ] 배터리 최적화 예외(백그라운드 종료 방지)
- [ ] **그 방의 알림 켜기** — 무음/알림 끔이면 메시지를 읽지 못합니다
- [ ] 자동 잠금/절전에서 앱이 죽지 않는지 확인

---

## 7. 스크립트 붙이기

### 7-1. 봇 생성 창의 옵션 (여기서 대부분 막힙니다)

봇을 새로 만들면 체크박스 두 개가 나옵니다. **둘 다 체크하면 안 됩니다.**

| 옵션 | 설정 | 이유 |
| --- | --- | --- |
| 레거시 API 사용 | 체크 | 아래 스크립트가 `response` / `replier` / `Utils.getWebText` — 전부 레거시 API입니다. 끄면 `response`가 아예 호출되지 않습니다. |
| 통합된 매개변수 사용 | 체크 해제 | 켜면 인자가 **객체 하나**로 바뀌어 `room`·`msg`가 `undefined`가 됩니다. `msg.startsWith('!')`에서 즉시 예외 → 봇이 조용히 무응답. |

> 이미 통합된 매개변수를 켠 채로 만들었다면, 옵션을 끄고 저장한 뒤 봇 스위치를
> 껐다 켜세요.

### 7-2. 스크립트

메신저봇R 봇 스크립트에 아래를 넣고 두 값을 치환합니다.

```js
const API = 'https://<도메인>/api/bridge/kakao?secret=<DEVICE_BRIDGE_SECRET>';

function response(room, msg, sender, isGroupChat, replier) {
  if (!msg.startsWith('!')) return; // '!' 명령만 처리
  try {
    const text = Utils.getWebText(
      API +
        '&room=' + encodeURIComponent(room) +
        '&sender=' + encodeURIComponent(sender) +
        '&text=' + encodeURIComponent(msg),
    );
    replier.reply(String(text).trim());
  } catch (e) {
    replier.reply('지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
}
```

- [ ] `API` 상수에 본인 도메인 + 시크릿 입력
- [ ] `레거시 API 사용` 체크 / `통합된 매개변수` 체크 해제
- [ ] 봇 스위치 ON

### 7-3. 무응답 진단

붙인 직후 앱의 **디버그(실행) 화면**에서 방에 `!사용법`을 보내고 로그를 봅니다.
정상이면 `플로버 봇 사용법을 안내해 드릴게요…`로 시작하는 응답이 옵니다.

| 디버그 로그 / 증상 | 원인 | 조치 |
| --- | --- | --- |
| `msg is undefined`, `Cannot read property 'startsWith' of undefined` | 통합된 매개변수를 켬 | 옵션 해제 후 저장, 봇 재시작 |
| 로그가 아예 없음(스크립트 진입 안 함) | 레거시 API가 꺼져 있음 / 그 방 알림이 꺼져 있음 / 알림 접근 권한 없음 | 옵션 체크, 방 알림 ON, 권한 재확인 |
| 응답으로 `401`·`403` 문자열 | 스크립트의 `secret=` 값이 서버와 불일치 | `.env`의 `DEVICE_BRIDGE_SECRET`와 스크립트 값 비교 |
| 응답으로 `503` 문자열 | 서버에 `DEVICE_BRIDGE_SECRET` 미설정 | 호스팅 환경변수 확인 |
| `지금은 처리할 수 없어요` | 스크립트의 try/catch가 잡은 통신 실패(도메인 오타, HTTPS 아님, 폰 네트워크) | 폰 브라우저로 `https://<도메인>/api/healthz` 열어 확인 |

> `Utils.getWebText`는 동기 호출이라 서버가 느리면 봇이 그만큼 멈춥니다.
> 응답이 3초를 넘기면 호스팅 콜드스타트를 의심하세요(10장 사고 대응).

---

## 8. 첫 테스트 (방에서)

1. [ ] `!사용법` → 명령어 목록
2. [ ] `!가입` → 멤버 번호 + 영구 코드
3. [ ] `!출석` → `출석 완료! +50 EXP`
4. [ ] 같은 날 `!출석` 재입력 → `이미 완료`
5. [ ] `!내정보` → 레벨/EXP
6. [ ] **다른 계정**으로 `!가입` → 별도 멤버 생성(서로 기록 안 섞임)
7. [ ] (선택) 관리자 화면 → 멤버 탭에 닉네임으로 표시됨

---

## 9. 운영 규칙

- 닉네임이 곧 신원입니다. **닉네임 변경 = 새 멤버**로 잡히므로, 관리자 화면에서
  기존 멤버를 비활성 처리하거나 이름을 정리하세요.
- 같은 닉네임을 쓰는 사람이 둘이면 충돌합니다. 방 규칙으로 닉네임 중복을 금지하거나
  `닉네임#번호` 형태를 권장하세요.
- 밴: 관리자 화면 → 멤버 → `수정` → **멤버 상태 = 비활성**.
  출석·연동·랭킹 노출이 차단됩니다. (이벤트 참여 신청은 아직 막지 않으므로
  `참여 검토`에서 반려)
- 봇 계정은 절대 본 계정과 섞지 마세요. 카카오 제재는 봇 계정에만 떨어집니다.

---

## 10. 사고 대응

| 증상 | 원인 / 조치 |
| --- | --- |
| 봇이 갑자기 무응답 | 알림 접근 서비스 종료, 배터리 최적화, 앱 강제 종료 → 앱 재시작·권한 재확인 |
| 특정 방만 무응답 | 그 방 알림이 꺼져 있음 |
| `401` 응답 | 스크립트의 시크릿 불일치 |
| `503` 응답 | 서버에 `DEVICE_BRIDGE_SECRET` 미설정 |
| "지금은 기록을 처리할 수 없어요" | `DATABASE_URL` 미설정/마이그레이션 누락 |
| 계정 정지 | 공기계 계정만 영향. 새 부계정 + 재가입으로 복구, 본 계정은 그대로 |
| 앱이 스토어에서 사라짐 | 이미 설치된 앱은 계속 동작. 재설치는 불가할 수 있으므로 백업(APK) 보관 권장 |
| 응답이 늦다 | 폰 네트워크/절전. 서버 콜드스타트는 재시도로 흡수됨 |

---

## 11. 최소 요약

1. DB 만들고 `DATABASE_URL` 확보
2. 서버 배포 (`pnpm build` → `pnpm start`), `DEVICE_BRIDGE_SECRET` 설정
3. `pnpm --filter @workspace/db run migrate`
4. `curl .../api/bridge/kakao?...&text=!사용법` 로 응답 확인
5. 공기계: 카톡 로그인 → 메신저봇R → 알림 권한 → 방 알림 ON
6. 스크립트에 도메인/시크릿 넣고 ON (레거시 API 체크, 통합된 매개변수 해제)
7. 방에서 `!가입` → `!출석`
