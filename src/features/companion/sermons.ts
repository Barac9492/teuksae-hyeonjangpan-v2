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
  reflectionTitle: '기름부으심이 가져다 준 세 가지 변화',
  points: ['보는 눈과 언어가 달라집니다.', '사람의 평가에 연연하지 않습니다. 끌려다니지 않습니다.', '과거의 은혜로 현재를 재해석합니다.'],
  prayerExcerpt: {
    text: '우리의 눈을 열어 주님을 보게 하여 주옵소서.',
    startSeconds: 2688,
    timeLabel: '44:48–44:55',
  },
}, {
  day: 8,
  date: '2026-10-08',
  title: '사람은 관계를 통해 성숙해간다',
  speaker: '이찬수 목사',
  passage: '사무엘상 18:1–5',
  videoUrl: 'https://www.youtube.com/watch?v=kFLj2-Axxd0',
  reflectionTitle: '요나단을 통해 보는 참된 사랑의 특징',
  points: ['상대방이 잘될 때 기뻐하는 사랑', '자신의 권리를 내려놓는 사랑', '하나님을 더 의지하도록 도와주는 사랑'],
  prayerExcerpt: {
    text: '하나님 피하기 전에 내 최선을 다해서 품을 수 있는 마음을 주시기 원합니다.',
    startSeconds: 2586,
    timeLabel: '43:06–43:17',
  },
}, {
  day: 9,
  date: '2026-10-09',
  title: '상대방에게 끌려가지 않는 믿음',
  speaker: '이찬수 목사',
  passage: '사무엘상 18:6–16',
  videoUrl: 'https://www.youtube.com/watch?v=AO95eBj9Yp4',
  reflectionTitle: '다윗이 가진 힘의 원동력',
  points: ['하나님께서 나와 함께 계신다. 이 확신.', '주권을 하나님께 맡겨 드린다. 이 믿음.'],
  prayerExcerpt: {
    text: '하나님을 마음에 의식하고 하나님을 바라보고 그 하나님의 인도하심을 따라 혼란 없이 인생길을 걸어가는 주님의 자녀 되도록 인도하여 주시옵소서.',
    startSeconds: 3889,
    timeLabel: '1:04:49–1:05:02',
  },
}, {
  day: 10,
  date: '2026-10-10',
  title: '위험에 처한 이를 살리는 용기',
  speaker: '이찬수 목사',
  passage: '사무엘상 19:1–7',
  videoUrl: 'https://www.youtube.com/watch?v=MLCU6ApGZ0Q',
  reflectionTitle: '다윗을 살리기 위한 요나단의 헌신',
  points: ['사랑의 권면', '생명을 건 중보', '회복을 위해 끝까지 행동하는 사랑'],
  prayerExcerpt: {
    text: '내가 이 땅에 존재하는 것이 그 누군가에게는 이것이 선물이 되게 하여 주시옵소서.',
    startSeconds: 2478,
    timeLabel: '41:18–41:28',
  },
}] as const;

export function availableSermon(day: number, now: number) {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  return sermons.find(sermon => sermon.day === day && sermon.date <= today);
}

export function latestSermonDay(now: number) {
  return [...sermons].reverse().find(sermon => availableSermon(sermon.day, now))?.day ?? 5;
}
