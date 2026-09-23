import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { saveFramedPhoto } from './canvas';
import { SERVICE_DAYS, WEEKDAYS } from './dawn';
import { PageHeading } from './ui';

export function PhotosPanel({ eventDay }: { eventDay: number | null }) {
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const day = eventDay ?? 0;
  const stamp = `10월 ${SERVICE_DAYS[day]}일(${WEEKDAYS[day]}) 새벽`;
  const clear = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null);
    setMessage('');
    if (inputRef.current) inputRef.current.value = '';
  };
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setMessage('JPG·PNG·WebP 형식의 8MB 이하 사진을 선택해주세요.');
      event.target.value = '';
      return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setPhoto({ url, name: file.name });
    setMessage('내 화면에서만 사진 미리보기를 만들었어요. 업로드되지 않았습니다.');
  };
  return (
    <section id="tc-panel-photos" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-photos">
      <PageHeading eyebrow="이 새벽을 오래 기억하도록" title="우리의 사진">함께한 순간을 한 장씩 남겨요.</PageHeading>
      <div className="tc-section tc-section--topless">
        {photo ? (
          <div className="tc-photo-preview">
            <figure className="tc-polaroid">
              <div className="tc-polaroid__image">
                <img src={photo.url} alt={`내 기기에서만 보이는 선택한 사진: ${photo.name}`} />
                <span className="tc-polaroid__stamp" aria-hidden="true">'26 10 {String(SERVICE_DAYS[day]).padStart(2, '0')}  04:40</span>
              </div>
              <figcaption><strong>하나님 마음에 합한 사람</strong><small>{stamp} · 사도행전 13:22</small></figcaption>
            </figure>
            <p>내 화면의 미리보기 · 서버 전송 없음</p>
            <div className="tc-photo-actions">
              <button
                className="tc-primary"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try { await saveFramedPhoto(photo.url, stamp); setMessage('포스터 프레임을 씌운 사진을 내 기기에 저장했어요.'); } catch { setMessage('이 브라우저에서는 저장하지 못했어요. 화면을 캡처해 주세요.'); }
                  setSaving(false);
                }}
              >
                {saving ? '만드는 중…' : '프레임 씌워 내 기기에 저장'} <span aria-hidden="true">↓</span>
              </button>
              <button className="tc-line-action" type="button" onClick={clear}>사진 지우기 <span aria-hidden="true">×</span></button>
            </div>
          </div>
        ) : (
          <div className="tc-photo-empty">
            <div className="tc-polaroid-stack" aria-hidden="true">
              <span><i /></span><span><i /></span><span><i /><b>{stamp}</b></span>
            </div>
            <h2>첫 새벽을 기다리는 자리</h2>
            <p>아직 공개된 사진이 없습니다.</p>
          </div>
        )}
        <label className={photo ? 'tc-secondary tc-upload' : 'tc-primary tc-upload'} htmlFor="tc-photo-input">{photo ? '다른 사진 고르기' : '내 사진으로 미리보기'} <span aria-hidden="true">＋</span></label>
        <input ref={inputRef} id="tc-photo-input" aria-label="내 사진으로 미리보기" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} hidden />
        <p className="tc-footnote">내 화면에서만 보이며 업로드·공개되지 않아요. JPG·PNG·WebP, 최대 8MB</p>
        {message && <p className="tc-form-status" role="status">{message}</p>}
        <div className="tc-quiet"><strong>함께 나온 분의 동의를 먼저 받아주세요.</strong><p>특히 어린이의 얼굴과 이름이 드러나는 사진은 보호자 동의와 공개 범위를 확인해야 합니다.</p></div>
      </div>
    </section>
  );
}
