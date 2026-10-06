/** Official video metadata and caption-grounded reflections. Reflection wording and prayer excerpts remain verbatim (see docs/sermon-*-source-*.md). */
type Sermon = {
  day: number;
  date: string;
  title: string;
  speaker: string;
  passage: string;
  videoUrl: string;
  reflectionTitle: string;
  summary?: string;
  points: readonly string[];
  prayerExcerpt: { text: string; startSeconds: number; timeLabel: string };
};

export const sermons: readonly Sermon[] = [{
  day: 5,
  date: '2026-10-05',
  title: '다윗의 중심',
  speaker: '이찬수 목사',
  passage: '사무엘상 16:6–13',
  videoUrl: 'https://www.youtube.com/watch?v=0e11fIrc_6s',
  reflectionTitle: '하나님이 기뻐하신 다윗의 중심',
  points: ['하나님을 사랑하는 마음', '하나님을 신뢰하는 마음'],
  prayerExcerpt: {
    text: '마음의 중심에 하나님을 사랑하는 마음 하나님을 신뢰하는 마음이 자리잡게 하여 주시옵소서',
    startSeconds: 2326,
    timeLabel: '38:46–38:54',
  },
}, {
  day: 6,
  date: '2026-10-06',
  title: '하나님은 사람을 어떻게 준비시키시는가?',
  speaker: '이찬수 목사',
  passage: '사무엘상 16:14–23',
  videoUrl: 'https://www.youtube.com/watch?v=zERW09HgidI',
  reflectionTitle: '하나님이 원하셨던 훈련',
  points: ['내면을 먼저 변화시켜 주심', '섬김의 훈련', '기다림과 인내를 배우게 하심'],
  prayerExcerpt: {
    text: '성령의 내주하심이 내 안에 기쁨을 회복시켜 주시고 성령의 내주하심을 통하여 하나님 충만하게 충만하게 힘을내어 달려가게 하여 주시옵소서',
    startSeconds: 2673,
    timeLabel: '44:33–44:50',
  },
}, {
  day: 7,
  date: '2026-10-07',
  title: '골리앗보다 크신 하나님을 보라',
  speaker: '이찬수 목사',
  passage: '사무엘상 17:31–37',
  videoUrl: 'https://www.youtube.com/watch?v=x27Jm9asHDE',
  reflectionTitle: '기름부심이 가져다 준 세 가지 변화',
  points: ['보는 눈과 언어가 달라집니다.', '사람의 평가에 연연하지 않습니다. 끌려다니지 않습니다.', '과거의 은혜로 현재를 재해석갑니다.'],
  prayerExcerpt: {
    text: '우리의 눈을 열어 주님을 보게 하여 주옵소서.',
    startSeconds: 2688,
    timeLabel: '44:48–44:55',
  },
}] as const;

export function availableSermon(day: number, now: number) {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return sermons.find(sermon => sermon.day === day && sermon.date <= today);
}

export function latestSermonDay(now: number) {
  return [...sermons].reverse().find(sermon => availableSermon(sermon.day, now))?.day ?? 5;
}
