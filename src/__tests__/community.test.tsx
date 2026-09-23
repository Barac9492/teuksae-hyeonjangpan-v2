import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { defaultAppConfig } from "../domain/config";
import { LocalAppRepository } from "../data/LocalAppRepository";
import {
  communityJournalStorageKey,
  createShareEntry,
  MAX_JOURNAL_ENTRIES,
  readJournal,
  writeJournal,
} from "../features/community/communityJournal";
import { describeDawn } from "../features/community/dawnSky";
import {
  ALLERGEN_NONE,
  buildCarpoolMessage,
  buildSnackMessage,
  buildThanksMessage,
  formatTimeLabel,
  parseCount,
} from "../features/community/shareMessages";
import { planDriverNight } from "../features/community/sleepGuard";
import {
  peoplePerDot,
  planPeople,
  sampleStrokes,
  WE_GLYPH_COUNT,
  WE_GLYPH_POINTS,
} from "../features/community/weGlyph";

describe("share message builders", () => {
  it("builds a carpool offer with facts only and no promises", () => {
    const text = buildCarpoolMessage({
      role: "offer",
      dayLabel: "목",
      time: "04:00",
      from: "정자동",
      venueName: "드림센터",
      seats: 2,
    });
    expect(text).toContain("목요일 새벽 4:00 정자동 출발 → 드림센터");
    expect(text).toContain("빈자리 2자리");
    expect(text).not.toMatch(/확인할게요|괜찮아요|🙂/);
    expect(text.split("\n")).toHaveLength(3);
  });

  it("does not demote online worship in the request message", () => {
    const text = buildCarpoolMessage({
      role: "request",
      dayLabel: "금",
      time: "03:50",
      from: "   ",
      venueName: "송림 본당",
      seats: 1,
    });
    expect(text).toContain("태워주세요");
    expect(text).toContain("우리 동네");
    expect(text).toContain("1명입니다");
    expect(text).not.toMatch(/온라인|어렵다면/);
  });

  it("never claims 'no allergens' unless the user explicitly chose 없음", () => {
    const base = { dayLabel: "토", item: "백설기", servings: 12, venueName: "체육관" };
    const unspecified = buildSnackMessage({ ...base, allergens: [] });
    expect(unspecified).toContain("나눌 때 확인해 드리겠습니다");
    expect(unspecified).not.toContain("넣지 않았습니다");

    const listed = buildSnackMessage({ ...base, allergens: ["견과류", "밀"] });
    expect(listed).toContain("견과류, 밀 들어 있습니다");

    const none = buildSnackMessage({ ...base, allergens: [ALLERGEN_NONE] });
    expect(none).toContain("견과류·우유·밀·계란은 넣지 않았습니다");
  });

  it("only promises individual wrapping when the user checked it", () => {
    const base = { dayLabel: "토", item: "백설기", servings: 12, venueName: "체육관", allergens: [] };
    expect(buildSnackMessage(base)).not.toContain("개별 포장");
    expect(buildSnackMessage({ ...base, individuallyWrapped: true })).toContain("개별 포장");
  });

  it("keeps a blank or half-typed number from turning into 130", () => {
    expect(parseCount("", 12, 500)).toBe(12);
    expect(parseCount("30", 12, 500)).toBe(30);
    expect(parseCount("900", 12, 500)).toBe(500);
    expect(parseCount("abc", 1, 6)).toBe(1);
  });

  it("formats time labels and thanks fallbacks", () => {
    expect(formatTimeLabel("04:10")).toBe("새벽 4:10");
    expect(formatTimeLabel("09:00")).toBe("오전 9:00");
    expect(formatTimeLabel("13:05")).toBe("오후 1:05");
    expect(formatTimeLabel("nonsense")).toBe("새벽");
    expect(buildThanksMessage("  ")).toContain("함께여서 고마웠습니다");
  });
});

describe("community journal (device only)", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips entries, drops malformed rows, and caps the list", () => {
    const entry = createShareEntry("snack", "  백설기 12개  ", 3);
    writeJournal(window.localStorage, [entry]);
    expect(readJournal(window.localStorage)).toEqual([{ ...entry, note: "백설기 12개" }]);

    window.localStorage.setItem(
      communityJournalStorageKey,
      JSON.stringify({ version: 1, entries: [entry, { id: "x", kind: "leaderboard" }] }),
    );
    expect(readJournal(window.localStorage)).toHaveLength(1);

    writeJournal(
      window.localStorage,
      Array.from({ length: MAX_JOURNAL_ENTRIES + 10 }, (_, i) =>
        createShareEntry("thanks", `note ${i}`, 0),
      ),
    );
    expect(readJournal(window.localStorage)).toHaveLength(MAX_JOURNAL_ENTRIES);
  });
});

describe("people glyph and sky", () => {
  it("samples strokes evenly and gives every dot the same weight", () => {
    const line = sampleStrokes([[[0, 0], [90, 0]]], 9);
    expect(line).toHaveLength(11);
    expect(WE_GLYPH_COUNT).toBe(WE_GLYPH_POINTS.length);
    const people = planPeople(2000, 500);
    expect(people.filter((dot) => dot.online)).toHaveLength(Math.round(WE_GLYPH_COUNT / 4));
    expect(new Set(people.map((dot) => dot.order)).size).toBe(WE_GLYPH_COUNT);
    expect(peoplePerDot(0)).toBe(1);
  });

  it("is dark at night and bright at noon", () => {
    expect(describeDawn(60).glow).toBeLessThan(0.1);
    expect(describeDawn(720).glow).toBe(1);
  });
});

