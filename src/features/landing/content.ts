import worshipPhoto from '../../assets/landing/worship.jpg';
import familyPhoto from '../../assets/landing/family.jpg';

/** Illustrative only. Replace schedule and venue guidance after church confirmation. */
export const eventContent = {
  name: '특별새벽부흥회',
  headline: '하나님 앞에, 함께.',
  schedule: '오늘 예배 일정 · 추후 안내',
  verse: ['그리스도 예수 안에서', '함께 지어져 가느니라'],
  verseReference: '에베소서 2:22 · 묵상 예시',
} as const;

export type PlaceId = 'songlim' | 'dream' | 'gym' | 'online';
export interface WorshipPlace {
  label: string;
  state: string;
  sampleTime: string;
  title: string;
  description: string;
  facts: readonly { label: string; value: string }[];
  action: string;
  guidance: readonly string[];
}

export const places: Record<PlaceId, WorshipPlace> = {
  songlim: {
    label: '송림본당', state: '여유 있음', sampleTime: '04:20 확인 · 예시', title: '송림본당 안내 예시',
    description: '본당에서 함께 예배드리는 경우를 보여주는 시안입니다.',
    facts: [{ label: '출입', value: '정문 이용 예시' }, { label: '주차', value: '교회 안내 확인 필요' }],
    action: '출입·주차 안내 보기',
    guidance: ['정문 안내 봉사자의 안내를 따라주세요. 실제 출입 동선은 공식 공지에서 확인해주세요.', '주차 가능 여부와 만차 안내는 아직 확정되지 않았습니다. 대중교통 이용 안내도 추후 제공됩니다.'],
  },
  dream: {
    label: '드림센터', state: '혼잡', sampleTime: '04:20 확인 · 예시', title: '드림센터 안내 예시',
    description: '드림센터 예배 공간을 선택했을 때 보이는 예시입니다.',
    facts: [{ label: '출입', value: '1층 입구 예시' }, { label: '주차', value: '공식 안내 준비 중' }],
    action: '출입·주차 안내 보기',
    guidance: ['1층 입구를 이용하는 흐름을 가정한 예시입니다. 실제 개방 출입구는 공식 공지를 확인해주세요.', '주차장 운영 시간과 이용 대상은 아직 정해지지 않았습니다.'],
  },
  gym: {
    label: '체육관', state: '확인 중', sampleTime: '04:20 확인 · 예시', title: '체육관 안내 예시',
    description: '마지막 안내 이후 시간이 지나 상태를 다시 확인하는 예시입니다.',
    facts: [{ label: '출입', value: '별도 동선 예시' }, { label: '주차', value: '현장 표지 확인 예시' }],
    action: '출입·주차 안내 보기',
    guidance: ['체육관 방향 표지를 따라 이동하는 상황을 가정했습니다. 실제 운영 여부는 확정되지 않았습니다.', '이동에 도움이 필요하다면 공식 안내가 게시된 뒤 담당 창구를 확인해주세요.'],
  },
  online: {
    label: '온라인', state: '링크 준비 전', sampleTime: '시간 미정', title: '온라인 예배 안내 예시',
    description: '온라인 예배가 제공될 경우의 준비 화면 예시이며, 현재 방송 중이 아닙니다.',
    facts: [{ label: '방송', value: '라이브 아님' }, { label: '링크', value: '공식 공지 후 제공' }],
    action: '예배 준비 예시 보기',
    guidance: ['성경을 펴고 잠시 조용히 마음을 준비해주세요.', '현재 연결되는 방송이나 예배 링크는 없습니다. 공식 채널의 확정 공지를 확인해주세요.'],
  },
};

export const placeOrder: readonly PlaceId[] = ['songlim', 'dream', 'gym', 'online'];

export const photos = {
  worship: {
    image: worshipPhoto,
    alt: '분당우리교회 예배당에서 여러 세대의 성도들이 함께 찬양하는 모습',
    caption: '분당우리교회 주일 3부 예배 풍경 · 2026.03.22',
  },
  family: {
    image: familyPhoto,
    alt: '가정에서 성경을 함께 읽는 가족의 언론 보도 참고 사진',
    caption: '가정 성경읽기 참고 사진 · 분당우리교회 성도 사진 아님',
  },
} as const;

// Kept for the previous illustrative components, which remain available to legacy tests.
export const scenes = [
  { id: 'church', button: '예배당에서', image: worshipPhoto, alt: photos.worship.alt, caption: '예배당에서 드리는 우리', width: 1000, height: 667 },
  { id: 'home', button: '가정에서', image: familyPhoto, alt: photos.family.alt, caption: '가정에서 드리는 우리 · 참고 사진', width: 640, height: 474 },
] as const;

export const photoSources = {
  worship: 'https://www.woorichurch.org/modu/s_board/read.asp?board_seq=78&board_sub_seq=1&lef=&page=&seq=424110&typ=&word=',
  family: 'https://www.kmib.co.kr/article/view.asp?arcid=0924169047',
} as const;
