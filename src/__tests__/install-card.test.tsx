import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallCard } from '../features/companion/InstallCard';

type MatchMediaMock = MediaQueryList & { emit: (matches: boolean) => void };

let displayModeMatches = false;
let matchMediaMock: ReturnType<typeof vi.fn>;

function setUserAgent(value: string, touchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchPoints });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  displayModeMatches = false;
  setUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36');
  matchMediaMock = vi.fn((query: string): MatchMediaMock => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const media = {
      media: query,
      matches: displayModeMatches && query === '(display-mode: standalone)',
      onchange: null,
      addEventListener: (_: 'change', listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: 'change', listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      dispatchEvent: () => true,
      emit: (matches: boolean) => listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent)),
    } as MatchMediaMock;
    return media;
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMediaMock });
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InstallCard', () => {
  it('hides for a locally recorded install or standalone display mode', () => {
    localStorage.setItem('teuksae:pwa-installed', 'true');
    const first = render(<InstallCard />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    first.unmount();
    localStorage.clear();
    displayModeMatches = true;
    render(<InstallCard />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('opens the captured native install prompt exactly once per click and does not claim install on acceptance', async () => {
    const user = userEvent.setup();
    let resolveChoice!: (choice: { outcome: 'accepted' }) => void;
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<InstallCard />);
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' }> };
    event.prompt = prompt;
    event.userChoice = new Promise((resolve) => { resolveChoice = resolve; });
    await act(async () => { window.dispatchEvent(event); });

    const button = await screen.findByRole('button', { name: '홈 화면에 추가' });
    await user.click(button);
    await user.click(button);
    expect(prompt).toHaveBeenCalledOnce();
    await act(async () => { resolveChoice({ outcome: 'accepted' }); });
    expect(screen.getByRole('complementary')).toBeVisible();
    expect(screen.queryByText(/설치되었/)).not.toBeInTheDocument();
  });

  it('consumes the single-use native event and offers manual help after cancellation', async () => {
    const user = userEvent.setup();
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'dismissed' }> };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    render(<InstallCard />);
    await act(async () => { window.dispatchEvent(event); });
    await user.click(await screen.findByRole('button', { name: '홈 화면에 추가' }));
    expect(await screen.findByRole('status')).toHaveTextContent('설치는 취소되었어요');
    expect(screen.getByRole('button', { name: '설치 방법 보기' })).toBeEnabled();
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('hides and persists only when appinstalled fires', async () => {
    render(<InstallCard />);
    await act(async () => { window.dispatchEvent(new Event('appinstalled')); });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(localStorage.getItem('teuksae:pwa-installed')).toBe('true');
  });

  it('shows iOS Safari instructions without marking the app installed', async () => {
    const user = userEvent.setup();
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 5);
    render(<InstallCard />);
    await user.click(screen.getByRole('button', { name: '홈 화면에 추가' }));
    expect(screen.getByRole('status')).toHaveTextContent('공유 버튼');
    expect(localStorage.getItem('teuksae:pwa-installed')).toBeNull();
    expect(screen.getByRole('complementary')).toBeVisible();
  });
});

it('shows install again when browser eligibility proves a stored installed flag is stale', async () => {
 localStorage.setItem('teuksae:pwa-installed','true');render(<InstallCard />);
 expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
 const event=Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt:vi.fn().mockResolvedValue(undefined),userChoice:Promise.resolve({outcome:'dismissed'})});
 await act(async()=>{window.dispatchEvent(event);});
 expect(screen.getByRole('button',{name:'홈 화면에 추가'})).toBeVisible();
 expect(localStorage.getItem('teuksae:pwa-installed')).toBeNull();
});
it('does not mistake ordinary browser fullscreen for an installed app',()=>{
 Object.defineProperty(window,'matchMedia',{configurable:true,value:(query:string)=>({matches:query==='(display-mode: fullscreen)',addEventListener:vi.fn(),removeEventListener:vi.fn()})});
 render(<InstallCard />);expect(screen.getByRole('complementary')).toBeVisible();
 expect(localStorage.getItem('teuksae:pwa-installed')).toBeNull();
});
it('still renders and allows session dismissal when storage getters are blocked',async()=>{
 vi.spyOn(window,'localStorage','get').mockImplementation(()=>{throw new DOMException('blocked','SecurityError');});
 vi.spyOn(window,'sessionStorage','get').mockImplementation(()=>{throw new DOMException('blocked','SecurityError');});
 const user=userEvent.setup();render(<InstallCard />);
 expect(screen.getByRole('complementary')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'이번에는 닫기'}));
 expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

it('recovers when the native prompt never appears and ignores its late result', async () => {
 vi.useFakeTimers();
 try {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const event = Object.assign(new Event('beforeinstallprompt', {cancelable:true}), {
   prompt: vi.fn(() => pending),
   userChoice: Promise.resolve({outcome:'dismissed' as const}),
  });
  render(<InstallCard />);
  await act(async()=>{window.dispatchEvent(event);});
  await act(async()=>{screen.getByRole('button',{name:'홈 화면에 추가'}).click();});
  expect(screen.getByRole('button',{name:'설치 창 여는 중…'})).toBeDisabled();
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(screen.getByRole('button',{name:'설치 방법 보기'})).toBeEnabled();
  expect(screen.getByText(/설치 창을 확인하지 못했어요/)).toBeVisible();
  expect(screen.getByText(/브라우저에 따라 메뉴 이름/)).toBeVisible();
  await act(async()=>{finish();});
  expect(screen.queryByText(/설치는 취소되었어요/)).not.toBeInTheDocument();
  expect(localStorage.getItem('teuksae:pwa-installed')).toBeNull();
  expect(event.prompt).toHaveBeenCalledOnce();
 } finally { cleanup();vi.useRealTimers(); }
});
it('waits beyond ten seconds for a choice after the native prompt appears', async () => {
 vi.useFakeTimers();
 try {
  let choose!: (choice: { outcome: 'dismissed' }) => void;
  const event = Object.assign(new Event('beforeinstallprompt', {cancelable:true}), {
   prompt: vi.fn().mockResolvedValue(undefined),
   userChoice: new Promise<{ outcome: 'dismissed' }>(resolve => { choose = resolve; }),
  });
  render(<InstallCard />);
  await act(async()=>{window.dispatchEvent(event);});
  await act(async()=>{screen.getByRole('button',{name:'홈 화면에 추가'}).click(); await Promise.resolve();});
  expect(vi.getTimerCount()).toBe(0);
  await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
  expect(screen.getByRole('button',{name:'설치 창 여는 중…'})).toBeDisabled();
  expect(screen.queryByText(/설치 창을 확인하지 못했어요/)).not.toBeInTheDocument();
  await act(async()=>{choose({outcome:'dismissed'});});
  expect(screen.getByText(/설치는 취소되었어요/)).toBeVisible();
  expect(event.prompt).toHaveBeenCalledOnce();
 } finally { cleanup();vi.useRealTimers(); }
});
it('cleans up a pending prompt watchdog on unmount',async()=>{
 vi.useFakeTimers();
 try {
  const view=render(<InstallCard/>);
  const event=Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt:()=>new Promise<void>(()=>{}),userChoice:new Promise(()=>{})});
  await act(async()=>{window.dispatchEvent(event);});
  await act(async()=>{screen.getByRole('button',{name:'홈 화면에 추가'}).click();});
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
 } finally { vi.useRealTimers(); }
});
