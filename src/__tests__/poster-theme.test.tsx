import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanionApp } from '../features/companion';
import { PageHeading } from '../features/companion/ui';
import { WorshipHero } from '../features/companion/worship';
import crownImage from '../features/companion/assets/crown.jpg';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ enabled: true, resources: [], items: [] }) } as Response);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('reuses the actual poster image decoratively without obscuring the chapter text', () => {
  const view = render(<PageHeading eyebrow="도착하기 전에" title="주차 안내">예배 장소별 주차 안내를 확인하세요.</PageHeading>);
  expect(screen.getByRole('heading', { name: '주차 안내' })).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  const artwork = view.container.querySelector('.tc-page-heading__visual');
  expect(artwork).toHaveAttribute('aria-hidden', 'true');
  expect(artwork?.querySelector('img')).toHaveAttribute('src', crownImage);
  expect(artwork?.querySelector('img')).toHaveAttribute('alt', '');
  expect(view.container.querySelector('.tc-page-heading > p')).toHaveTextContent('예배 장소별 주차 안내를 확인하세요.');
});

it('keeps the hero readable as text and reserves the source photograph aspect ratio', () => {
  render(<WorshipHero crownImage={crownImage} />);
  expect(screen.getByRole('heading', { name: '하나님 마음에 합한 사람' })).toBeVisible();
  const image = screen.getByRole('img', { name: '왕관을 조심스럽게 받쳐 든 두 손' });
  expect(image).toHaveAttribute('width', '1150');
  expect(image).toHaveAttribute('height', '445');
  expect(image).toHaveAttribute('fetchpriority', 'high');
});

it('keeps worship status ahead of the optional installation card', async () => {
  const view = render(<CompanionApp />);
  await act(async () => undefined);
  const hero = view.container.querySelector('.tc-hero')!;
  const journey = screen.getByRole('region', { name: '여섯 번의 새벽' });
  const status = screen.getByRole('heading', { name: '지금 예배 공간은' });
  const install = screen.getByRole('complementary', { name: '우리 특새를 홈 화면에' });
  expect(hero.compareDocumentPosition(journey) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(journey.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(status.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
