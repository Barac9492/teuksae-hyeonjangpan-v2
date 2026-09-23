import type { CSSProperties } from "react";
import type { PublicCounts } from "../../domain/types";
import { peoplePerDot, planPeople, WE_GLYPH_COUNT } from "./weGlyph";

interface WeGlyphProps {
  counts: PublicCounts;
  exampleNotice: string;
  official: boolean;
}

/** 오늘 함께한 사람들을 점으로 바꿔 '우리'를 쓴다. 점은 사람 무리이지 특정인이 아니다. */
export function WeGlyph({ counts, exampleNotice, official }: WeGlyphProps) {
  const people = planPeople(counts.todayTotal, counts.onlineTotal);
  const perDot = peoplePerDot(counts.todayTotal);

  return (
    <svg
      className="glyph-svg"
      viewBox="0 0 320 190"
      role="img"
      aria-label={`오늘 함께 예배드리는 ${counts.todayTotal.toLocaleString("ko-KR")}명을 점 ${WE_GLYPH_COUNT}개로 나타낸 '우리' 글자. 점 하나는 약 ${perDot}명. 속이 빈 점은 온라인. ${official ? "" : exampleNotice}`}
    >
      {people.map((dot) => (
        <circle
          key={dot.index}
          className={`glyph-dot ${dot.online ? "online" : "onsite"}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.online ? 2.9 : 3.4}
          style={{ "--o": dot.order } as CSSProperties}
        />
      ))}
    </svg>
  );
}
