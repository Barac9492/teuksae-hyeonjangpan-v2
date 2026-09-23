import { useMemo, useRef, useState } from "react";
import type { AppConfig } from "../../domain/config";
import type { AppSnapshot, MomentDraft } from "../../domain/types";
import { MomentsPanel } from "../moments/MomentsPanel";
import {
  SHARE_KIND_LABELS,
  type CommunityJournal,
  type ShareKind,
} from "./communityJournal";
import { describeDawn, minuteOfDay } from "./dawnSky";
import {
  ALLERGEN_NONE,
  ALLERGEN_OPTIONS,
  buildCarpoolMessage,
  buildSnackMessage,
  buildThanksMessage,
  copyText,
  parseCount,
  type CarpoolRole,
} from "./shareMessages";
import { formatDuration, planDriverNight } from "./sleepGuard";
import { drawWeCard, shareWeCard } from "./weCard";
import { WeGlyph } from "./WeGlyphView";
import { peoplePerDot, WE_GLYPH_COUNT } from "./weGlyph";

interface CommunityViewProps {
  config: AppConfig;
  snapshot: AppSnapshot;
  journal: CommunityJournal;
  official: boolean;
  onCreateMomentDraft: (draft: MomentDraft) => void;
  onUploadMoment?: (file: File, draft: MomentDraft) => Promise<void>;
  repositoryMode: "local" | "remote";
  connected: boolean;
  onToast: (message: string) => void;
}

