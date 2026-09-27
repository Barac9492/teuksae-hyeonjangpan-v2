export async function shareText(title: string, text: string): Promise<string> {
  if (!navigator.share) return '이 브라우저는 공유 메뉴를 지원하지 않아요. 내용을 직접 복사하거나 파일로 저장해주세요.';
  try {
    await navigator.share({ title, text });
    return '공유 메뉴를 닫았어요. 실제 전송 여부는 선택한 앱에서 확인해주세요.';
  } catch (error) {
    return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
      ? '공유를 취소했어요. 앱 서버에는 보내지 않았습니다.'
      : '공유 메뉴를 열지 못했어요. 내용을 직접 복사하거나 파일로 저장해주세요.';
  }
}

export function saveReflection(text: string, day: string) {
  const blob = new Blob([`${day} 특새 묵상\n\n${text}`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `특새-묵상-${day.replaceAll('/', '-')}.txt`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
