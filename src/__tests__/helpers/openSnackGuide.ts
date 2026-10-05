import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
export async function openSnackGuide(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: '예배' }));
  const summary = screen.getByText('간식 나눔·아침 식사 안내', { exact: true });
  if (!summary.closest('details')?.open) await user.click(summary);
}
