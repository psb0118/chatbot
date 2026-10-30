import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowRight, BadgeCheck, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleHelp, Clock3, Crown, Gift, Heart, Home, LogOut, Menu, MessageCircle,
  RefreshCw, Search, Shield, Sparkles, Star, Trophy, Users, X, Zap,
} from 'lucide-react';
import {
  useHealthCheck, getHealthCheckQueryKey, useGetMyMember, getGetMyMemberQueryKey,
  useIssueKakaoLinkCode, useUnlinkKakao,
  useRegisterMember, useGetDashboard, getGetDashboardQueryKey, useGetLeaderboard,
  getGetLeaderboardQueryKey, useClaimAttendance, useListEvents, getListEventsQueryKey,
  useListMyAttendance, getListMyAttendanceQueryKey,
  useListMyEventClaims, getListMyEventClaimsQueryKey, useSubmitEventClaim,
  useListAdminMembers, getListAdminMembersQueryKey, useUpdateAdminMember,
  useGetAdminMemberHistory, getGetAdminMemberHistoryQueryKey, useListAdminAttendance,
  getListAdminAttendanceQueryKey, useCreateAdminEvent, useUpdateAdminEvent,
  useListAdminEventClaims, getListAdminEventClaimsQueryKey, useReviewAdminEventClaim,
  useListAdminLogs, getListAdminLogsQueryKey,
} from '@workspace/api-client-react';
import type { EventInput, Member } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#d94b83', colorForeground: '#573341', colorMutedForeground: '#9c7d88',
    colorDanger: '#c94555', colorBackground: '#fff9fb', colorInput: '#fffdfd',
    colorInputForeground: '#573341', colorNeutral: '#eadce1', fontFamily: "'DM Sans','Gowun Dodum',sans-serif", borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fff9fb] rounded-3xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#573341] font-semibold', headerSubtitle: 'text-[#9c7d88]', socialButtonsBlockButton: 'rounded-xl border-[#eadce1]',
    socialButtonsBlockButtonText: 'text-[#573341]', formFieldLabel: 'text-[#573341]', footerActionLink: 'text-[#d94b83]',
    footerActionText: 'text-[#9c7d88]', dividerText: 'text-[#9c7d88]', logoBox: 'mb-3',
    formButtonPrimary: 'bg-[#d94b83] hover:bg-[#bf3d70] rounded-xl shadow-none',
    formFieldInput: 'rounded-xl border-[#eadce1] bg-white text-[#573341]', main: 'gap-4',
  },
};

const pages = [
  { href: '/dashboard', label: '내 홈', icon: Home },
  { href: '/leaderboard', label: '랭킹', icon: Trophy },
  { href: '/attendance', label: '출석', icon: CalendarDays },
  { href: '/events', label: '이벤트', icon: Sparkles },
];
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value)) : '—';
const number = (value?: number | null) => value?.toLocaleString('ko-KR') ?? '—';
const slotName: Record<string, string> = { morning: '오전', afternoon: '오후', midnight: '자정' };
function Tier({ tier }: { tier?: string }) {
  const key = (tier || '').toLowerCase();
  return <span className={`tier tier-${key}`} aria-label={`${tier || '등급'} 등급`} title={`${tier || '등급'} 등급`}>{tier || '등급'}</span>;
}
function Wordmark({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand-lockup" data-testid="link-brand"><span className="brand-mark">f</span>{!compact && <span>플로버<span className="brand-bot">봇</span></span>}</Link>;
}
function Button({ children, onClick, kind = 'primary', disabled = false, type = 'button', className = '', testId }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'outline' | 'ghost' | 'soft' | 'danger';
  disabled?: boolean; type?: 'button' | 'submit'; className?: string; testId?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`button button-${kind} ${className}`}>{children}</button>;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="loading-stack" aria-label="불러오는 중">{Array.from({ length: rows }, (_, i) => <div className="skeleton loading-row" key={i} />)}</div>;
}
function QueryError({ retry, text = '정보를 불러오지 못했어요.' }: { retry: () => void; text?: string }) {
  return <div className="state-box state-error"><span className="state-icon"><CircleHelp size={19} /></span><div><strong>{text}</strong><p>잠시 후 다시 시도해 주세요.</p></div><Button kind="outline" onClick={retry}><RefreshCw size={14} /> 다시 시도</Button></div>;
}
function EmptyState({ title, detail, symbol = <Heart size={20} /> }: { title: string; detail: string; symbol?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{symbol}</span><strong>{title}</strong><p>{detail}</p></div>;
}
function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'pink' | 'green' | 'amber' | 'red' }) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}
function QueryNotice({ isLoading, isError, refetch, children, errorText }: { isLoading: boolean; isError: boolean; refetch: () => void; children: ReactNode; errorText?: string }) {
  if (isLoading) return <LoadingBlock />;
  if (isError) return <QueryError retry={refetch} text={errorText} />;
  return <>{children}</>;
}
function errorStatus(error: unknown) {
  if (typeof error === 'object' && error && 'status' in error) return Number((error as {status:unknown}).status);
  return 0;
}
function adminErrorText(error: unknown) {
  const status = errorStatus(error);
  if (status === 401) return '로그인이 만료되었어요. 로그인 상태를 확인해 주세요.';
  if (status === 403) return '관리자 권한이 없어 이 정보를 볼 수 없어요.';
  if (status === 503) return '관리자 이메일이 아직 설정되지 않았어요. 운영자 환경 설정을 확인해 주세요.';
  if (status === 404) return '관리자 API가 설정되지 않았거나 사용할 수 없어요.';
  return '관리자 정보를 불러오지 못했어요. API 연결과 권한을 확인해 주세요.';
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) client.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function SignInPage() {
  return <div className="auth-page"><div className="auth-note"><Wordmark /><p>좋아하는 마음을 차곡차곡,<br />플로버의 작은 기록장.</p><span>독립 팬 커뮤니티 멤버십 서비스</span></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}
function SignUpPage() {
  return <div className="auth-page"><div className="auth-note"><Wordmark /><p>우리의 응원을<br />함께 기록해요.</p><span>가입 후 멤버 정보를 등록할 수 있어요.</span></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}
