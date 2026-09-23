import type { Venue } from './ui';

export type BreakfastRestaurant = { name: string; hours: string; type: string; area: string; address: string; phone: string; source: string; map: string; caution?: string };

// Public listings reviewed 2026-09-24, not telephone-confirmed or live opening status.
export const restaurants: Record<Venue, BreakfastRestaurant[]> = {
  "songrim": [
    {
      "name": "유치회관 야탑직영점",
      "hours": "매일 24시간 안내",
      "type": "해장국",
      "area": "야탑 · 이동 필요",
      "address": "성남시 분당구 장미로48번길 14, 104~105호",
      "phone": "031-715-6275",
      "source": "https://www.diningcode.com/profile.php?rid=6dco8pqxbnMd",
      "map": "https://www.google.com/maps/search/?api=1&query=%EC%9C%A0%EC%B9%98%ED%9A%8C%EA%B4%80%20%EC%95%BC%ED%83%91%EC%A7%81%EC%98%81%EC%A0%90%20%EC%84%B1%EB%82%A8%EC%8B%9C%20%EB%B6%84%EB%8B%B9%EA%B5%AC%20%EC%9E%A5%EB%AF%B8%EB%A1%9C48%EB%B2%88%EA%B8%B8%2014%2C%20104~105%ED%98%B8"
    },
    {
      "name": "역전국밥 야탑점",
      "hours": "매일 24시간 안내",
      "type": "국밥 · 해장국",
      "area": "야탑 · 이동 필요",
      "address": "성남시 분당구 야탑로 105, 1층",
      "phone": "0507-1351-1974",
      "source": "https://www.diningcode.com/profile.php?rid=rJl2AMxiFS4Y",
      "map": "https://www.google.com/maps/search/?api=1&query=%EC%97%AD%EC%A0%84%EA%B5%AD%EB%B0%A5%20%EC%95%BC%ED%83%91%EC%A0%90%20%EC%84%B1%EB%82%A8%EC%8B%9C%20%EB%B6%84%EB%8B%B9%EA%B5%AC%20%EC%95%BC%ED%83%91%EB%A1%9C%20105%2C%201%EC%B8%B5"
    },
    {
      "name": "서울감자탕 야탑지점",
      "hours": "매일 24시간 안내",
      "type": "감자탕 · 뼈해장국",
      "area": "야탑 · 이동 필요",
      "address": "성남시 분당구 장미로100번길 22, 1층",
      "phone": "031-704-5925",
      "source": "https://www.diningcode.com/profile.php?rid=6w5SNr2S1dfR",
      "map": "https://www.google.com/maps/search/?api=1&query=%EC%84%9C%EC%9A%B8%EA%B0%90%EC%9E%90%ED%83%95%20%EC%95%BC%ED%83%91%EC%A7%80%EC%A0%90%20%EC%84%B1%EB%82%A8%EC%8B%9C%20%EB%B6%84%EB%8B%B9%EA%B5%AC%20%EC%9E%A5%EB%AF%B8%EB%A1%9C100%EB%B2%88%EA%B8%B8%2022%2C%201%EC%B8%B5"
    }
  ],
  "dream": [
    {
      "name": "서울감자탕 서현지점",
      "hours": "매일 24시간 안내",
      "type": "감자탕 · 뼈해장국",
      "area": "서현",
      "address": "성남시 분당구 황새울로 315, 대현빌딩 1층",
      "phone": "031-706-5925",
      "source": "https://www.diningcode.com/profile.php?rid=qk74g6MEO1Vf",
      "map": "https://www.google.com/maps/search/?api=1&query=%EC%84%9C%EC%9A%B8%EA%B0%90%EC%9E%90%ED%83%95%20%EC%84%9C%ED%98%84%EC%A7%80%EC%A0%90%20%EC%84%B1%EB%82%A8%EC%8B%9C%20%EB%B6%84%EB%8B%B9%EA%B5%AC%20%ED%99%A9%EC%83%88%EC%9A%B8%EB%A1%9C%20315%2C%20%EB%8C%80%ED%98%84%EB%B9%8C%EB%94%A9%201%EC%B8%B5"
    },
    {
      "name": "전주현대옥 분당서현역점",
      "hours": "매일 06:00~22:00 안내",
      "type": "콩나물국밥",
      "area": "서현",
      "address": "성남시 분당구 분당로53번길 19",
      "phone": "031-703-0067",
      "source": "https://tabling.co.kr/place/677cc7d566de5f0698757937",
      "caution": "오전 6시부터 여는 것으로 안내돼요. 그 전에 도착한다면 전화로 확인해주세요.",
      "map": "https://www.google.com/maps/search/?api=1&query=%EC%A0%84%EC%A3%BC%ED%98%84%EB%8C%80%EC%98%A5%20%EB%B6%84%EB%8B%B9%EC%84%9C%ED%98%84%EC%97%AD%EC%A0%90%20%EC%84%B1%EB%82%A8%EC%8B%9C%20%EB%B6%84%EB%8B%B9%EA%B5%AC%20%EB%B6%84%EB%8B%B9%EB%A1%9C53%EB%B2%88%EA%B8%B8%2019"
    },
    {
      "name": "신사골감자탕 서현점",
      "hours": "화~토 24시간 · 월 09시 개점",
      "type": "감자탕 · 뼈해장국",
      "area": "서현",
      "address": "성남시 분당구 서현로 204",
      "phone": "0507-1377-5609",
      "source": "https://tabling.co.kr/place/677cd50e66de5f06988e8383",
      "caution": "10/5(월)은 오전 9시 개점 안내로 이른 아침 식사에 맞지 않아요. 일요일은 22시 마감입니다.",
      "map": "https://www.google.com/maps/search/?api=1&query=%EC%8B%A0%EC%82%AC%EA%B3%A8%EA%B0%90%EC%9E%90%ED%83%95%20%EC%84%9C%ED%98%84%EC%A0%90%20%EC%84%B1%EB%82%A8%EC%8B%9C%20%EB%B6%84%EB%8B%B9%EA%B5%AC%20%EC%84%9C%ED%98%84%EB%A1%9C%20204"
    }
  ]
};
