export const ACCEPTED_MOMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
] as const;

export const MAX_MOMENT_SIZE_BYTES = 20 * 1024 * 1024;

export interface MomentValidationResult {
  ok: boolean;
  message: string;
}

export function validateMomentUpload(file: File | null, consentChecked: boolean): MomentValidationResult {
  if (!consentChecked) {
    return { ok: false, message: '촬영 동의를 먼저 확인해 주세요.' };
  }
  if (!file) {
    return { ok: false, message: '파일을 다시 선택해 주세요.' };
  }
  if (!ACCEPTED_MOMENT_TYPES.includes(file.type as (typeof ACCEPTED_MOMENT_TYPES)[number])) {
    return { ok: false, message: 'JPG, PNG, WEBP, MP4, MOV 파일만 올릴 수 있습니다.' };
  }
  if (file.size > MAX_MOMENT_SIZE_BYTES) {
    return { ok: false, message: '파일 크기는 20MB 이하로만 올릴 수 있습니다.' };
  }
  return { ok: true, message: '운영팀 검수 대기 상태로 저장했습니다.' };
}

export function formatFileSize(size: number): string {
  const mb = size / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}
