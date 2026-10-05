import type { Venue } from './ui';

export const tabs = [
  { id: 'worship', label: '예배' },
  { id: 'prayer', label: '기도' },
  { id: 'parking', label: '주차' },
  { id: 'photos', label: '사진' },
] as const;
export type TabId = (typeof tabs)[number]['id'];

export const venueNames: Record<Venue, { area: string; name: string; short: string }> = {
  songrim: { area: '이매', name: '송림본당', short: '송림' },
  dream: { area: '서현', name: '드림센터', short: '드림' },
};


export const stageNames = ['교문 개방 전', '교문 개방', '체육관 먼저 개방', '본당 입장 중', '본당 입장 마감'] as const;
export const trailLabels = ['입장 전', '학교 안', '체육관', '본당 입장', '마감'] as const;

export const VERSE = ['폐하시고 다윗을 왕으로 세우시고', '증언하여 이르시되', '내가 이새의 아들 다윗을 만나니', '내 마음에 맞는 사람이라', '내 뜻을 다 이루리라 하시더니'];

