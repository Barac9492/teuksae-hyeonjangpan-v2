/** Summary points are user-provided; the prayer excerpt is verified against the video captions. */
export const sermons = [{
  day: 5,
  date: '2026-10-05',
  title: '다윗의 중심',
  speaker: '이찬수 목사',
  passage: '사무엘상 16:6–13',
  videoUrl: 'https://www.youtube.com/watch?v=0e11fIrc_6s',
  reflectionTitle: '하나님이 보시는 중심',
  points: ['하나님을 사랑하는 마음', '하나님을 신뢰하는 마음'],
  prayerExcerpt: {
    text: '마음의 중심에 하나님을 사랑하는 마음 하나님을 신뢰하는 마음이 자리잡게 하여 주시옵소서',
    startSeconds: 2326,
    timeLabel: '38:46–38:54',
  },
}] as const;

export function availableSermon(day: number, now: number) {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return sermons.find(sermon => sermon.day === day && sermon.date <= today);
}

export function latestSermonDay(now: number) {
  return [...sermons].reverse().find(sermon => availableSermon(sermon.day, now))?.day ?? 5;
}