function GuestHome() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false } });
  return <div className="landing page-enter">
    <header className="landing-nav"><Wordmark /><div className="landing-links"><a href="#about">서비스 소개</a><a href="#independent">운영 안내</a><Link href="/sign-in" className="button button-ghost">로그인</Link><Link href="/sign-up" className="button button-primary">플로버 가입하기 <ArrowRight size={15} /></Link></div></header>
    <main>
      <section className="hero">
        <div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> fromis_9 팬 커뮤니티 멤버십</span>
          <h1>좋아하는 마음을<br /><em>오래, 함께.</em></h1>
          <p>출석과 이벤트 참여를 기록하고, 플로버들과 쌓아가는 경험치를 한곳에서 확인해요.</p>
          <div className="hero-actions"><Link href="/sign-up" className="button button-primary">멤버로 시작하기 <ArrowRight size={16} /></Link><Link href="/sign-in" className="text-link">이미 멤버예요 <ChevronRight size={15} /></Link></div>
          <div className="independent-note"><Shield size={16} /><span>플로버 봇은 카카오톡과 연결되지 않은 독립 서비스입니다.</span></div>
        </div>
        <div className="hero-art" aria-label="플로버 커뮤니티 소개 장식">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="hero-sticker sticker-one"><Star size={17} fill="currentColor" /></div><div className="hero-sticker sticker-two"><Heart size={18} fill="currentColor" /></div>
          <div className="membership-card"><div className="membership-top"><span>FLOVER CLUB</span><span className="serial">NO. 000000</span></div><div className="membership-flower">f</div><div className="membership-bottom"><div><small>멤버십 카드</small><strong>나의 팬심을 기록해요</strong></div><Tier tier="seed" /></div><div className="card-seal">fl</div></div>
          <div className="art-caption">작은 기록이 모여<br /><b>더 큰 마음이 되도록</b></div>
        </div>
      </section>
      <section className="landing-proof" id="about"><div className="proof-label">FLOVER LOGBOOK <span>NO. 01 — OUR DAYS</span></div><div className="proof-intro"><h2>응원의 하루하루를<br />기억하는 방법.</h2><p>플로버 봇은 팬 활동의 기록을 모아보는 멤버십 도구예요. 정해진 활동에 참여하고, 직접 기록을 남기며 나만의 팬 여정을 만들어 보세요.</p></div>
        <div className="feature-line"><div className="feature-num">01</div><div className="feature-icon"><CalendarDays /></div><div><h3>매일의 출석 기록</h3><p>오늘의 출석 여부를 확인하고 꾸준한 응원을 경험치로 쌓아요.</p></div><span className="feature-aside">DAILY CHECK-IN</span></div>
        <div className="feature-line"><div className="feature-num">02</div><div className="feature-icon"><Trophy /></div><div><h3>함께 보는 성장 랭킹</h3><p>멤버들의 누적 활동을 바탕으로 한 상위 10명의 랭킹을 확인해요.</p></div><span className="feature-aside">TOP 10</span></div>
        <div className="feature-line"><div className="feature-num">03</div><div className="feature-icon"><Sparkles /></div><div><h3>이벤트 직접 참여 신청</h3><p>안내된 문구를 제출하면 관리자가 참여 기록을 검토합니다.</p></div><span className="feature-aside">MANUAL REVIEW</span></div>
      </section>
      <section className="independent-band" id="independent"><div><span className="eyebrow">먼저 알아두기</span><h2>팬의 기록은 팬이 직접 남깁니다.</h2></div><div className="independent-copy"><p>플로버 봇은 fromis_9 팬을 위한 독립적인 멤버십 관리 서비스이며, 카카오톡이나 공식 커뮤니티와 연동되어 있지 않습니다.</p><p>이벤트 참여 신청은 자동 확인이 아닌 <b>멤버의 수동 신청</b>이며, 운영자가 내용을 확인한 뒤 승인 여부를 결정합니다.</p></div></section>
      <section className="landing-cta"><div className="cta-flower">✿</div><span className="eyebrow">YOUR FLOVER JOURNEY</span><h2>오늘부터, 우리의 기록.</h2><p>계정으로 로그인하고 멤버 프로필을 등록해 주세요.</p><Link href="/sign-up" className="button button-primary">플로버로 함께하기 <ArrowRight size={16} /></Link><small>{health.isError ? '서비스 상태를 확인할 수 없습니다.' : health.isLoading ? '서비스 상태 확인 중' : '멤버십 관리 서비스 · 비공식 독립 운영'}</small></section>
    </main><footer className="landing-footer"><Wordmark /><span>fromis_9 팬 커뮤니티를 위한 독립 기록 서비스</span><span>© 플로버 봇</span></footer>
  </div>;
}
function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <GuestHome />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <GuestHome />;
}
function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="auth-loading"><div className="skeleton auth-skeleton" /><span>플로버 봇을 준비하고 있어요</span></div>;
  if (!isSignedIn) return <Redirect to="/" />;
  return <>{children}</>;
}
function AppShell({ children, active }: { children: ReactNode; active: string }) {
  const [loc] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut } = useClerk();
  const locationActive = active || loc;
  return <div className="app-layout">
    <aside className="sidebar">
      <div className="sidebar-brand"><Wordmark /><button onClick={() => setMenuOpen(false)} className="mobile-close" aria-label="메뉴 닫기"><X size={19} /></button></div>
      <div className="sidebar-caption">FLOVER SPACE</div>
      <nav className="side-nav">{pages.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={`nav-link ${locationActive === href ? 'is-active' : ''}`} data-testid={`link-nav-${href.slice(1)}`}><Icon size={18} /><span>{label}</span>{locationActive === href && <span className="nav-indicator" />}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="kakao-card"><div className="kakao-icon"><MessageCircle size={17} /></div><div><b>카카오 출석 연동</b><span>채팅에서 바로 출석</span></div><span className="pending-dot" /></div><Link href="/admin" className={`nav-link admin-nav ${locationActive === '/admin' ? 'is-active' : ''}`}><Shield size={17} /><span>관리자 메뉴</span></Link><button className="logout-button" onClick={() => signOut({ redirectUrl: basePath || '/' })}><LogOut size={16} /> 로그아웃</button><p className="sidebar-footnote">플로버의 기록을 소중히</p></div>
    </aside>
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기" />}
    <div className={`mobile-sidebar ${menuOpen ? 'mobile-sidebar-open' : ''}`}><div className="sidebar-brand"><Wordmark /><button onClick={() => setMenuOpen(false)} className="mobile-close" aria-label="메뉴 닫기"><X size={19} /></button></div><div className="sidebar-caption">FLOVER SPACE</div><nav className="side-nav">{pages.map(({ href, label, icon: Icon }) => <Link onClick={() => setMenuOpen(false)} href={href} key={href} className={`nav-link ${locationActive === href ? 'is-active' : ''}`}><Icon size={18} /><span>{label}</span></Link>)}</nav><Link onClick={() => setMenuOpen(false)} href="/admin" className="nav-link admin-nav"><Shield size={17} /><span>관리자 메뉴</span></Link></div>
    <div className="app-main"><header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기"><Menu size={21} /></button><div className="breadcrumb"><span>플로버 봇</span><ChevronRight size={14} /><b>{pages.find(p => p.href === locationActive)?.label || (locationActive === '/admin' ? '관리자' : '멤버 등록')}</b></div><div className="topbar-right"><span className="topbar-heart"><Heart size={15} fill="currentColor" /></span><span>함께라서 더 좋은 하루</span><span className="top-avatar">f</span></div></header><main className="page-content page-enter">{children}</main><footer className="app-footer"><span>플로버 봇 · 독립 팬 커뮤니티 멤버십</span><span>카카오톡 미연동 · 비공식 서비스</span></footer></div>
  </div>;
}
function MemberOrRegister({ children }: { children: (member: Member) => ReactNode }) {
  const memberQuery = useGetMyMember({ query: { queryKey: getGetMyMemberQueryKey(), retry: false, refetchInterval: 30_000 } });
  if (memberQuery.isLoading) return <AppShell active="/dashboard"><LoadingBlock rows={5} /></AppShell>;
  if (memberQuery.isError) return <AppShell active="/dashboard"><QueryError text="멤버 정보를 확인하지 못했어요." retry={() => void memberQuery.refetch()} /></AppShell>;
  if (!memberQuery.data?.member) return <Redirect to="/register" />;
  return <>{children(memberQuery.data.member)}</>;
}
function DashboardPage() {
  const q = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), retry: false, refetchInterval: 30_000 } });
  const client = useQueryClient();
  const kakaoCode = useIssueKakaoLinkCode();
  const unlinkKakao = useUnlinkKakao();
  const refreshMember = () => { void client.invalidateQueries({ queryKey: getGetMyMemberQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); };
  return <Protected><MemberOrRegister>{member => <AppShell active="/dashboard"><QueryNotice isLoading={q.isLoading} isError={q.isError} refetch={() => void q.refetch()}>
    {q.data && <div className="dashboard">
          <div className="welcome-row"><div><p className="eyebrow">MY FLOVER LOGBOOK</p><h1>반가워요, {member.displayName}님 <Sparkles className="wave-mark" size={22} /></h1><p className="welcome-sub">오늘도 마음을 나누는 하루, 함께 기록해요.</p></div><div className="welcome-date"><span>오늘</span><b>{new Intl.DateTimeFormat('ko-KR', { dateStyle:'full', timeZone:'Asia/Seoul' }).format(new Date())}</b></div></div>
      <Panel className="member-banner"><div className="member-banner-main"><div className="member-emblem">f</div><div><span className="member-label">FLOVER MEMBER</span><h2>{member.displayName}</h2><p>멤버 번호 <b>{member.memberNumber}</b> <span className="dot-sep">·</span> 가입일 {fmt(member.joinedAt)}</p></div></div><div className="member-banner-side"><Tier tier={member.tier} /><span className="level-pill">LEVEL {member.level}</span><small>{member.exp.toLocaleString()} EXP 보유</small></div><Sparkles className="banner-sparkle" size={27} /></Panel>
      <div className="stats-grid"><Panel className="stat-card"><div className="stat-head"><span>현재 레벨</span><span className="stat-icon stat-pink"><Star size={17} /></span></div><div className="stat-value">Lv. {member.level}<small><Tier tier={member.tier} /></small></div><div className="stat-divider" /><div className="stat-foot"><span>{number(member.exp)} EXP</span><span>누적 {number(member.totalExp)} EXP</span></div></Panel>
        <Panel className="stat-card"><div className="stat-head"><span>커뮤니티 멤버</span><span className="stat-icon stat-peach"><Users size={17} /></span></div><div className="stat-value">{number(q.data.memberCount)}<small>명</small></div><div className="stat-foot">함께 기록하는 플로버</div></Panel>
        <Panel className="stat-card"><div className="stat-head"><span>오늘의 출석</span><span className="stat-icon stat-lilac"><CalendarDays size={17} /></span></div><div className="stat-value">{number(q.data.todayAttendanceCount)}<small>명</small></div><div className="stat-foot">{q.data.attendedToday ? <StatusPill tone="green">오늘 출석 완료</StatusPill> : <Link href="/attendance" className="inline-action">출석하러 가기 <ArrowRight size={13} /></Link>}</div></Panel>
      </div>
      <div className="dashboard-lower"><Panel className="leader-preview"><div className="panel-head"><div><p className="eyebrow">FLOVER RANKING</p><h3>이번 주의 응원 기록</h3></div><Link href="/leaderboard" className="panel-link">전체 랭킹 <ArrowRight size={14} /></Link></div>
        {q.data.topMembers.length ? <div className="mini-ranking">{q.data.topMembers.slice(0, 5).map((item, i) => <div className="mini-rank-row" key={item.memberNumber}><span className={`rank-number ${i < 3 ? 'rank-highlight' : ''}`}>{item.rank}</span><span className="mini-avatar">{item.displayName.slice(0,1)}</span><span className="mini-name">{item.displayName}</span><Tier tier={item.tier} /><span className="mini-exp">{number(item.totalExp)} EXP</span></div>)}</div> : <EmptyState title="아직 랭킹 기록이 없어요" detail="멤버들의 활동이 쌓이면 이곳에서 확인할 수 있어요." symbol={<Trophy size={20} />} />}
      </Panel>
      <div className="dashboard-side"><Panel className="kakao-status"><div className="panel-head"><div><p className="eyebrow">CONNECTION</p><h3>카카오 연동</h3></div><span className="kakao-icon"><MessageCircle size={18} /></span></div>{member.kakaoLinked ? <><div className="waiting-banner"><BadgeCheck size={16} /><b>카카오 연결됨</b></div><p>카카오톡 채널에서 &quot;출석&quot;을 입력하면 매일 자동으로 기록돼요.</p><Button kind="outline" className="button-wide" disabled={unlinkKakao.isPending} onClick={() => unlinkKakao.mutate(undefined, { onSuccess: refreshMember })}>{unlinkKakao.isPending ? '해제 중…' : '연동 해제'}</Button></> : <><div className="waiting-banner"><Clock3 size={16} /><b>{kakaoCode.data ? '연동 코드 발급됨' : '연결되지 않음'}</b></div>{kakaoCode.data ? <div className="link-code-box"><span>카카오톡 채널에 이렇게 보내 주세요</span><b className="link-code">연동 {kakaoCode.data.code}</b><small>이 코드는 계속 유효해요</small></div> : <p>카카오톡 채널에서 <b>!가입</b>을 입력하면 가입과 동시에 연동 코드를 받아요. 이 코드는 계속 그대로 쓸 수 있어요.</p>}<Button className="button-wide" disabled={kakaoCode.isPending} onClick={() => kakaoCode.mutate()}>{kakaoCode.isPending ? '불러오는 중…' : kakaoCode.data ? '내 연동 코드 보기' : '연동 코드 발급'}</Button>{kakaoCode.isError && <p className="form-error">코드를 발급하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}</>}</Panel>
        <Panel className="link-status"><div className="panel-head"><div><p className="eyebrow">MEMBER LINK</p><h3>오픈채팅 닉네임</h3></div><BadgeCheck size={19} className="subtle-icon" /></div><div className="nickname-row"><b>{member.openChatNickname || '등록된 닉네임 없음'}</b><StatusPill tone={member.linkStatus === 'verified' ? 'green' : 'amber'}>{member.linkStatus === 'verified' ? '확인 완료' : member.linkStatus === 'pending' ? '관리자 확인 대기' : '미연결'}</StatusPill></div><p>닉네임 연동은 관리자 확인 후 완료됩니다.</p></Panel></div></div>
      <div className="quick-links"><Link href="/attendance"><span className="quick-icon"><CalendarDays size={18} /></span><div><b>오늘 출석하기</b><small>하루의 응원을 기록해요</small></div><ArrowRight size={16} /></Link><Link href="/events"><span className="quick-icon quick-peach"><Gift size={18} /></span><div><b>이벤트 참여하기</b><small>참여 신청은 운영자가 검토해요</small></div><ArrowRight size={16} /></Link></div>
    </div>}
  </QueryNotice></AppShell>}</MemberOrRegister></Protected>;
}
function RegisterPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const member = useGetMyMember({ query: { queryKey: getGetMyMemberQueryKey(), enabled: !!isSignedIn, retry: false } });
  const reg = useRegisterMember();
  const client = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [ok, setOk] = useState(false);
  if (!isLoaded) return <div className="auth-loading"><div className="skeleton auth-skeleton" /></div>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (member.data?.member) return <Redirect to="/dashboard" />;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!displayName.trim() || !nickname.trim()) return;
    reg.mutate({ data: { displayName: displayName.trim(), openChatNickname: nickname.trim() } }, { onSuccess: async () => {
      setOk(true); await client.invalidateQueries({ queryKey: getGetMyMemberQueryKey() });
    } });
  };
  return <AppShell active="/register"><div className="register-page"><Link href="/dashboard" className="back-link"><ArrowRight className="back-arrow" size={15} /> 내 홈으로</Link><div className="register-head"><span className="register-illustration">f</span><p className="eyebrow">ONE-TIME MEMBER SETUP</p><h1>플로버 멤버로<br />첫 기록을 시작해요.</h1><p>표시 이름과 오픈채팅 닉네임을 입력해 주세요.<br />닉네임 연결은 관리자가 확인한 뒤 완료됩니다.</p></div>
      <Panel className="register-panel">{ok ? <div className="success-state"><CheckCircle2 size={35} /><h2>멤버 등록 요청을 보냈어요.</h2><p>등록 결과를 확인 중입니다. 멤버 홈으로 이동할 수 있어요.</p><Button onClick={() => { void client.invalidateQueries({ queryKey: getGetMyMemberQueryKey() }); }}>등록 상태 확인</Button></div> : <form onSubmit={submit} className="form-stack"><label>플로버 이름<span>서비스에서 보여질 이름</span><input data-testid="input-display-name" maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} required placeholder="예: 하늘" /></label><label>오픈채팅 닉네임<span>운영자가 확인할 때 사용할 닉네임</span><input data-testid="input-openchat-nickname" maxLength={40} value={nickname} onChange={e => setNickname(e.target.value)} required placeholder="오픈채팅에서 사용하는 이름" /></label><div className="form-note"><Shield size={15} /><span>계정은 현재 로그인한 Clerk 계정에 연결됩니다. 오픈채팅 연동은 아직 완료되지 않으며 관리자 확인이 필요합니다.</span></div>{reg.isError && <p className="form-error">등록을 완료하지 못했어요. 이미 등록된 계정인지 확인하거나 다시 시도해 주세요.</p>}<Button type="submit" disabled={reg.isPending || !displayName.trim() || !nickname.trim()} className="button-wide">{reg.isPending ? '등록 중…' : '멤버 등록하기'} <ArrowRight size={16} /></Button></form>}</Panel>
    </div></AppShell>;
}
function LeaderboardPage() {
  const q = useGetLeaderboard({ query: { queryKey: getGetLeaderboardQueryKey(), retry: false, refetchInterval: 30_000 } });
  return <Protected><MemberOrRegister>{() => <AppShell active="/leaderboard"><div className="page-heading"><p className="eyebrow">FLOVER LEADERBOARD</p><h1>함께 쌓아가는 응원</h1><p>누적 경험치를 기준으로 한 상위 10명의 기록이에요.</p></div><Panel className="ranking-panel"><div className="rank-panel-top"><div><span className="eyebrow">TOP 10 MEMBERS</span><h2>플로버 랭킹</h2></div><div className="ranking-crown"><Crown size={23} /></div></div><QueryNotice isLoading={q.isLoading} isError={q.isError} refetch={() => void q.refetch()}>{q.data?.length ? <div className="ranking-table"><div className="rank-table-head"><span>순위</span><span>멤버</span><span>등급</span><span>레벨</span><span>누적 EXP</span></div>{q.data.slice(0,10).map((m, idx) => <div className={`rank-table-row ${idx < 3 ? `podium-${idx+1}` : ''}`} key={m.memberNumber} data-testid={`row-ranking-${m.rank}`}><span className={`rank-position ${idx < 3 ? 'top-rank' : ''}`}>{idx === 0 ? <Crown size={16} /> : String(m.rank).padStart(2,'0')}</span><span className="rank-person"><span className={`rank-avatar rank-avatar-${idx % 4}`}>{m.displayName.slice(0,1)}</span><span><b>{m.displayName}</b><small>멤버 번호 {m.memberNumber}</small></span></span><Tier tier={m.tier} /><span className="rank-level">Lv. {m.level}</span><span className="rank-total">{number(m.totalExp)} <small>EXP</small></span></div>)}</div> : <EmptyState title="아직 공개된 랭킹이 없어요" detail="멤버 활동 기록이 쌓이면 상위 10명을 보여드릴게요." symbol={<Trophy size={21} />} />}</QueryNotice><div className="rank-footnote"><Shield size={14} /> 랭킹은 서버에서 제공하는 멤버 정보만 표시합니다.</div></Panel></AppShell>}</MemberOrRegister></Protected>;
}
function AttendancePage() {
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), retry: false, refetchInterval: 30_000 } });
  const records = useListMyAttendance({
    query: {
      queryKey: getListMyAttendanceQueryKey(),
      retry: false,
      enabled: !!dashboard.data?.currentMember,
    },
  });
  const claim = useClaimAttendance();
  const client = useQueryClient();
  return <Protected><MemberOrRegister>{member =>
    <AppShell active="/attendance">
      <div className="page-heading">
        <p className="eyebrow">DAILY FLOVER MOMENT</p>
        <h1>오늘도 함께했어요?</h1>
        <p>하루 한 번, 마음을 남기고 경험치를 받아요.</p>
      </div>
      <QueryNotice isLoading={dashboard.isLoading} isError={dashboard.isError} refetch={() => void dashboard.refetch()}>
        {dashboard.data && <div className="attendance-layout">
          <Panel className="attendance-card">
            <div className="attendance-date">
              <span className="date-overline">TODAY’S CHECK-IN</span>
              <b>{new Intl.DateTimeFormat('ko-KR', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date())}</b>
              <span>{member.displayName}님의 오늘 기록 · 한국 시간 기준</span>
            </div>
            <div className={`attendance-seal ${dashboard.data.attendedToday ? 'seal-done' : ''}`}>
              <span>{dashboard.data.attendedToday ? <Check size={39} /> : 'f'}</span>
              <b>{dashboard.data.attendedToday ? '출석 완료' : '함께한 하루'}</b>
              <small>{dashboard.data.attendedToday ? '오늘의 응원을 남겼어요' : '버튼을 눌러 오늘을 기록해요'}</small>
            </div>
            <div className="attendance-reward"><span><Zap size={16} /> 출석 보상</span><b>+50 EXP</b></div>
            {claim.isError && <p className="form-error centered">출석 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.</p>}
            {claim.isSuccess && <div className="inline-success"><CheckCircle2 size={16} /> 출석이 기록되었어요. +{number(claim.data.expGranted)} EXP</div>}
            <Button
              className="button-wide"
              disabled={dashboard.data.attendedToday || claim.isPending}
              onClick={() => claim.mutate(undefined, { onSuccess: async () => {
                await Promise.all([
                  client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
                  client.invalidateQueries({ queryKey: getGetMyMemberQueryKey() }),
                  client.invalidateQueries({ queryKey: getListMyAttendanceQueryKey() }),
                ]);
              } })}
            >
              {claim.isPending ? '기록 중…' : dashboard.data.attendedToday ? '오늘 출석은 완료했어요' : '오늘 출석 기록하기'}
              {!dashboard.data.attendedToday && <ArrowRight size={16} />}
            </Button>
            <p className="attendance-caveat">회원당 하루 한 번만 기록되며, 중복 요청으로 보상이 두 번 지급되지 않습니다.</p>
          </Panel>
          <Panel className="attendance-side">
            <div className="panel-head">
              <div><p className="eyebrow">YOUR ATTENDANCE</p><h3>내 출석 기록</h3></div>
              <CalendarDays size={18} className="subtle-icon" />
            </div>
            {records.isLoading ? <LoadingBlock rows={2} /> : records.isError
              ? <QueryError text="출석 이력을 불러오지 못했어요." retry={() => void records.refetch()} />
              : records.data?.length
                ? <div className="attendance-history-list">
                    {records.data.map(record => <div className="attendance-history-row" key={record.id}>
                      <span className="history-mark"><Check size={17} /></span>
                      <div><b>{record.attendanceDate}</b><small>{fmt(record.createdAt)}</small></div>
                      <strong>+{number(record.expGranted)} EXP</strong>
                    </div>)}
                  </div>
                : <EmptyState title="아직 출석 기록이 없어요" detail="오늘 출석을 남기면 여기에 표시됩니다." symbol={<Activity size={20} />} />}
            <div className="attendance-community">
              <span>오늘 출석한 플로버</span>
              <b>{number(dashboard.data.todayAttendanceCount)}<small>명</small></b>
              <span className="community-caption">커뮤니티 전체의 오늘 기록</span>
            </div>
          </Panel>
        </div>}
      </QueryNotice>
    </AppShell>
  }</MemberOrRegister></Protected>;
}
function EventsPage() {
  const events = useListEvents({ query: { queryKey: getListEventsQueryKey(), retry: false } });
  const claims = useListMyEventClaims({ query: { queryKey: getListMyEventClaimsQueryKey(), retry: false } });
  const mutation = useSubmitEventClaim();
  const client = useQueryClient();
  const [phrases, setPhrases] = useState<Record<number,string>>({});
  const [message, setMessage] = useState('');
  const busy = events.isLoading || claims.isLoading;
  const error = events.isError || claims.isError;
  const retry = () => { void events.refetch(); void claims.refetch(); };
  const submit = (eventId: number, phrase: string) => {
    setMessage('');
    mutation.mutate({ data: { eventId, phrase: phrase.trim() } }, { onSuccess: async () => {
      setPhrases(p => ({...p, [eventId]: ''})); setMessage('참여 신청을 보냈어요. 운영자 검토 후 상태가 업데이트됩니다.');
      await client.invalidateQueries({ queryKey: getListMyEventClaimsQueryKey() });
    } });
  };
  const claimByEvent = useMemo(() => new Map((claims.data || []).map(c => [c.eventId,c])), [claims.data]);
  return <Protected><MemberOrRegister>{() => <AppShell active="/events"><div className="page-heading"><p className="eyebrow">COMMUNITY EVENTS</p><h1>같이 만드는 순간</h1><p>진행 중인 이벤트를 확인하고, 참여 문구를 직접 제출해 주세요.</p></div><div className="manual-notice"><div className="notice-symbol"><Shield size={19} /></div><div><b>이벤트 참여는 멤버 수동 신청으로 접수됩니다.</b><p>제출된 참여 기록은 자동 승인되지 않으며, 관리자가 확인한 뒤 승인 또는 반려합니다.</p></div><StatusPill tone="amber">관리자 검토</StatusPill></div>{message && <div className="inline-success event-message"><CheckCircle2 size={16} /> {message}</div>}{mutation.isError && <p className="form-error">신청을 접수하지 못했어요. 내용을 확인하고 다시 시도해 주세요.</p>}<QueryNotice isLoading={busy} isError={error} refetch={retry}>{events.data && claims.data && <><div className="event-grid">{events.data.filter(event => event.active).map(event => {
    const submitted = claimByEvent.get(event.id);
    const val = phrases[event.id] ?? '';
    return <Panel className="event-card" key={event.id}><div className="event-card-top"><span className="event-time"><Clock3 size={14} /> {slotName[event.slot] || event.slot} · {event.eventTime}</span><StatusPill tone={submitted?.status === 'approved' ? 'green' : submitted?.status === 'rejected' ? 'red' : submitted ? 'amber' : 'pink'}>{submitted?.status === 'approved' ? '승인 완료' : submitted?.status === 'rejected' ? '반려' : submitted ? '검토 중' : '참여 가능'}</StatusPill></div><div className="event-art"><div className="event-art-stamp">FLOVER<br />MOMENT</div><Sparkles size={24} /></div><h2>{event.name}</h2><div className="event-info-row"><span>인정 문구</span><b>“{event.acceptedPhrase}”</b></div><div className="event-info-row"><span>참여 보상</span><b className="reward-value"><Zap size={14} /> {number(event.rewardExp)} EXP</b></div>{submitted ? <div className="claim-status"><div className="claim-stamp">{submitted.status === 'approved' ? <CheckCircle2 size={17} /> : submitted.status === 'rejected' ? <X size={17} /> : <Clock3 size={17} />}</div><div><b>{submitted.status === 'pending' ? '관리자 검토를 기다리고 있어요' : submitted.status === 'approved' ? '참여가 승인되었어요' : '참여가 반려되었어요'}</b><small>{submitted.reviewNote || `신청일 ${fmt(submitted.submittedAt)}`}</small></div></div> : <form className="event-submit" onSubmit={e => { e.preventDefault(); submit(event.id, val); }}><label htmlFor={`phrase-${event.id}`}>참여 문구 입력</label><div className="event-input-wrap"><input id={`phrase-${event.id}`} data-testid={`input-event-phrase-${event.id}`} value={val} maxLength={120} onChange={e => setPhrases(p => ({...p,[event.id]:e.target.value}))} placeholder="안내된 문구를 입력해 주세요" /><Button type="submit" disabled={!val.trim() || mutation.isPending}><ArrowRight size={16} /></Button></div><small>이벤트 시각 전후 5분 이내에 신청할 수 있으며, 운영자가 직접 검토합니다.</small></form>}</Panel>;
  })}</div>{events.data.filter(e => e.active).length === 0 && <Panel><EmptyState title="현재 진행 중인 이벤트가 없어요" detail="새 이벤트가 열리면 이곳에서 안내할게요." symbol={<Gift size={20} />} /></Panel>}<Panel className="claim-history"><div className="panel-head"><div><p className="eyebrow">MY SUBMISSIONS</p><h3>내 참여 신청</h3></div><span className="history-count">{claims.data.length}</span></div>{claims.data.length ? <div className="claim-list">{claims.data.map(c => <div className="claim-row" key={c.id}><span className="claim-event-icon"><Sparkles size={16} /></span><div className="claim-name"><b>{c.eventName}</b><small>{c.eventDate} · {fmt(c.submittedAt)} 신청</small></div><span className="claim-phrase">“{c.submittedPhrase}”</span><StatusPill tone={c.status === 'approved' ? 'green' : c.status === 'rejected' ? 'red' : 'amber'}>{c.status === 'approved' ? '승인' : c.status === 'rejected' ? '반려' : '검토 중'}</StatusPill></div>)}</div> : <EmptyState title="아직 신청한 이벤트가 없어요" detail="위에서 참여하고 싶은 이벤트를 신청해 주세요." symbol={<Gift size={19} />} />}</Panel></>}</QueryNotice></AppShell>}</MemberOrRegister></Protected>;
}
function AdminPage() {
  const [tab, setTab] = useState<'members'|'events'|'claims'|'attendance'|'logs'>('members');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const members = useListAdminMembers({ search: search || undefined }, { query: { queryKey: getListAdminMembersQueryKey({ search: search || undefined }), retry: false } });
  const attendance = useListAdminAttendance({ date: date || undefined }, { query: { queryKey: getListAdminAttendanceQueryKey({ date: date || undefined }), retry: false, enabled: tab === 'attendance' } });
  const claims = useListAdminEventClaims({ status: 'pending' }, { query: { queryKey: getListAdminEventClaimsQueryKey({ status: 'pending' }), retry: false, enabled: tab === 'claims' } });
  const logs = useListAdminLogs({ query: { queryKey: getListAdminLogsQueryKey(), retry: false, enabled: tab === 'logs' } });
  const events = useListEvents({ query: { queryKey: getListEventsQueryKey(), retry: false, enabled: tab === 'events' } });
  const updateMember = useUpdateAdminMember();
  const createEvent = useCreateAdminEvent();
  const updateEvent = useUpdateAdminEvent();
  const review = useReviewAdminEventClaim();
  const client = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const history = useGetAdminMemberHistory(historyId || 0, { query: { queryKey: getGetAdminMemberHistoryQueryKey(historyId || 0), enabled: !!historyId, retry: false } });
  const [eventForm, setEventForm] = useState<EventInput>({ name: '', slot: 'morning', acceptedPhrase: '', eventTime: '12:00', rewardExp: 100, active: true });
  const [editingEvent, setEditingEvent] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number,string>>({});
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const tabs = [{ id:'members' as const, label:'멤버', icon:Users }, { id:'events' as const, label:'이벤트 관리', icon:Sparkles }, { id:'claims' as const, label:'참여 검토', icon:CheckCircle2 }, { id:'attendance' as const, label:'출석 기록', icon:CalendarDays }, { id:'logs' as const, label:'관리 로그', icon:Activity }];
  const invalidate = async (...keys: readonly (readonly unknown[])[]) => { await Promise.all(keys.map(queryKey => client.invalidateQueries({ queryKey }))); };
  const dataLoading = tab === 'members' ? members.isLoading : tab === 'events' ? events.isLoading : tab === 'claims' ? claims.isLoading : tab === 'attendance' ? attendance.isLoading : logs.isLoading;
  const activeError = tab === 'members' ? members.isError : tab === 'events' ? events.isError : tab === 'claims' ? claims.isError : tab === 'attendance' ? attendance.isError : logs.isError;
  const retryActive = () => { if(tab==='members') void members.refetch(); if(tab==='events') void events.refetch(); if(tab==='claims') void claims.refetch(); if(tab==='attendance') void attendance.refetch(); if(tab==='logs') void logs.refetch(); };
  const currentAdminError = tab === 'members' ? members.error : tab === 'events' ? events.error : tab === 'claims' ? claims.error : tab === 'attendance' ? attendance.error : logs.error;
  return <Protected><AppShell active="/admin"><div className="admin-heading"><div><p className="eyebrow">FLOVER CONTROL ROOM</p><h1>관리자 관리 공간</h1><p>멤버와 참여 기록은 운영자 권한으로 확인하고 처리합니다.</p></div><span className="admin-lock"><Shield size={16} /> 운영자 권한 필요</span></div>
    <div className="admin-tabs">{tabs.map(({id,label,icon:Icon}) => <button key={id} onClick={() => { setTab(id); setActionError(''); setActionSuccess(''); }} className={`admin-tab ${tab===id?'tab-active':''}`}><Icon size={16} />{label}</button>)}</div>
    {actionError && <div className="admin-alert alert-error">{actionError}</div>}{actionSuccess && <div className="admin-alert alert-success"><CheckCircle2 size={16} />{actionSuccess}</div>}
    <QueryNotice isLoading={dataLoading} isError={!!activeError} refetch={retryActive} errorText={adminErrorText(currentAdminError)}>
    {tab==='members' && members.data && <div className="admin-content"><div className="admin-tools"><div><h2>멤버 디렉터리</h2><p>멤버의 연결 상태와 활동 이력을 확인합니다.</p></div><label className="search-field"><Search size={16} /><input data-testid="input-admin-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름 또는 멤버 번호 검색" /></label></div>{members.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>멤버</th><th>번호</th><th>채팅 닉네임</th><th>링크 상태</th><th>상태</th><th>작업</th></tr></thead><tbody>{members.data.map((m: Member) => <tr key={m.id}><td><b>{m.displayName}</b><small>Lv. {m.level} · {m.tier}</small></td><td>{m.memberNumber}</td><td>{m.openChatNickname || '—'}</td><td><StatusPill tone={m.linkStatus==='verified'?'green':m.linkStatus==='pending'?'amber':'neutral'}>{m.linkStatus==='verified'?'확인됨':m.linkStatus==='pending'?'대기':'미연결'}</StatusPill></td><td><StatusPill tone={m.status==='active'?'green':'red'}>{m.status==='active'?'활성':'비활성'}</StatusPill></td><td><div className="table-actions"><Button kind="outline" onClick={() => setSelected(selected===m.id?null:m.id)}>{selected===m.id?'닫기':'수정'}</Button><Button kind="ghost" onClick={() => setHistoryId(historyId===m.id?null:m.id)}>이력</Button></div>{selected===m.id && <MemberEdit member={m} busy={updateMember.isPending} onSave={data => updateMember.mutate({id:m.id,data},{onSuccess:async()=>{setSelected(null);setActionSuccess('멤버 정보를 업데이트했어요.');await invalidate(getListAdminMembersQueryKey({search:search||undefined}),getGetMyMemberQueryKey());},onError:()=>setActionError('멤버 정보를 업데이트하지 못했어요. 권한을 확인해 주세요.')})} />}</td></tr>)}</tbody></table></div> : <EmptyState title="조회된 멤버가 없어요" detail="검색어를 지우거나 다른 키워드를 입력해 주세요." symbol={<Users size={20} />} />}{historyId && <HistoryPanel history={history.data} loading={history.isLoading} error={history.isError} onRetry={() => void history.refetch()} />}</div>}
    {tab==='events' && events.data && <div className="admin-content"><div className="admin-tools"><div><h2>이벤트 일정</h2><p>새 일정 등록과 기존 일정 활성 상태를 관리합니다.</p></div></div><Panel className="admin-form-panel"><h3>{editingEvent ? '이벤트 수정' : '새 이벤트 등록'}</h3><EventForm value={eventForm} setValue={setEventForm} pending={createEvent.isPending || updateEvent.isPending} onCancel={editingEvent ? () => {setEditingEvent(null);setEventForm({name:'',slot:'morning',acceptedPhrase:'',eventTime:'12:00',rewardExp:100,active:true});} : undefined} onSubmit={() => {
      const onSuccess = async () => { setEditingEvent(null); setEventForm({name:'',slot:'morning',acceptedPhrase:'',eventTime:'12:00',rewardExp:100,active:true});setActionSuccess('이벤트 내용을 저장했어요.');await invalidate(getListEventsQueryKey()); };
      const onError = () => setActionError('이벤트를 저장하지 못했어요. 관리자 권한과 입력값을 확인해 주세요.');
      setActionError('');setActionSuccess('');
      if(editingEvent) updateEvent.mutate({id:editingEvent,data:eventForm},{onSuccess,onError}); else createEvent.mutate({data:eventForm},{onSuccess,onError});
    }} /></Panel><div className="admin-event-list">{events.data.length ? events.data.map(event => <Panel key={event.id} className="admin-event-row"><div><span className="event-time"><Clock3 size={13} /> {slotName[event.slot]} {event.eventTime}</span><h3>{event.name}</h3><p>인정 문구 “{event.acceptedPhrase}” · {number(event.rewardExp)} EXP</p></div><div className="table-actions"><StatusPill tone={event.active?'green':'neutral'}>{event.active?'진행 중':'비활성'}</StatusPill><Button kind="outline" onClick={() => {setEditingEvent(event.id);setEventForm({name:event.name,slot:event.slot,acceptedPhrase:event.acceptedPhrase,eventTime:event.eventTime,rewardExp:event.rewardExp,active:event.active});}}>편집</Button></div></Panel>) : <EmptyState title="등록된 이벤트가 없습니다" detail="위의 폼에서 첫 이벤트를 등록할 수 있어요." symbol={<Sparkles size={20} />} />}</div></div>}
    {tab==='claims' && claims.data && <div className="admin-content"><div className="admin-tools"><div><h2>참여 신청 검토</h2><p>멤버가 직접 제출한 참여 기록을 확인하고 결정합니다.</p></div><StatusPill tone="amber">{claims.data.length}건 대기</StatusPill></div>{claims.data.length ? <div className="review-list">{claims.data.map(c=><Panel className="review-card" key={c.id}><div className="review-card-head"><div><span className="eyebrow">{c.eventDate} · {slotName[c.slot]}</span><h3>{c.eventName}</h3></div><StatusPill tone="amber">검토 대기</StatusPill></div><div className="review-member"><span className="mini-avatar">{c.displayName.slice(0,1)}</span><b>{c.displayName}</b><span>#{c.memberNumber}</span><time>{fmt(c.submittedAt)} 신청</time></div><div className="submitted-phrase"><small>제출 문구</small><b>“{c.submittedPhrase}”</b></div><label className="review-note-label">검토 메모 <span>선택 입력</span><textarea maxLength={500} value={reviewNotes[c.id]||''} onChange={e=>setReviewNotes(s=>({...s,[c.id]:e.target.value}))} placeholder="처리 사유나 멤버에게 전달할 내용을 작성해 주세요" /></label><div className="review-actions"><Button kind="outline" disabled={review.isPending} onClick={()=>review.mutate({id:c.id,data:{decision:'rejected',note:reviewNotes[c.id]||''}},{onSuccess:async()=>{setActionSuccess('참여 신청을 반려했어요.');await invalidate(getListAdminEventClaimsQueryKey({status:'pending'}),getListMyEventClaimsQueryKey());},onError:()=>setActionError('처리할 수 없습니다. 관리자 권한을 확인해 주세요.')})}><X size={15} /> 반려</Button><Button disabled={review.isPending} onClick={()=>review.mutate({id:c.id,data:{decision:'approved',note:reviewNotes[c.id]||''}},{onSuccess:async()=>{setActionSuccess('참여 신청을 승인했어요.');await invalidate(getListAdminEventClaimsQueryKey({status:'pending'}),getListMyEventClaimsQueryKey(),getGetDashboardQueryKey());},onError:()=>setActionError('처리할 수 없습니다. 관리자 권한을 확인해 주세요.')})}><Check size={15} /> 승인</Button></div></Panel>)}</div> : <EmptyState title="검토할 신청이 없어요" detail="새로운 멤버 참여 신청이 도착하면 이곳에 표시됩니다." symbol={<CheckCircle2 size={20} />} />}</div>}
    {tab==='attendance' && attendance.data && <div className="admin-content"><div className="admin-tools"><div><h2>전체 출석 기록</h2><p>서버에 기록된 멤버 출석 내역입니다.</p></div><label className="date-filter">날짜 <input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label></div>{attendance.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>멤버</th><th>번호</th><th>출석일</th><th>획득 EXP</th><th>기록 시각</th></tr></thead><tbody>{attendance.data.map(r=><tr key={r.id}><td><b>{r.displayName}</b></td><td>{r.memberNumber}</td><td>{r.attendanceDate}</td><td>+{number(r.expGranted)} EXP</td><td>{fmt(r.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="출석 기록이 없습니다" detail={date ? '선택한 날짜의 기록이 없어요.' : '아직 서버에 등록된 출석 기록이 없어요.'} symbol={<CalendarDays size={20} />} />}</div>}
    {tab==='logs' && logs.data && <div className="admin-content"><div className="admin-tools"><div><h2>관리자 활동 로그</h2><p>관리 작업 내역은 API에서 제공하는 기록만 표시합니다.</p></div></div>{logs.data.length ? <div className="log-list">{logs.data.map(log=><div className="log-row" key={log.id}><span className="log-dot" /><div><b>{log.action}</b><p>{log.details}</p><small>{log.actor} · {log.target}</small></div><time>{fmt(log.createdAt)}</time></div>)}</div> : <EmptyState title="관리 로그가 없습니다" detail="관리 작업 기록이 등록되면 이곳에 표시됩니다." symbol={<Activity size={20} />} />}</div>}
    </QueryNotice>
    <div className="admin-access-note"><Shield size={15} /><span>관리자 API에서 권한이 거부되거나 설정되지 않은 경우, 오류 상태가 표시됩니다. 이 화면은 권한을 부여하거나 우회하지 않습니다.</span></div>
  </AppShell></Protected>;
}
function MemberEdit({ member, onSave, busy }: { member: Member; onSave: (data: { displayName: string; openChatNickname: string | null; linkStatus: 'unlinked'|'pending'|'verified'; status: 'active'|'inactive' }) => void; busy: boolean }) {
  const [displayName,setDisplayName]=useState(member.displayName);
  const [nickname,setNickname]=useState(member.openChatNickname||'');
  const [linkStatus,setLinkStatus]=useState<'unlinked'|'pending'|'verified'>(member.linkStatus);
  const [status,setStatus]=useState<'active'|'inactive'>(member.status);
  return <div className="member-edit"><input aria-label="표시 이름" value={displayName} maxLength={40} onChange={e=>setDisplayName(e.target.value)} /><input aria-label="오픈채팅 닉네임" value={nickname} maxLength={40} onChange={e=>setNickname(e.target.value)} placeholder="오픈채팅 닉네임" /><div className="edit-selects"><select aria-label="연동 상태" value={linkStatus} onChange={e=>setLinkStatus(e.target.value as typeof linkStatus)}><option value="unlinked">미연결</option><option value="pending">확인 대기</option><option value="verified">확인 완료</option></select><select aria-label="멤버 상태" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="active">활성</option><option value="inactive">비활성</option></select></div><Button disabled={busy || !displayName.trim()} onClick={()=>onSave({displayName:displayName.trim(),openChatNickname:nickname.trim()||null,linkStatus,status})}>{busy?'저장 중':'변경 저장'}</Button></div>;
}
function HistoryPanel({ history, loading, error, onRetry }: { history?: { attendance: {id:number;attendanceDate:string;expGranted:number;createdAt:string}[]; experience:{id:number;amount:number;reason:string;createdAt:string}[]; eventClaims:{id:number;eventName:string;status:string;submittedAt:string;reviewNote:string|null}[] }; loading:boolean; error:boolean; onRetry:()=>void }) {
  return <Panel className="member-history"><div className="panel-head"><div><p className="eyebrow">MEMBER HISTORY</p><h3>멤버 활동 이력</h3></div></div>{loading ? <LoadingBlock rows={2} /> : error ? <QueryError retry={onRetry} text="멤버 이력을 불러오지 못했어요." /> : history ? <div className="history-columns"><div><b>출석 기록</b>{history.attendance.length ? history.attendance.map(a=><p key={a.id}>{a.attendanceDate} · +{number(a.expGranted)} EXP</p>) : <small>출석 기록 없음</small>}</div><div><b>경험치 내역</b>{history.experience.length ? history.experience.map(e=><p key={e.id}>{e.reason} · {e.amount > 0 ? '+' : ''}{number(e.amount)} EXP</p>) : <small>경험치 내역 없음</small>}</div><div><b>이벤트 신청</b>{history.eventClaims.length ? history.eventClaims.map(c=><p key={c.id}>{c.eventName} · {c.status}</p>) : <small>이벤트 신청 없음</small>}</div></div> : <EmptyState title="활동 이력이 없습니다" detail="이 멤버의 이력이 표시됩니다." />}</Panel>;
}
function EventForm({ value,setValue,pending,onSubmit,onCancel }: { value:EventInput; setValue:(value:EventInput)=>void; pending:boolean; onSubmit:()=>void; onCancel?:()=>void }) {
  return <form className="admin-event-form" onSubmit={e=>{e.preventDefault();onSubmit();}}><label>이벤트 이름<input value={value.name} maxLength={80} required onChange={e=>setValue({...value,name:e.target.value})} placeholder="예: 라이브 시청 인증" /></label><label>참여 문구<input value={value.acceptedPhrase} maxLength={120} required onChange={e=>setValue({...value,acceptedPhrase:e.target.value})} placeholder="멤버가 제출할 인정 문구" /></label><div className="event-form-row"><label>시간대<select value={value.slot} onChange={e=>setValue({...value,slot:e.target.value as EventInput['slot']})}><option value="morning">오전</option><option value="afternoon">오후</option><option value="midnight">자정</option></select></label><label>이벤트 시간<input type="time" value={value.eventTime} required onChange={e=>setValue({...value,eventTime:e.target.value})} /></label><label>보상 EXP<input type="number" min={1} max={10000} value={value.rewardExp} onChange={e=>setValue({...value,rewardExp:Number(e.target.value)})} /></label></div><label className="check-label"><input type="checkbox" checked={value.active} onChange={e=>setValue({...value,active:e.target.checked})} /> 이벤트 활성화</label><div className="event-form-actions">{onCancel && <Button kind="outline" onClick={onCancel}>취소</Button>}<Button type="submit" disabled={pending || !value.name.trim() || !value.acceptedPhrase.trim()}>{pending?'저장 중':'이벤트 저장'} <Check size={15} /></Button></div></form>;
}
function AuthRouter() {
  const [, setLocation] = useLocation();
  const clerkLocalization = {
    signIn: { start: { title: '다시 만나 반가워요', subtitle: '로그인하고 플로버 기록을 이어가세요' } },
    signUp: { start: { title: '플로버 계정을 만들어요', subtitle: '가입 후 멤버 정보를 등록할 수 있어요' } },
  };
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={clerkLocalization} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <ClerkQueryClientCacheInvalidator />
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/leaderboard" component={LeaderboardPage} />
      <Route path="/attendance" component={AttendancePage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  </ClerkProvider>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><RoutedErrorBoundary><AuthRouter /></RoutedErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