/** 섹션 제목으로 이동한다. 입력칸에 포커스를 주면 키보드가 튀어나오므로 제목에 준다. */
function scrollToSection(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const heading = element.querySelector<HTMLElement>("h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

function formatEntryTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

interface PreviewProps {
  text: string;
  copyDisabled?: boolean;
  copyHint?: string;
  onCopy: () => void;
  onRecord: () => void;
}

/** 미리보기는 탭 한 번에 전체 선택되는 읽기 전용 칸이다. 복사 실패 안내는 사라지지 않는다. */
function Preview({ text, copyDisabled, copyHint, onCopy, onRecord }: PreviewProps) {
  return (
    <div className="share-preview">
      <p className="label">단톡방에 붙여넣을 문장</p>
      <textarea
        className="share-text"
        readOnly
        value={text}
        rows={4}
        aria-label="붙여넣을 문장"
        onFocus={(event) => event.target.select()}
      />
      <div className="share-actions">
        <button type="button" className="solid" disabled={copyDisabled} onClick={onCopy}>
          문장 복사
        </button>
        <button type="button" className="ghost" onClick={onRecord}>
          나눔 기록에 남기기
        </button>
      </div>
      {copyHint && (
        <p className="share-hint" role="status">
          {copyHint}
        </p>
      )}
    </div>
  );
}

export function CommunityView({
  config,
  snapshot,
  journal,
  official,
  onCreateMomentDraft,
  onUploadMoment,
  repositoryMode,
  connected,
  onToast,
}: CommunityViewProps) {
  const todayLabel =
    snapshot.weekDays.find((day) => day.index === config.todayIndex)?.dayLabel ??
    "오늘";
  const onsiteVenues = useMemo(
    () => snapshot.venues.filter((venue) => venue.id !== "online"),
    [snapshot.venues],
  );
  const defaultVenue =
    onsiteVenues.find((venue) => venue.state === "recommended")?.name ??
    onsiteVenues[0]?.name ??
    "예배 장소";

  // 숫자 칸은 문자열로 들고 있어야 지우는 동안 앱이 값을 써 넣지 않는다.
  const [carpoolRole, setCarpoolRole] = useState<CarpoolRole>("offer");
  const [carpoolFrom, setCarpoolFrom] = useState("");
  const [carpoolTime, setCarpoolTime] = useState("04:00");
  const [seatsText, setSeatsText] = useState("2");
  const [ridersText, setRidersText] = useState("1");
  const [carpoolVenue, setCarpoolVenue] = useState(defaultVenue);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);

  const [arriveAt, setArriveAt] = useState("04:20");
  const [driveText, setDriveText] = useState("25");
  const [prepText, setPrepText] = useState("30");
  const [bedtime, setBedtime] = useState("22:30");
  const [sleepPlanShown, setSleepPlanShown] = useState(false);
  const sleepPlan = sleepPlanShown
    ? planDriverNight({
        arriveAt,
        driveMinutes: parseCount(driveText, 0, 180),
        prepMinutes: parseCount(prepText, 0, 120),
        bedtime,
      })
    : null;

  const [snackItem, setSnackItem] = useState("");
  const [snackCountText, setSnackCountText] = useState("12");
  const [snackAllergens, setSnackAllergens] = useState<string[]>([]);
  const [snackWrapped, setSnackWrapped] = useState(false);
  const [snackVenue, setSnackVenue] = useState(defaultVenue);

  const [thanksNote, setThanksNote] = useState("");

  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  const carpoolFromEmpty = carpoolFrom.trim() === "";
  const carpoolMessage = buildCarpoolMessage({
    role: carpoolRole,
    dayLabel: todayLabel,
    time: carpoolTime,
    from: carpoolFrom,
    venueName: carpoolVenue,
    seats:
      carpoolRole === "offer"
        ? parseCount(seatsText, 1, 6)
        : parseCount(ridersText, 1, 6),
  });
  const snackMessage = buildSnackMessage({
    dayLabel: todayLabel,
    item: snackItem,
    servings: parseCount(snackCountText, 1, 500),
    allergens: snackAllergens,
    venueName: snackVenue,
    individuallyWrapped: snackWrapped,
  });
  const thanksMessage = buildThanksMessage(thanksNote);

  const handleCopy = async (text: string, key: string): Promise<void> => {
    const ok = await copyText(text);
    if (ok) {
      setCopyFailed(null);
      onToast("복사했습니다. 다락방 단톡방에 붙여넣어 주세요.");
      return;
    }
    setCopyFailed(key);
  };

  const copyHintFor = (key: string): string | undefined =>
    copyFailed === key
      ? "이 기기에서는 자동 복사가 되지 않습니다. 위 문장을 한 번 누르면 전체가 선택되니 복사해 주세요."
      : undefined;

  const handleRecord = (kind: ShareKind, note: string): void => {
    journal.add(kind, note, config.todayIndex);
    onToast("이 기기에만 기록했습니다. 서버로는 보내지 않습니다.");
  };

  const toggleAllergen = (name: string): void => {
    setSnackAllergens((current) => {
      if (current.includes(name)) return current.filter((item) => item !== name);
      return name === ALLERGEN_NONE
        ? [ALLERGEN_NONE]
        : [...current.filter((item) => item !== ALLERGEN_NONE), name];
    });
  };

  const handleMomentDraft = (draft: MomentDraft): void => {
    onCreateMomentDraft(draft);
    journal.add("photo", "사진·영상 1건을 검수 대기로 올렸습니다", config.todayIndex);
  };

  const handleCard = async (): Promise<void> => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    const ok = drawWeCard(canvas, {
      sky: describeDawn(minuteOfDay(new Date())),
      counts: snapshot.publicCounts,
      dayLabel: todayLabel,
      churchName: config.churchName,
      official,
    });
    if (!ok) {
      onToast("이 기기에서는 카드 그림을 만들 수 없습니다.");
      return;
    }
    const outcome = await shareWeCard(canvas, `특새-우리카드-${todayLabel}.png`);
    if (outcome === "failed") {
      onToast("카드를 내보내지 못했습니다.");
      return;
    }
    journal.add("photo", "오늘 카드를 만들었습니다", config.todayIndex);
    onToast(outcome === "shared" ? "카드를 나눴습니다." : "카드를 저장했습니다.");
  };

  const perDot = peoplePerDot(snapshot.publicCounts.todayTotal);

  return (
    <>
      <section className="we-top" aria-label="우리 탭 바로가기">
        <h2>다락방 단톡방에 보낼 것</h2>
        <p className="we-top-lead">
          앱은 사람을 짝지어 주지 않습니다. 문장만 만들어 드리고, 붙여넣기는
          직접 하십니다.
        </p>
        <div className="we-jump">
          <button type="button" className="primary" onClick={() => scrollToSection("we-carpool")}>
            카풀 문장 만들기
          </button>
          <button type="button" onClick={() => scrollToSection("we-snack")}>
            간식 문장 만들기
          </button>
          <button type="button" onClick={() => scrollToSection("we-photo")}>
            사진 올리기
          </button>
        </div>
      </section>

      <section id="we-carpool" className="we-section share-block">
        <h2 className="we-h2">카풀</h2>
        <div className="share-grid">
          <form
            className="share-form"
            onSubmit={(event) => event.preventDefault()}
            aria-label="카풀 문장 만들기"
          >
            <div className="role-switch" role="group" aria-label="카풀 역할">
              <button
                type="button"
                className={carpoolRole === "offer" ? "active" : ""}
                aria-pressed={carpoolRole === "offer"}
                onClick={() => setCarpoolRole("offer")}
              >
                태워드립니다
              </button>
              <button
                type="button"
                className={carpoolRole === "request" ? "active" : ""}
                aria-pressed={carpoolRole === "request"}
                onClick={() => setCarpoolRole("request")}
              >
                태워주세요
              </button>
            </div>
            <label>
              출발 동네
              <input
                type="text"
                value={carpoolFrom}
                maxLength={30}
                placeholder="예: 정자동 카페거리 앞"
                onChange={(event) => setCarpoolFrom(event.target.value)}
              />
            </label>
            <div className="share-row">
              <label>
                출발 시각
                <input
                  type="time"
                  value={carpoolTime}
                  onChange={(event) => setCarpoolTime(event.target.value)}
                />
              </label>
              {carpoolRole === "offer" ? (
                <label>
                  빈자리
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={6}
                    value={seatsText}
                    onChange={(event) => setSeatsText(event.target.value)}
                  />
                </label>
              ) : (
                <label>
                  인원
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={6}
                    value={ridersText}
                    onChange={(event) => setRidersText(event.target.value)}
                  />
                </label>
              )}
            </div>
            <label>
              가는 곳
              <select
                value={carpoolVenue}
                onChange={(event) => setCarpoolVenue(event.target.value)}
              >
                {onsiteVenues.map((venue) => (
                  <option key={venue.id} value={venue.name}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <Preview
            text={carpoolMessage}
            copyDisabled={carpoolFromEmpty}
            copyHint={
              carpoolFromEmpty ? "출발 동네를 적으면 복사할 수 있습니다." : copyHintFor("carpool")
            }
            onCopy={() => void handleCopy(carpoolMessage, "carpool")}
            onRecord={() => handleRecord("carpool", "카풀 문장을 만들었습니다")}
          />
        </div>

        <details className="share-details">
          <summary>운전자 잠 계산해 보기</summary>
          <div className="sleep-guard">
            <form
              className="share-form"
              onSubmit={(event) => {
                event.preventDefault();
                setSleepPlanShown(true);
              }}
              aria-label="잠 계산"
            >
              <div className="share-row">
                <label>
                  도착 목표
                  <input type="time" value={arriveAt} onChange={(e) => setArriveAt(e.target.value)} />
                </label>
                <label>
                  운전(분)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={180}
                    value={driveText}
                    onChange={(e) => setDriveText(e.target.value)}
                  />
                </label>
              </div>
              <div className="share-row">
                <label>
                  준비(분)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    value={prepText}
                    onChange={(e) => setPrepText(e.target.value)}
                  />
                </label>
                <label>
                  오늘 밤 취침
                  <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
                </label>
              </div>
              <button type="submit" className="solid wide">
                계산하기
              </button>
            </form>
            {sleepPlan ? (
              <div className={`sleep-result ${sleepPlan.verdict}`} role="status">
                <div className="sleep-nums">
                  <span>
                    <small>기상</small>
                    <b>{sleepPlan.wakeAt}</b>
                  </span>
                  <span>
                    <small>출발</small>
                    <b>{sleepPlan.departAt}</b>
                  </span>
                  <span>
                    <small>잠</small>
                    <b>{formatDuration(sleepPlan.sleepMinutes)}</b>
                  </span>
                </div>
                <p>{sleepPlan.message}</p>
              </div>
            ) : (
              <p className="sleep-hint">
                {sleepPlanShown
                  ? "시각을 다시 확인해 주세요."
                  : "계산하기를 누르면 기상·출발 시각과 잠 시간이 나옵니다. 기준은 잠 5시간입니다."}
              </p>
            )}
          </div>
        </details>

        <details className="share-details">
          <summary>카풀 안전 수칙</summary>
          <ul className="share-tips">
            <li>
              <b>만나는 곳</b>
              <span>집 앞보다 큰길가 밝은 곳에서 타고 내리는 편이 안전합니다.</span>
            </li>
            <li>
              <b>아이 동반</b>
              <span>카시트가 없으면 아이는 태우지 않습니다.</span>
            </li>
            <li>
              <b>예배 후</b>
              <span>운전자는 출차 전 10분만 앉아 계십시오.</span>
            </li>
            <li>
              <b>온라인으로</b>
              <span>온라인 예배도 같은 예배입니다. 참석 표시도 같습니다.</span>
            </li>
          </ul>
        </details>
      </section>

      <section id="we-snack" className="we-section share-block">
        <h2 className="we-h2">간식</h2>
        <div className="share-grid">
          <form
            className="share-form"
            onSubmit={(event) => event.preventDefault()}
            aria-label="간식 문장 만들기"
          >
            <label>
              무엇을 나누나요
              <input
                type="text"
                value={snackItem}
                maxLength={40}
                placeholder="예: 백설기, 따뜻한 두유"
                onChange={(event) => setSnackItem(event.target.value)}
              />
            </label>
            <div className="share-row">
              <label>
                개수
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={snackCountText}
                  onChange={(event) => setSnackCountText(event.target.value)}
                />
              </label>
              <label>
                나누는 곳
                <select value={snackVenue} onChange={(event) => setSnackVenue(event.target.value)}>
                  {onsiteVenues.map((venue) => (
                    <option key={venue.id} value={venue.name}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="allergen-set">
              <legend>들어 있는 재료 (고르지 않으면 "나눌 때 확인"으로 나갑니다)</legend>
              {[...ALLERGEN_OPTIONS, ALLERGEN_NONE].map((name) => (
                <label key={name} className="chip-check">
                  <input
                    type="checkbox"
                    checked={snackAllergens.includes(name)}
                    onChange={() => toggleAllergen(name)}
                  />
                  <span>{name === ALLERGEN_NONE ? "네 가지 모두 없음" : name}</span>
                </label>
              ))}
            </fieldset>
            <label className="chip-check wide-chip">
              <input
                type="checkbox"
                checked={snackWrapped}
                onChange={(event) => setSnackWrapped(event.target.checked)}
              />
              <span>개별 포장했습니다</span>
            </label>
          </form>
          <Preview
            text={snackMessage}
            copyHint={copyHintFor("snack")}
            onCopy={() => void handleCopy(snackMessage, "snack")}
            onRecord={() => handleRecord("snack", "간식 문장을 만들었습니다")}
          />
        </div>
        <details className="share-details">
          <summary>간식 나눔 수칙</summary>
          <ul className="share-tips">
            <li>
              <b>개별 포장</b>
              <span>손으로 집지 않게 하나씩 싸서 준비합니다.</span>
            </li>
            <li>
              <b>알레르기</b>
              <span>견과류, 우유, 밀, 계란은 반드시 표시합니다.</span>
            </li>
            <li>
              <b>조용히</b>
              <span>예배 중에는 꺼내지 않고, 마친 뒤 입구 밖에서 나눕니다.</span>
            </li>
            <li>
              <b>남으면</b>
              <span>안내팀에게 건네면 늦게 오신 분들께 돌아갑니다.</span>
            </li>
          </ul>
        </details>
      </section>

      <section id="we-photo" className="we-section">
        <h2 className="we-h2">사진·영상 올리기</h2>
        <MomentsPanel
          alwaysOpen
          showExamples={false}
          showHeading={false}
          repositoryMode={repositoryMode}
          connected={connected}
          onDraftCreated={handleMomentDraft}
          onUpload={onUploadMoment}
          onToast={onToast}
        />
      </section>

      <section className="we-section glyph-card" aria-labelledby="glyph-heading">
        <div className="glyph-copy">
          <h3 id="glyph-heading">
            오늘 {snapshot.publicCounts.todayTotal.toLocaleString("ko-KR")}명이 함께
            예배드립니다.
          </h3>
          <p>
            점 {WE_GLYPH_COUNT}개, 점 하나는 약 {perDot.toLocaleString("ko-KR")}명입니다. 현장{" "}
            {snapshot.publicCounts.onsiteTotal.toLocaleString("ko-KR")}명은 채운 점, 온라인{" "}
            {snapshot.publicCounts.onlineTotal.toLocaleString("ko-KR")}명은 속이 빈 점입니다. 크기는
            같습니다.
          </p>
          {!official && <p className="glyph-notice">{config.exampleNotice}</p>}
          <button type="button" className="solid glyph-cta" onClick={() => void handleCard()}>
            오늘 카드 만들어 나누기
          </button>
          <p className="glyph-fine">
            카드에는 점과 숫자만 들어갑니다. 얼굴도 이름도 없습니다.
            {!official && ' "운영 리허설 · 예시 숫자" 표시가 크게 찍힙니다.'}
          </p>
          <canvas ref={cardCanvasRef} className="card-canvas" aria-hidden="true" />
        </div>
        <WeGlyph
          counts={snapshot.publicCounts}
          exampleNotice={config.exampleNotice}
          official={official}
        />
      </section>

      <section id="we-thanks" className="we-section share-block">
        <h2 className="we-h2">오늘 고마운 한 사람</h2>
        <p className="we-p">이름은 적지 않아도 됩니다. "정자동에서 태워주신 분"이면 충분합니다.</p>
        <div className="share-grid">
          <form
            className="share-form"
            onSubmit={(event) => event.preventDefault()}
            aria-label="감사 한 줄"
          >
            <label>
              오늘 받은 것
              <textarea
                rows={3}
                maxLength={120}
                value={thanksNote}
                placeholder="예: 새벽 3시 반에 전화로 깨워 주신 다락방장님"
                onChange={(event) => setThanksNote(event.target.value)}
              />
            </label>
          </form>
          <Preview
            text={thanksMessage}
            copyDisabled={thanksNote.trim() === ""}
            copyHint={
              thanksNote.trim() === "" ? "받은 것을 적으면 복사할 수 있습니다." : copyHintFor("thanks")
            }
            onCopy={() => void handleCopy(thanksMessage, "thanks")}
            onRecord={() => handleRecord("thanks", thanksNote.trim() || "고마운 한 사람을 떠올렸습니다")}
          />
        </div>
      </section>

      <section className="we-section">
        <h2 className="we-h2">이 기기에만 남는 기록</h2>
        <p className="we-p">누구와도 비교하지 않고, 세지 않습니다.</p>
        {journal.entries.length === 0 ? (
          <p className="empty-copy">아직 기록이 없습니다.</p>
        ) : (
          <ul className="journal-list" aria-label="나눔 기록">
            {journal.entries.map((entry) => {
              const dayLabel =
                snapshot.weekDays.find((day) => day.index === entry.dayIndex)?.dayLabel ?? "";
              return (
                <li key={entry.id} className={`journal-item ${entry.kind}`}>
                  <span className="journal-kind">{SHARE_KIND_LABELS[entry.kind]}</span>
                  <span className="journal-note">
                    {entry.note}
                    <small className="journal-meta">
                      {" "}
                      {dayLabel} {formatEntryTime(entry.createdAt)}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="journal-remove"
                    aria-label={`${SHARE_KIND_LABELS[entry.kind]} 기록 지우기`}
                    onClick={() => journal.remove(entry.id)}
                  >
                    지우기
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ul className="we-boundary">
          <li>카풀과 간식은 다락방 안에서만. 앱은 매칭하지 않습니다.</li>
          <li>카드에는 얼굴도 이름도 없고, 사진은 검수 전 공개되지 않습니다.</li>
          <li>나눔 기록은 기기 밖으로 나가지 않습니다.</li>
        </ul>
      </section>
    </>
  );
}
