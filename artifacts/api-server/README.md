# @workspace/api-server

Express 5 API for the Flober Bot web app. It implements all 19 operations in
`lib/api-spec/openapi.yaml` on top of the Drizzle schema in `lib/db`, with Clerk
session authentication and email-based administrator authorization.

## Run

```bash
pnpm install
cp artifacts/api-server/.env.example artifacts/api-server/.env
# fill DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, ADMIN_EMAILS

# drizzle-kit reads DATABASE_URL from the shell, not from the .env file
export DATABASE_URL="postgres://..."
pnpm --filter @workspace/db run push

pnpm --filter @workspace/api-server run dev   # tsx watch
# or
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start # dist/index.js
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

## Endpoints

| Method | Path |
| --- | --- |
| GET | `/api/healthz` |
| POST | `/api/webhooks/kakao` |
| GET | `/api/members/me` |
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

### Current limit

The bot currently **guides** users to the web app. It does not yet link a Kakao
`botUserKey` to a web member, so it cannot record attendance or event claims
directly from chat. That linking flow is the next step.
