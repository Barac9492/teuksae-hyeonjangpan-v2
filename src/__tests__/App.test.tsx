import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { defaultAppConfig } from '../domain/config';
import { LocalAppRepository } from '../data/LocalAppRepository';

describe('App interaction flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('handles attendance, practice, and operator updates end-to-end', async () => {
    const user = userEvent.setup();
    const repository = new LocalAppRepository(defaultAppConfig, window.localStorage);

    render(<App config={defaultAppConfig} repository={repository} />);

    await user.click(screen.getByRole('button', { name: '오늘 왔어요' }));
    expect(screen.getByRole('button', { name: '✓ 오늘 참석' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '온라인으로 예배드릴게요' }));
    expect(repository.getSnapshot().attendance.selectedVenue).toBe('online');

    await user.click(screen.getByRole('button', { name: defaultAppConfig.phaseLabels.after }));
    await user.click(screen.getByRole('button', { name: defaultAppConfig.practiceOptions[0] }));

    await user.click(screen.getAllByRole('button', { name: '일새' })[0]);
    await user.click(screen.getByRole('button', { name: '실천 완료 표시' }));
    expect(screen.getByRole('button', { name: '✓ 오늘 실천 완료' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '운영' })[0]);
    const operatorPanel = screen.getByText('현장 상태 변경').closest('section');
    expect(operatorPanel).not.toBeNull();

    const opButtons = screen.getAllByRole('button', { name: '혼잡' });
    await user.click(opButtons[0]);

    const logPanel = screen.getByText('변경 로그 (불변 기록)').closest('aside');
    expect(logPanel).not.toBeNull();
    if (logPanel) {
      expect(within(logPanel).getAllByText(/혼잡/).length).toBeGreaterThan(0);
    }
  });
});
