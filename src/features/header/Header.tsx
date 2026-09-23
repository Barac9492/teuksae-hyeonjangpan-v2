import type { ReactNode } from "react";
import type { RepositoryStatus } from "../../data/remote/types";

export type AppView = "today" | "we" | "daily" | "week" | "operator";

interface HeaderProps {
  appName: string;
  churchName: string;
  activeView: AppView;
  online: boolean;
  official: boolean;
  status: RepositoryStatus;
  onChangeView: (view: AppView) => void;
  trailing?: ReactNode;
}

const VIEWS: Array<{ id: AppView; label: string }> = [
  { id: "today", label: "오늘" },
  { id: "we", label: "우리" },
  { id: "daily", label: "일새" },
  { id: "week", label: "주간" },
  { id: "operator", label: "운영" },
];

const STATUS_LABEL: Record<RepositoryStatus["phase"], string> = {
  local: "로컬 리허설",
  connecting: "서버 연결 중",
  connected: "서버 연결됨",
  syncing: "동기화 중",
  offline: "오프라인",
  error: "연결 오류",
};

export function Header({
  appName,
  churchName,
  activeView,
  online,
  official,
  status,
  onChangeView,
  trailing,
}: HeaderProps) {
  const phase = !online && status.phase !== "local" ? "offline" : status.phase;

  return (
    <header className="top-header">
      <div className="shell top-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            새
          </div>
          <div>
            <h1>{appName}</h1>
            <small>
              {churchName} {official ? "공식 안내" : "비공식 운영 리허설"}
            </small>
          </div>
        </div>

        <nav className="desktop-nav" aria-label="주요 메뉴">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={activeView === view.id ? "active" : ""}
              onClick={() => onChangeView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="status-group">
          <span
            className={`online-badge ${phase === "connected" ? "is-online" : "is-offline"}`}
            role="status"
          >
            {STATUS_LABEL[phase]}
            {status.queuedMutations > 0
              ? ` · 대기 ${status.queuedMutations}건`
              : ""}
          </span>
          {trailing}
        </div>
      </div>

      {status.message && (
        <p className="offline-warning shell" role="status">
          {status.message}
        </p>
      )}
    </header>
  );
}