describe("driver sleep guard", () => {
  it("states facts, never a verdict about love", () => {
    const short = planDriverNight({ arriveAt: "04:20", driveMinutes: 25, prepMinutes: 30, bedtime: "22:00" });
    expect(short?.departAt).toBe("03:55");
    expect(short?.wakeAt).toBe("03:25");
    expect(short?.sleepMinutes).toBe(325);
    expect(short?.verdict).toBe("short");

    const danger = planDriverNight({ arriveAt: "04:20", driveMinutes: 60, prepMinutes: 30, bedtime: "00:30" });
    expect(danger?.verdict).toBe("danger");
    expect(danger?.message).toContain("5시간");
    expect(`${short?.message}${danger?.message}`).not.toMatch(/사랑/);

    expect(planDriverNight({ arriveAt: "x", driveMinutes: 1, prepMinutes: 1, bedtime: "22:00" })).toBeNull();
  });
});

describe("우리 tab", () => {
  beforeEach(() => window.localStorage.clear());

  it("puts carpool first, keeps the sleep result hidden until touched, and keeps sharing local", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const repository = new LocalAppRepository(defaultAppConfig, window.localStorage);
    render(<App config={defaultAppConfig} repository={repository} />);

    await user.click(screen.getAllByRole("button", { name: "우리" })[0]);

    const main = screen.getByRole("main");
    const firstButtons = within(main).getAllByRole("button").slice(0, 3);
    expect(firstButtons.map((b) => b.textContent)).toEqual([
      "카풀 문장 만들기",
      "간식 문장 만들기",
      "사진 올리기",
    ]);

    // 잠 계산 결과는 '계산하기'를 누르기 전에는 나오지 않는다.
    expect(screen.queryByText(/졸음운전/)).not.toBeInTheDocument();
    const sleepForm = screen.getByRole("form", { name: "잠 계산" });
    const drive = within(sleepForm).getByLabelText("운전(분)");
    await user.clear(drive);
    expect(drive).toHaveValue(null); // 지우는 동안 앱이 값을 써 넣지 않는다
    await user.type(drive, "90");
    expect(drive).toHaveValue(90);
    expect(screen.queryByText(/졸음운전/)).not.toBeInTheDocument();
    await user.click(within(sleepForm).getByRole("button", { name: "계산하기" }));
    const sleepBox = sleepForm.parentElement as HTMLElement;
    expect(within(sleepBox).getByRole("status")).toHaveTextContent(/5시간/);
    expect(within(sleepBox).getByRole("status")).not.toHaveTextContent(/사랑/);

    // 간식: 개수 칸을 지우고 30을 치면 30이어야 한다(130이 아니라).
    const snackForm = screen.getByRole("form", { name: "간식 문장 만들기" });
    const count = within(snackForm).getByLabelText("개수");
    await user.clear(count);
    await user.type(count, "30");
    expect(count).toHaveValue(30);
    const snackSection = snackForm.closest("section");
    expect(snackSection).not.toBeNull();
    if (!snackSection) return;
    expect(within(snackSection).getByLabelText("붙여넣을 문장")).toHaveDisplayValue(/간식 30개/);
    // 재료 미선택 문장은 '없음'을 단정하지 않는다.
    expect(within(snackSection).getByLabelText("붙여넣을 문장")).toHaveDisplayValue(/나눌 때 확인해 드리겠습니다/);
    await user.click(within(snackSection).getByLabelText("네 가지 모두 없음"));
    expect(within(snackSection).getByLabelText("붙여넣을 문장")).toHaveDisplayValue(/넣지 않았습니다/);
    await user.click(within(snackSection).getByLabelText("견과류"));
    expect(within(snackSection).getByLabelText("붙여넣을 문장")).toHaveDisplayValue(/견과류 들어 있습니다/);
    expect(within(snackSection).getByLabelText("네 가지 모두 없음")).not.toBeChecked();

    // 카풀: 출발 동네가 비면 복사할 수 없고, 적으면 복사된다.
    const carpoolForm = screen.getByRole("form", { name: "카풀 문장 만들기" });
    const carpoolSection = carpoolForm.closest("section");
    if (!carpoolSection) return;
    expect(within(carpoolSection).getByRole("button", { name: "문장 복사" })).toBeDisabled();
    await user.type(within(carpoolForm).getByLabelText("출발 동네"), "정자동");
    expect(within(carpoolSection).getByLabelText("붙여넣을 문장")).toHaveDisplayValue(/정자동 출발/);
    await user.click(within(carpoolSection).getByRole("button", { name: "문장 복사" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("[특새 카풀 · 태워드립니다]"));
    await user.click(within(carpoolSection).getByRole("button", { name: "나눔 기록에 남기기" }));
    expect(readJournal(window.localStorage)).toHaveLength(1);
    expect(window.localStorage.getItem("teuksae-app-v1-snapshot") ?? "").not.toContain("carpool");

    // 사진 패널은 항상 펼쳐져 있고 예시 장면은 없다.
    expect(screen.getByLabelText("사진·영상 업로드")).toBeInTheDocument();
    expect(screen.queryByText("송림 본당 앞 · 문 열림 안내 예시")).not.toBeInTheDocument();

    // 참석 조작은 이 탭에 없고, 글자 카드는 예시 표시를 단다.
    expect(screen.queryByRole("button", { name: /내 점 켜기/ })).not.toBeInTheDocument();
    expect(screen.getByText(defaultAppConfig.exampleNotice)).toBeInTheDocument();

    // 주간 탭은 나눔 건수를 세지 않는다.
    await user.click(screen.getAllByRole("button", { name: "주간" })[0]);
    expect(screen.queryByText(/나눔 기록/)).not.toBeInTheDocument();
  });
});
