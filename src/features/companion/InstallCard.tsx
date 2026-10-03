import { useEffect, useRef, useState } from 'react';
import './InstallCard.css';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

const PROMPT_TIMEOUT_MS = 10000;
const INSTALLED_KEY = 'teuksae:pwa-installed';
const DISMISSED_KEY = 'teuksae:pwa-install-card-dismissed';
const appDisplayModes = ['(display-mode: standalone)'];

function readStorage(storage: 'localStorage' | 'sessionStorage', key: string): boolean {
  try {
    return window[storage].getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeStorage(storage: 'localStorage' | 'sessionStorage', key: string): void {
  try {
    window[storage].setItem(key, 'true');
  } catch {
    // Private browsing or browser policy can block storage. The card still works this visit.
  }
}

function isIosBrowser(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  return /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

function isRunningAsApp(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return appDisplayModes.some((query) => window.matchMedia?.(query).matches);
}

export function InstallCard() {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === 'undefined') return true;
    return readStorage('localStorage', INSTALLED_KEY) || isRunningAsApp() || readStorage('sessionStorage', DISMISSED_KEY);
  });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const [notice, setNotice] = useState('');
  const promptLock = useRef(false);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptEpoch = useRef(0);
  const ios = typeof navigator !== 'undefined' && isIosBrowser();

  useEffect(() => {
    const epochRef = promptEpoch;
    const timerRef = promptTimer;
    const markInstalled = () => {
      promptEpoch.current++;
      if (promptTimer.current) clearTimeout(promptTimer.current);
      writeStorage('localStorage', INSTALLED_KEY);
      setHidden(true);
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!isRunningAsApp()) {
        try { window.localStorage.removeItem(INSTALLED_KEY); } catch { /* Storage can be blocked. */ }
        setHidden(readStorage('sessionStorage', DISMISSED_KEY));
      }
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setNotice('');
    };
    const mediaQueries = appDisplayModes.map((query) => window.matchMedia?.(query)).filter((media): media is MediaQueryList => Boolean(media));
    const onDisplayModeChange = () => {
      if (isRunningAsApp()) markInstalled();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', markInstalled);
    for (const media of mediaQueries) {
      if (media.addEventListener) media.addEventListener('change', onDisplayModeChange);
      else media.addListener(onDisplayModeChange);
    }
    if (isRunningAsApp()) markInstalled();

    return () => {
      epochRef.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', markInstalled);
      for (const media of mediaQueries) {
        if (media.removeEventListener) media.removeEventListener('change', onDisplayModeChange);
        else media.removeListener(onDisplayModeChange);
      }
    };
  }, []);

  const dismiss = () => {
    writeStorage('sessionStorage', DISMISSED_KEY);
    setHidden(true);
  };

  const requestInstall = async () => {
    if (!deferredPrompt || promptLock.current) return;
    promptLock.current = true;
    setIsPrompting(true);
    setNotice('');
    const epoch = ++promptEpoch.current;
    const event = deferredPrompt;
    try {
      await Promise.race([
        event.prompt(),
        new Promise<never>((_, reject) => {
          promptTimer.current = setTimeout(() => reject(new Error('install-timeout')), PROMPT_TIMEOUT_MS);
        }),
      ]);
      if (promptTimer.current) clearTimeout(promptTimer.current);
      promptTimer.current = null;
      const choice = await event.userChoice;
      if (epoch !== promptEpoch.current) return;
      if (choice.outcome === 'dismissed') setNotice('설치는 취소되었어요. 다시 설치하려면 브라우저 메뉴를 이용하거나 페이지를 새로고침해주세요.');
      // An accepted choice is not confirmation of installation. appinstalled is the source of truth.
    } catch {
      if (epoch !== promptEpoch.current) return;
      setNotice('설치 창을 확인하지 못했어요. 브라우저 메뉴에서 홈 화면에 추가해 주세요.');
      setShowInstructions(true);
    } finally {
      if (epoch === promptEpoch.current) {
        if (promptTimer.current) clearTimeout(promptTimer.current);
        promptTimer.current = null;
        // Native events are single-use; late settlement cannot replace fallback feedback.
        setDeferredPrompt(current => current === event ? null : current);
        promptLock.current = false;
        setIsPrompting(false);
      }
    }
  };

  if (hidden) return null;

  const hasNativePrompt = deferredPrompt !== null && !ios;
  return (
    <aside className="tc-install-card" aria-labelledby="tc-install-card-title">
      <div>
        <p className="tc-install-card__eyebrow">가을특별새벽부흥회</p>
        <h2 id="tc-install-card-title">우리 특새를 홈 화면에</h2>
        <p className="tc-install-card__copy">앱처럼 빠르게 열고, 예배 전 안내를 바로 확인하세요.</p>
      </div>
      <div className="tc-install-card__actions">
        {hasNativePrompt ? (
          <button className="tc-install-card__primary" type="button" onClick={() => void requestInstall()} disabled={isPrompting}>
            {isPrompting ? '설치 창 여는 중…' : '홈 화면에 추가'}
          </button>
        ) : (
          <button className="tc-install-card__primary" type="button" onClick={() => setShowInstructions((open) => !open)} aria-expanded={showInstructions}>
            {ios ? '홈 화면에 추가' : '설치 방법 보기'}
          </button>
        )}
        <button className="tc-install-card__dismiss" type="button" onClick={dismiss}>이번에는 닫기</button>
      </div>
      {showInstructions && (
        <div className="tc-install-card__instructions" role="status">
          {ios ? 'Safari에서 공유 버튼을 누른 뒤 “홈 화면에 추가”, “추가”를 차례로 선택해 주세요.' : '브라우저 메뉴에서 “설치” 또는 “홈 화면에 추가”를 선택해 주세요. 브라우저에 따라 메뉴 이름이 다를 수 있어요.'}
        </div>
      )}
      {notice && <p className="tc-install-card__notice" role="status">{notice}</p>}
    </aside>
  );
}
