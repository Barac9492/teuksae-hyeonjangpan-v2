export const prayerBoards = {
  general: { title: '함께 나누는 기도', description: '우리의 일상과 공동체를 위한 기도제목을 나눠요.' },
  adults: { title: '어른들을 향한 축복의 기도', description: '삶의 자리를 지켜온 어른들에게 감사와 축복을 전해요.' },
  youth: { title: '청년과 청소년들을 향한 축복의 기도', description: '내일을 향해 걸어가는 다음 세대에게 응원과 축복을 전해요.' },
} as const;
export type PrayerBoard = keyof typeof prayerBoards;
