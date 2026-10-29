const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

export const config = {
  port: numberFromEnv(process.env.PORT, 5000),
  adminEmails: splitList(process.env.ADMIN_EMAILS).map((email) =>
    email.toLowerCase(),
  ),
  corsOrigins: splitList(process.env.CORS_ORIGINS),
  attendanceExp: numberFromEnv(process.env.ATTENDANCE_EXP, 50),
  eventClaimWindowMinutes: numberFromEnv(
    process.env.EVENT_CLAIM_WINDOW_MINUTES,
    5,
  ),
  kakaoSkillSecret: process.env.KAKAO_SKILL_SECRET?.trim() ?? '',
  publicAppUrl: process.env.PUBLIC_APP_URL?.trim() || undefined,
};
