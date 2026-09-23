import { useEffect, useState } from "react";
import type { AppRepository } from "../../data/AppRepository";
import type {
  MomentSubmission,
  OperatorSession,
} from "../../data/remote/types";
import { formatUpdatedLabel, VENUE_STATE_LABELS } from "../../domain/venue";
import type { AppSnapshot, VenueId, VenueState } from "../../domain/types";

const ALL_STATES: VenueState[] = [
  "preparing",
  "open",
  "recommended",
  "busy",
  "full",
  "checking",
];

interface InteractionTiming {
  id: string;
  venueName: string;
  state: VenueState;
  elapsedSeconds: string;
}

interface OperatorViewProps {
  snapshot: AppSnapshot;
  repository: AppRepository;
  onSetVenueState: (venueId: VenueId, state: VenueState) => Promise<void>;
  onToast: (message: string) => void;
}

export function OperatorView({
  snapshot,
  repository,
  onSetVenueState,
  onToast,
}: OperatorViewProps) {
  const [session, setSession] = useState<OperatorSession>(
    repository.getOperatorSession?.() ?? {
      access: repository.mode === "local" ? "operator" : "checking",
    },
  );
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [moments, setMoments] = useState<MomentSubmission[]>([]);
  const [interactionTimings, setInteractionTimings] = useState<
    InteractionTiming[]
  >([]);

  useEffect(() => {
    if (repository.mode === "remote") {
      void repository.refreshOperatorSession?.().then(setSession);
    }
  }, [repository]);

  useEffect(() => {
    if (session.access === "operator") {
      void repository
        .listPendingMoments?.()
        .then(setMoments)
        .catch(() => setMoments([]));
    }
  }, [repository, session.access]);

  const handleMagicLink = async (): Promise<void> => {
    try {
      await repository.sendMagicLink?.(email);
      setLinkSent(true);
    } catch {
      onToast("로그인 링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  const handleLogout = async (): Promise<void> => {
    await repository.signOutOperator?.();
    setSession({ access: "logged_out" });
  };

  const handleStateClick = async (
    venueId: VenueId,
    venueName: string,
    state: VenueState,
  ): Promise<void> => {
    const start = performance.now();
    await onSetVenueState(venueId, state);
    if (repository.mode === "local") {
      const elapsedSeconds = ((performance.now() - start) / 1000).toFixed(3);
      setInteractionTimings((current) => [
        {
          id: `${venueId}-${Date.now()}`,
          venueName,
          state,
          elapsedSeconds,
        },
        ...current,
      ]);
    }
  };

  const reviewMoment = async (
    item: MomentSubmission,
    status: "approved" | "rejected",
  ): Promise<void> => {
    try {
      await repository.reviewMoment?.(item.id, status, "");
      setMoments((current) =>
        current.filter((moment) => moment.id !== item.id),
      );
      onToast(
        status === "approved"
          ? "승인으로 기록했습니다. 자동 공개되지는 않습니다."
          : "반려로 기록했습니다.",
      );
    } catch {
      onToast("검수 상태를 바꾸지 못했습니다.");
    }
  };

  if (repository.mode === "remote" && session.access === "checking") {
    return (
      <section className="page-intro">
        <h2>운영 권한 확인 중</h2>
      </section>
    );
  }

  if (repository.mode === "remote" && session.access === "logged_out") {
    return (
      <section className="operator-wrap">
        <div>
          <p className="eyebrow">운영자 로그인</p>
          <h2>이메일 매직 링크</h2>
          <p>
            승인된 운영자 이메일만 장소 상태와 검수 화면에 접근할 수 있습니다.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleMagicLink();
            }}
          >
            <label>
              운영자 이메일
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button className="solid" type="submit">
              로그인 링크 보내기
            </button>
          </form>
          {linkSent && (
            <p role="status">이메일에서 로그인 링크를 확인해 주세요.</p>
          )}
        </div>
      </section>
    );
  }

  if (repository.mode === "remote" && session.access === "denied") {
    return (
      <section className="operator-warning" role="alert">
        <h2>운영 권한 없음</h2>
        <p>{session.email} 계정은 운영자 명단에 없습니다.</p>
        <button type="button" onClick={() => void handleLogout()}>
          로그아웃
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">운영 화면</p>
          <h2>현장 상태 변경</h2>
        </div>
        <p>
          {repository.mode === "remote"
            ? "모든 변경은 공유 서버의 불변 감사 로그에 남습니다."
            : "현재 기기에서만 보이는 운영 리허설입니다."}
        </p>
        {repository.mode === "remote" && (
          <button type="button" onClick={() => void handleLogout()}>
            로그아웃
          </button>
        )}
      </section>

      {repository.mode === "local" && (
        <p className="operator-warning" role="alert">
          로컬 모드 경고: 공유 상태는 변경되지 않습니다.
        </p>
      )}

      <section className="operator-wrap">
        <div className="op-list">
          {snapshot.venues.map((venue) => (
            <article key={venue.id} className="op-venue">
              <div className="op-head">
                <strong>{venue.name}</strong>
                <span className={`badge ${venue.state}`}>
                  {VENUE_STATE_LABELS[venue.state]}
                </span>
              </div>
              <p className="op-meta">
                {formatUpdatedLabel(venue.updatedAt)} · {venue.updatedBy}
              </p>
              <div className="op-buttons">
                {ALL_STATES.map((state) => (
                  <button
                    key={state}
                    type="button"
                    className={state === venue.state ? "selected" : ""}
                    onClick={() =>
                      void handleStateClick(venue.id, venue.name, state)
                    }
                  >
                    {VENUE_STATE_LABELS[state]}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>

        <aside className="op-log">
          <h3>변경 로그 (불변 기록)</h3>
          {repository.mode === "local" && (
            <div className="interaction-timing">
              <h4>클릭 처리 시간</h4>
              {interactionTimings.length === 0 ? (
                <p className="empty-copy">아직 버튼을 누르지 않았습니다.</p>
              ) : (
                interactionTimings.slice(0, 8).map((timing) => (
                  <p key={timing.id} className="log-line">
                    {timing.venueName} · {VENUE_STATE_LABELS[timing.state]} ·{" "}
                    {timing.elapsedSeconds}초
                  </p>
                ))
              )}
            </div>
          )}
          {snapshot.operatorLogs.map((log) => (
            <p key={log.id} className="log-line">
              {formatUpdatedLabel(log.updatedAt)} · {log.updatedBy} ·{" "}
              {VENUE_STATE_LABELS[log.before]} → {VENUE_STATE_LABELS[log.after]}
            </p>
          ))}
        </aside>
      </section>

      {repository.mode === "remote" && (
        <section>
          <div className="section-head">
            <h2>업로드 검수 대기</h2>
            <p>승인해도 자동 공개되지 않습니다.</p>
          </div>
          {moments.length === 0 ? (
            <p>검수 대기 파일이 없습니다.</p>
          ) : (
            moments.map((moment) => (
              <article key={moment.id} className="op-venue">
                <strong>{moment.fileName}</strong>
                <p>
                  {moment.mediaType} · {(moment.size / 1024 / 1024).toFixed(1)}
                  MB
                </p>
                <div className="op-buttons">
                  <button
                    type="button"
                    onClick={() =>
                      void repository
                        .createMomentPreview?.(moment.storagePath)
                        .then((url) =>
                          window.open(url, "_blank", "noopener,noreferrer"),
                        )
                    }
                  >
                    60초 미리보기
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewMoment(moment, "approved")}
                  >
                    승인 기록
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewMoment(moment, "rejected")}
                  >
                    반려
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </>
  );
}
