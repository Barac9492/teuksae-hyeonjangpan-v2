import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotosPanel } from '../features/companion/photos';
import { renderFramedPhoto } from '../features/companion/canvas';
import { downloadBlob } from '../features/companion/dawn';
vi.mock('../features/companion/canvas', async (original) => ({ ...await original<typeof import('../features/companion/canvas')>(), renderFramedPhoto: vi.fn() }));
vi.mock('../features/companion/dawn', async (original) => ({ ...await original<typeof import('../features/companion/dawn')>(), downloadBlob: vi.fn() }));
const key = 'woori-photo-days-2026-v1';
const upload = () => fireEvent.change(screen.getByLabelText('내 사진으로 미리보기'), { target: { files: [new File(['pixels'], 'private-name.jpg', { type: 'image/jpeg' })] } });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  vi.mocked(renderFramedPhoto).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local-photo'), revokeObjectURL: vi.fn() });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('local photo feedback', () => {
  it('never stamps without a photo or silently defaults outside the event to October 5', () => {
    render(<PhotosPanel eventDay={null} />);
    expect(screen.getByLabelText(/사진에 남길 행사 날짜/)).toHaveValue('');
    const button = screen.getByRole('button', { name: '선택한 날짜에 도장 남기기' });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('renders memo to pixels and only persists selected day, not photo or memo', async () => {
    render(<PhotosPanel eventDay={null} />); upload();
    await waitFor(() => expect(screen.getByRole('button', { name: '사진 다운로드' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '선택한 날짜에 도장 남기기' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/사진에 남길 행사 날짜/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/사진 아래 한 줄/), { target: { value: '함께 걸었던 새벽' } });
    await waitFor(() => expect(renderFramedPhoto).toHaveBeenLastCalledWith('blob:local-photo', '10월 7일(수) 새벽', '함께 걸었던 새벽'));
    await waitFor(() => expect(screen.getByRole('button', { name: '선택한 날짜에 도장 남기기' })).toBeEnabled());
    expect(screen.getByText('함께 걸었던 새벽')).toHaveClass('tc-photo-memo');
    fireEvent.click(screen.getByRole('button', { name: '선택한 날짜에 도장 남기기' }));
    expect(localStorage.getItem(key)).toBe('[2]'); expect(localStorage.length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '사진 다운로드' }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(File), 'dawn-photo.png');
    expect(screen.getByRole('status')).toHaveTextContent('다운로드를 요청');
    fireEvent.click(screen.getByRole('button', { name: '이 기기의 도장 모두 지우기' }));
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('does not stamp an undecodable photo', async () => {
    vi.mocked(renderFramedPhoto).mockRejectedValue(new Error('decode'));
    render(<PhotosPanel eventDay={0} />); upload();
    await screen.findByText(/사진을 읽거나 프레임을 만들지 못했어요/);
    expect(screen.getByRole('button', { name: '선택한 날짜에 도장 남기기' })).toBeDisabled();
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('validates file type and size before preparing image', () => {
    render(<PhotosPanel eventDay={0} />);
    fireEvent.change(screen.getByLabelText('내 사진으로 미리보기'), { target: { files: [new File(['x'], 'bad.svg', { type: 'image/svg+xml' })] } });
    expect(renderFramedPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '선택한 날짜에 도장 남기기' })).toBeDisabled();
  });
  it('offers all-visitor posting and local download, never a recipient share menu', async () => {
    const share = vi.fn();
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<PhotosPanel eventDay={1} />); upload();
    const button = await screen.findByRole('button', { name: '사진 다운로드' });
    expect(screen.queryByRole('button', { name: '사진 공유하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '앱에 들어온 모든 분께 공개하기' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /앱 이용자 모두에게 공개/ })).not.toBeChecked();
    fireEvent.click(button);
    expect(downloadBlob).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('reads only valid persisted dates and clears photos independently', async () => {
    localStorage.setItem(key, '[0,5,5,6,-1,"private"]');
    render(<PhotosPanel eventDay={0} />); upload();
    await screen.findByRole('button', { name: '사진 다운로드' });
    expect(screen.getAllByText('남김')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '사진·메모 지우기' }));
    expect(screen.queryByAltText(/내 기기에서만 보이는 선택한 사진/)).not.toBeInTheDocument();
    expect(screen.getAllByText('남김')).toHaveLength(2);
  });
});
