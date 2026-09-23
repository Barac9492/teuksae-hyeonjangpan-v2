import type { AppConfig } from "../../domain/config";
import {
  deriveVenuePresentation,
  formatUpdatedLabel,
  VENUE_STATE_LABELS,
} from "../../domain/venue";
import type { AppSnapshot, VenueId } from "../../domain/types";

interface TodayBeforeViewProps {
  config: AppConfig;
  snapshot: AppSnapshot;
  onToggleTodayAttendance: () => void;
  onToggleTomorrowAttendance: () => void;
  onSelectVenue: (venueId: VenueId) => void;
  repositoryMode: "local" | "remote";
}

export function TodayBeforeView({
  config,
  snapshot,
  onToggleTodayAttendance,
  onToggleTomorrowAttendance,
  onSelectVenue,
  repositoryMode,
}: TodayBeforeViewProps) {
  const { attendance, publicCounts, venues } = snapshot;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">오늘 안내</p>
          <h2 className="display">{config.heroTitle}</h2>
          <p className="lead">{config.heroDescription}</p>
        </div>
        <aside className="attend-card">
          <div>
            <div className="label">오늘 참석</div>
            <h3>
              {attendance.today
                ? "오늘 참석으로 표시했습니다"
                : "오늘 특새에 오셨나요?"}
            </h3>
            <p>
              {repositoryMode === "remote"
                ? attendance.today
                  ? "참석을 변경하려면 다시 누르세요. 운영 리허설 공유 집계에 반영됩니다."
                  : "이름이나 연락처 없이 운영 리허설 공유 집계에 반영됩니다."
                : attendance.today
                  ? "참석을 변경하려면 다시 누르세요. 이 기기의 운영 리허설 숫자만 바뀝니다."
                  : "버튼을 누르면 운영 리허설 숫자가 1명 단위로 바뀌고 이 기기에 저장됩니다."}
            </p>
          </div>
          <div className="attend-actions">
            <button
              type="button"
              className={`primary-light ${attendance.today ? "done" : ""}`}
              onClick={onToggleTodayAttendance}
            >
              {attendance.today ? "✓ 오늘 참석" : "오늘 왔어요"}
            </button>
            <button
              type="button"
              className={`secondary-light ${attendance.tomorrow ? "done" : ""}`}
              onClick={onToggleTomorrowAttendance}
            >
              {attendance.tomorrow ? "✓ 내일 참석 예정" : "내일도 올게요"}
            </button>
          </div>
        </aside>
      </section>

      <section>
        <div className="section-head">
          <div>
            <p className="eyebrow">참석 현황</p>
            <h2>오늘 함께 예배드리는 인원</h2>
          </div>
          <p>{config.exampleNotice}</p>
        </div>
        <div className="attendance-pulse">
          <article className="pulse-main">
            <div className="pulse-label">오늘 참석</div>
            <div className="pulse-num">
              {publicCounts.todayTotal.toLocaleString("ko-KR")}명
            </div>
            <div className="pulse-copy">현장 + 온라인 합계</div>
          </article>
          <article className="pulse-stat">
            <div className="pulse-label">현장 참석</div>
            <div className="pulse-num">
              {publicCounts.onsiteTotal.toLocaleString("ko-KR")}
            </div>
            <div className="pulse-copy">송림/드림센터/체육관</div>
          </article>
          <article className="pulse-stat">
            <div className="pulse-label">온라인 참석</div>
            <div className="pulse-num">
              {publicCounts.onlineTotal.toLocaleString("ko-KR")}
            </div>
            <div className="pulse-copy">온라인 참여</div>
          </article>
          <article className="pulse-stat">
            <div className="pulse-label">장소 미선택</div>
            <div className="pulse-num">
              {publicCounts.unselectedTotal.toLocaleString("ko-KR")}
            </div>
            <div className="pulse-copy">
              참석 표시 후 장소를 고르지 않은 인원
            </div>
          </article>
        </div>
        <p className="tomorrow-count">
          내일 참석 예정: {publicCounts.tomorrowTotal.toLocaleString("ko-KR")}명
        </p>
      </section>

      <section>
        <div className="section-head">
          <div>
            <p className="eyebrow">장소 안내</p>
            <h2>지금 어디로 가면 될까요?</h2>
          </div>
          <p>마지막 확인 시각과 담당자를 함께 표시합니다.</p>
        </div>
        <div className="venue-grid">
          {venues.map((venue) => {
            const presentation = deriveVenuePresentation(venue);
            const selected = attendance.selectedVenue === venue.id;
            const selectable = venue.state !== "full";
            return (
              <article
                key={venue.id}
                className={`venue ${presentation.effectiveState === "recommended" ? "recommended" : ""}`}
              >
                <div>
                  <div className="venue-top">
                    <div>
                      <h3>{venue.name}</h3>
                      <p className="desc">{venue.description}</p>
                    </div>
                    <span className={`badge ${presentation.effectiveState}`}>
                      {VENUE_STATE_LABELS[presentation.effectiveState]}
                    </span>
                  </div>
                  {presentation.stale && (
                    <p className="stale-copy">
                      마지막 업데이트가 10분을 넘어 확인 중으로 표시합니다.
                    </p>
                  )}
                </div>
                <div>
                  <p className="meta">
                    {formatUpdatedLabel(venue.updatedAt)} · {venue.updatedBy}{" "}
                    확인
                  </p>
                  {selectable && (
                    <button
                      type="button"
                      className={`pick ${selected ? "selected" : ""}`}
                      onClick={() => onSelectVenue(venue.id)}
                    >
                      {selected
                        ? "✓ 참석 장소로 선택됨"
                        : "여기서 예배드릴게요"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="notice-grid">
        <article className="notice">
          <h3>이동 · 안전 안내</h3>
          <ul>
            {config.movementNotices.map((notice) => (
              <li key={notice.label}>
                <b>{notice.label}</b>
                <span>{notice.value}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="notice online">
          <h3>{config.onlineNoticeTitle}</h3>
          <p className="desc">{config.onlineNoticeBody}</p>
          <button
            type="button"
            className="text-link"
            onClick={() => onSelectVenue("online")}
          >
            온라인으로 예배드릴게요
          </button>
        </article>
      </section>
    </>
  );
}
