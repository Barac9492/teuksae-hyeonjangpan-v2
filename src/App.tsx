import { useEffect, useMemo, useState } from "react";
import type { AppRepository } from "./data/AppRepository";
import { LocalAppRepository } from "./data/LocalAppRepository";
import type { RepositoryStatus } from "./data/remote/types";
import type { RuntimeBackendConfig } from "./data/runtime";
import type { AppConfig } from "./domain/config";
import type { MomentDraft, VenueId, VenueState } from "./domain/types";
import { DailyPracticeView } from "./features/daily-practice/DailyPracticeView";
import { Header, type AppView } from "./features/header/Header";
import { BottomNavigation } from "./features/navigation/BottomNavigation";
import { CommunityView } from "./features/community/CommunityView";
import { useCommunityJournal } from "./features/community/communityJournal";
import { OperatorView } from "./features/operator/OperatorView";
import { Toast } from "./features/toast/Toast";
import { TodayAfterView } from "./features/today-after/TodayAfterView";
import { TodayBeforeView } from "./features/today-before/TodayBeforeView";
import { WeekSummaryView } from "./features/week-summary/WeekSummaryView";

interface AppProps {
  config: AppConfig;
  repository?: AppRepository;
  runtime?: RuntimeBackendConfig;
}

type DemoPhase = "before" | "after";

export default function App({ config, repository, runtime }: AppProps) {
  const repo = useMemo<AppRepository>(
    () => repository ?? new LocalAppRepository(config),
    [config, repository],
  );

  const [snapshot, setSnapshot] = useState(repo.getSnapshot());
  const [status, setStatus] = useState<RepositoryStatus>(repo.getStatus());
  const [activeView, setActiveView] = useState<AppView>("today");
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("before");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const journal = useCommunityJournal();

  useEffect(() => {
    const unsubscribeSnapshot = repo.subscribe(setSnapshot);
    const unsubscribeStatus = repo.subscribeStatus(setStatus);
    return () => {
      unsubscribeSnapshot();
      unsubscribeStatus();
    };
  }, [repo]);

  useEffect(() => {
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const showToast = (message: string): void => {
    setToastMessage(message);
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 4000);
  };

  const handleAttendance = async (
    field: "today" | "tomorrow",
    next: boolean,
  ): Promise<void> => {
    try {
      if (field === "today") {
        await repo.setAttendanceToday(next);
      } else {
        await repo.setTomorrowAttendance(next);
      }
      showToast(
        next
          ? field === "today"
            ? "오늘 참석으로 표시했습니다."
            : "내일 참석 예정으로 표시했습니다."
          : "참석 표시를 취소했습니다.",
      );
    } catch {
      showToast("공유 상태를 바꾸지 못했습니다. 이전 상태를 유지합니다.");
    }
  };

  const handleSelectVenue = async (venueId: VenueId): Promise<void> => {
    try {
      await repo.selectVenue(venueId);
      showToast(
        venueId === "online"
          ? "온라인 예배로 선택했습니다."
          : "참석 장소를 선택했습니다.",
      );
    } catch {
      showToast("공유 참석 장소를 바꾸지 못했습니다. 이전 상태를 유지합니다.");
    }
  };

  const handleTogglePracticeToday = (): void => {
    if (!snapshot.practice.selectedAction) {
      setActiveView("today");
      if (config.demoMode) {
        setDemoPhase("after");
      }
      showToast("먼저 오늘 실천을 선택해 주세요.");
      return;
    }

    repo.togglePracticeCompleted(config.todayIndex);
    const wasDone = snapshot.practice.completedDayIndexes.includes(
      config.todayIndex,
    );
    showToast(
      wasDone
        ? "오늘 실천 완료를 취소했습니다."
        : "오늘 실천을 완료로 기록했습니다.",
    );
  };

  const handleSetVenueState = async (
    venueId: VenueId,
    nextState: VenueState,
  ): Promise<void> => {
    try {
      await repo.setVenueState(
        venueId,
        nextState,
        repo.mode === "local" ? "운영자 로컬" : "운영자",
      );
      showToast(
        repo.mode === "remote"
          ? "공유 장소 상태를 반영했습니다."
          : "장소 상태를 로컬 리허설에 반영했습니다.",
      );
    } catch {
      showToast("공유 장소 상태는 변경되지 않았습니다.");
    }
  };

  const official = Boolean(
    config.officialApproved &&
      runtime?.mode === "production" &&
      repo.mode === "remote" &&
      status.officialApproved === true,
  );

  return (
    <div className="app-root">
      <Header
        appName={config.appName}
        churchName={config.churchName}
        activeView={activeView}
        online={online}
        official={official}
        status={status}
        onChangeView={setActiveView}
      />

      {config.demoMode && activeView === "today" && (
        <div className="demo-bar">
          <div className="shell demo-inner">
            <p className="demo-copy">
              운영 리허설에서 예배 전/후 화면을 전환합니다.
            </p>
            <div
              className="phase-switch"
              role="group"
              aria-label="예배 전후 전환"
            >
              <button
                type="button"
                className={demoPhase === "before" ? "active" : ""}
                onClick={() => setDemoPhase("before")}
              >
                {config.phaseLabels.before}
              </button>
              <button
                type="button"
                className={demoPhase === "after" ? "active" : ""}
                onClick={() => setDemoPhase("after")}
              >
                {config.phaseLabels.after}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="shell app-main" id="main-content">
        {activeView === "today" &&
          (!config.demoMode || demoPhase === "before") && (
            <TodayBeforeView
              config={config}
              snapshot={snapshot}
              onToggleTodayAttendance={() =>
                void handleAttendance("today", !snapshot.attendance.today)
              }
              onToggleTomorrowAttendance={() =>
                void handleAttendance("tomorrow", !snapshot.attendance.tomorrow)
              }
              onSelectVenue={(venueId) => void handleSelectVenue(venueId)}
              repositoryMode={repo.mode}
            />
          )}

        {activeView === "we" && (
          <CommunityView
            config={config}
            snapshot={snapshot}
            journal={journal}
            official={official}
            onCreateMomentDraft={(draft: MomentDraft) =>
              repo.addMomentDraft(draft)
            }
            onUploadMoment={repo.uploadMoment?.bind(repo)}
            repositoryMode={repo.mode}
            connected={
              repo.mode === "remote" &&
              status.phase !== "offline" &&
              status.phase !== "error"
            }
            onToast={showToast}
          />
        )}

        {activeView === "today" && config.demoMode && demoPhase === "after" && (
          <TodayAfterView
            config={config}
            snapshot={snapshot}
            onSelectPracticeAction={(value) => repo.setPracticeAction(value)}
            onWordNoteChange={(value) => repo.setWordNote(value)}
            onPrayerNoteChange={(value) => repo.setPrayerNote(value)}
          />
        )}

        {activeView === "daily" && (
          <DailyPracticeView
            config={config}
            snapshot={snapshot}
            onToggleTodayPractice={handleTogglePracticeToday}
          />
        )}

        {activeView === "week" && (
          <WeekSummaryView config={config} snapshot={snapshot} />
        )}

        {activeView === "operator" && (
          <OperatorView
            snapshot={snapshot}
            repository={repo}
            onSetVenueState={handleSetVenueState}
            onToast={showToast}
          />
        )}
      </main>

      <BottomNavigation activeView={activeView} onChangeView={setActiveView} />
      <Toast message={toastMessage} visible={toastVisible} />
    </div>
  );
}
