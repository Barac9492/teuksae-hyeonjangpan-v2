/** Reviewed source metadata and user-provided summary, not a sermon transcript. */
export const sermons = [{
  day: 5,
  date: '2026-10-05',
  title: '다윗의 중심',
  speaker: '이찬수 목사',
  passage: '사무엘상 16:6–13',
  videoUrl: 'https://www.youtube.com/watch?v=0e11fIrc_6s',
  reflectionTitle: '하나님이 보시는 중심',
  points: ['하나님을 사랑하는 마음', '하나님을 신뢰하는 마음'],
  questions: ['오늘 하나님께 먼저 여쭙고 싶은 일은 무엇인가요?', '학교·집·일터에서 하나님을 사랑하고 신뢰하는 마음으로 할 수 있는 작은 일은 무엇인가요?'],
}] as const;

export function availableSermon(day: number, now: number) {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return sermons.find(sermon => sermon.day === day && sermon.date <= today);
}

export function latestSermonDay(now: number) {
  return [...sermons].reverse().find(sermon => availableSermon(sermon.day, now))?.day ?? 5;
}
