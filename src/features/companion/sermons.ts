/** Same format every day: title/passage from the official video description; reflection title, points and prayer excerpt verbatim from its Korean auto-captions (see docs/sermon-*-source-*.md). */
export const sermons = [{
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
}] as const;

export function availableSermon(day: number, now: number) {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return sermons.find(sermon => sermon.day === day && sermon.date <= today);
}

export function latestSermonDay(now: number) {
  return [...sermons].reverse().find(sermon => availableSermon(sermon.day, now))?.day ?? 5;
}
