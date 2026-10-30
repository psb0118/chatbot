# @workspace/api-server

Express 5 API for the Flober Bot web app. It implements all 21 operations in
`lib/api-spec/openapi.yaml` on top of the Drizzle schema in `lib/db`, with Clerk
session authentication and email-based administrator authorization.

It also serves the KakaoTalk Open Builder skill endpoint, which records
attendance and event claims for members that linked their chat account.

## Run

```bash
pnpm install
cp artifacts/api-server/.env.example artifacts/api-server/.env
# fill DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, ADMIN_EMAILS

# drizzle-kit reads DATABASE_URL from the shell, not from the .env file
export DATABASE_URL="postgres://..."

# Production: apply the committed migrations (preferred)
pnpm --filter @workspace/db run migrate
# Prototype only: push the schema without migration history
# pnpm --filter @workspace/db run push

# Optional seed: the three daily events (idempotent)
pnpm --filter @workspace/scripts run seed

pnpm --filter @workspace/api-server run dev   # tsx watch
# or
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start # dist/index.js

# Tests (PGlite in-memory Postgres, applies the real migration)
CI=true pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run test
```

The server listens on `PORT` (default `5000`) and exposes everything under
`/api`. `GET /api/healthz` is unauthenticated; all other routes require a Clerk
session.

## Behaviour notes

- **Dates** are evaluated in Asia/Seoul. Attendance is one record per member per
  KST day and event claims are one per member/event/KST day (also enforced by
  unique indexes).
- **Progression** is centralised in `src/lib/progression.ts`: 100 total EXP per
  level, tiers `Sprout → Bloom → Blossom → Flover → Star → Moon`.
- **Event claims** can only be submitted within `EVENT_CLAIM_WINDOW_MINUTES`
  (default 5) of the event time. Approving a claim grants the event's `rewardExp`
  once, inside the same transaction that updates the claim.
- **Admin access** is granted when any Clerk email address of the signed-in user
  is listed in `ADMIN_EMAILS`. If the variable is empty the admin API returns
  `503`; non-admin users receive `403`.
- Every administrator mutation writes an `admin_logs` row in the same
  transaction as the change.
- **Kakao link codes** are six characters, single-use and valid for 15 minutes.
  Redeeming one attaches `kakao_user_key` to the member that issued the code, so
  a leaked code costs the victim at most one attendance on a member they do not
  own; they can unlink on the web and issue a new code. There is deliberately no
  second approval step.
- **Banning** is done by setting the member's `status` to `inactive`: the bot and
  the member APIs then answer `403`. Link and unlink events are not written to
  `admin_logs` and no link timestamp is stored, so bans rely on operator
  observation.

## Endpoints

| Method | Path |
| --- | --- |
| GET | `/api/healthz` |
| POST | `/api/webhooks/kakao` |
| GET | `/api/members/me` |
| POST | `/api/members/me/kakao/link-code` |
| DELETE | `/api/members/me/kakao` |
| POST | `/api/members` |
| GET | `/api/dashboard` |
| GET | `/api/leaderboard` |
| GET | `/api/attendance` |
| POST | `/api/attendance` |
| GET | `/api/events` |
| GET | `/api/events/claims/me` |
| POST | `/api/events/claims` |
| GET | `/api/admin/members` |
| PATCH | `/api/admin/members/:id` |
| GET | `/api/admin/members/:id/history` |
| GET | `/api/admin/attendance` |
| POST | `/api/admin/events` |
| PATCH | `/api/admin/events/:id` |
| GET | `/api/admin/event-claims` |
| POST | `/api/admin/event-claims/:id/review` |
| GET | `/api/admin/logs` |

## KakaoTalk auto-reply bot (Open Builder)

`POST /api/webhooks/kakao` is the skill server endpoint for a KakaoTalk channel
chatbot. It is mounted before Clerk, so Kakao does not need a web session.

### Connect it

1. Create a KakaoTalk channel and a bot in Kakao i Open Builder.
2. In the bot's **스킬** menu, create a skill:
   - URL: `https://<public-domain>/api/webhooks/kakao`
   - Header: `x-kakao-skill-secret` = your `KAKAO_SKILL_SECRET`
   - Test URL: another public endpoint, e.g. the same URL with `?secret=...`
3. Attach the skill to the block that should answer messages. To auto-reply to
   every unmatched message, attach it to the **폴백 블록** (fallback block) or to
   the AI chatbot block's skill response.
4. Set `KAKAO_SKILL_SECRET` and `PUBLIC_APP_URL` in the API environment.
   `PUBLIC_APP_URL` is used for the webLink buttons. Without it the bot returns
   only text and message quick replies.

Kakao requires a public domain or public IP (localhost is rejected), sends
`POST` with JSON, and expects a response within 5 seconds. This handler is
synchronous and answers immediately.

### Replies

- Built-in: 인사, 도움말, 출석, 이벤트, 랭킹, 멤버 등록, unknown fallback.
- FAQ rules: edit `src/bot/rules.ts` (keywords, reply, contains/exact).
- Rules run before built-ins and the first match wins.
- Response shape: `{ version: "2.0", template: { outputs: [{ simpleText }], quickReplies } }`.

### Account linking and chat commands

The bot stores the Kakao `userRequest.user.id` (botUserKey) on the member, so the
same daily attendance rules apply in chat and on the web.

1. The member signs in and presses **연동 코드 발급** on the dashboard.
   `POST /api/members/me/kakao/link-code` returns a 6-character code (no `0/1/I/O`)
   that expires after 15 minutes.
2. The member sends `연동 ABC234` in the KakaoTalk channel. The code is single
   use and is cleared in the same transaction that stores the botUserKey.
3. `POST /api/members/me/kakao` (or `DELETE /api/members/me/kakao`) unlinks from
   the web; `연동해제` unlinks from chat.

| Command | Behaviour |
| --- | --- |
| `출석`, `출석체크`, `체크인` | Linked: records today's attendance (+50 EXP) and reports EXP/level. Unlinked: sends the linking guide. |
| `연동 <코드>` | Links the chat account to the member that owns the code. |
| `연동해제` | Removes the link for this chat account. |
| `내정보` | Shows member number, level, tier and EXP. |
| `이벤트` | Lists active events with their numeric ids. |
| `이벤트참여 <번호> <문구>` | Submits a claim if inside `EVENT_CLAIM_WINDOW_MINUTES`. |

`출석` only records when the whole utterance is the command, so questions like
"출석은 어떻게 해?" still get the web guide instead of a surprise check-in.

### Limits

- Linking requires the server to have a database; without `DATABASE_URL` the bot
  still answers FAQ text but returns a retry message for stateful commands.
- One Kakao account can be linked to one member, and one member to one account.
  Both directions are enforced by unique indexes.
- Free-text conversations are keyword rules, not an LLM. Edit `src/bot/rules.ts`.
