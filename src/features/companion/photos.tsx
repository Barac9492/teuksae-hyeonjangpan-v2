import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { normalizePhotoMemo, renderFramedPhoto } from './canvas';
import { downloadBlob, SERVICE_DAYS, WEEKDAYS } from './dawn';
import { PageHeading } from './ui';
import './photos.css';
import { Community } from './Community';

const STAMPS_KEY = 'woori-photo-days-2026-v1';
const validDay = (day: number | null): day is number => day !== null && Number.isInteger(day) && day >= 0 && day < 6;
function readStamps(): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STAMPS_KEY) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((day): day is number => typeof day === 'number' && validDay(day)))] : [];
  } catch { return []; }
}

export function PhotosPanel({ eventDay }: { eventDay: number | null }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [stamps, setStamps] = useState(readStamps);
  const [rendered, setRendered] = useState<{ key: string; file: File } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const day = selectedDay ?? (validDay(eventDay) ? eventDay : null);
  const stamp = day === null ? '날짜 미지정' : `10월 ${SERVICE_DAYS[day]}일(${WEEKDAYS[day]}) 새벽`;
  const cleanMemo = normalizePhotoMemo(memo);
  const renderKey = JSON.stringify([photo, stamp, cleanMemo]);
  const readyFile = rendered?.key === renderKey ? rendered.file : null;
  useEffect(() => {
    let active = true;
    if (photo) {
      renderFramedPhoto(photo, stamp, cleanMemo).then((blob) => {
        if (active) setRendered({ key: renderKey, file: new File([blob], 'dawn-photo.png', { type: 'image/png' }) });
      }).catch(() => { if (active) { setFailedKey(renderKey); setMessage('사진을 읽거나 프레임을 만들지 못했어요. 다른 사진을 선택해주세요.'); } });
    }
    return () => { active = false; };
  }, [photo, stamp, cleanMemo, renderKey]);
  const clear = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null); setPhotoName(''); setMemo(''); setRendered(null); setMessage('사진과 메모를 화면에서 지웠어요. 날짜 도장은 별도로 지울 수 있어요.');
    if (inputRef.current) inputRef.current.value = '';
  };
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0) {
      setMessage('JPG·PNG·WebP 형식의 8MB 이하 사진을 선택해주세요.');
      event.target.value = ''; return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file); urlRef.current = url;
    setRendered(null); setPhoto(url); setPhotoName(normalizePhotoMemo(file.name)); setMessage('사진은 업로드되지 않았어요. 프레임을 준비하고 있어요.');
  };
  const download = () => {
    if (!readyFile) return;
    try { downloadBlob(readyFile, 'dawn-photo.png'); setMessage('다운로드를 요청했어요. 브라우저의 다운로드 목록을 확인해주세요.'); }
    catch { setMessage('다운로드를 시작하지 못했어요. 다시 시도해주세요.'); }
  };
  let canShare = false;
  try { canShare = !!readyFile && typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [readyFile] }); } catch { /* download remains available */ }
  const share = async () => {
    if (!readyFile || !canShare) { download(); return; }
    setSharing(true);
    try {
      // The prepared File preserves the click's user activation, with no render await first.
      await navigator.share({ files: [readyFile], title: '우리의 새벽 사진' });
      setMessage('공유 창에서 작업을 마쳤어요. 실제 전달 여부는 선택한 앱에서 확인해주세요.');
    } catch (error) {
      setMessage(typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
        ? '공유를 취소했어요. 자동으로 다운로드하지 않았습니다.'
        : '공유하지 못했어요. 아래 사진 다운로드 버튼으로 저장할 수 있어요.');
    } finally { setSharing(false); }
  };
  const addStamp = () => {
    if (!photo || !readyFile || day === null) return;
    const next = [...new Set([...stamps, day])].sort();
    try { localStorage.setItem(STAMPS_KEY, JSON.stringify(next)); setStamps(next); setMessage(`${stamp} 도장을 이 기기에 남겼어요. 출석 확인은 아닙니다.`); }
    catch { setMessage('이 브라우저에서 도장을 저장하지 못했어요.'); }
  };
  return (
    <section id="tc-panel-photos" className="tc-panel" role="tabpanel" aria-labelledby="tc-tab-photos">
      <PageHeading eyebrow="이 새벽을 오래 기억하도록" title="우리의 사진">함께한 순간을 한 장씩 남겨요.</PageHeading>
      <div className="tc-section tc-section--topless">
        <label className="tc-photo-field" htmlFor="tc-photo-day">사진에 남길 행사 날짜 (직접 선택 가능)
          <select id="tc-photo-day" value={day ?? ''} disabled={sharing} onChange={(e) => { setSelectedDay(e.target.value === '' ? null : Number(e.target.value)); setMessage(''); }}>
            {!validDay(eventDay) && <option value="">날짜를 선택해주세요</option>}
            {SERVICE_DAYS.map((date, i) => <option key={date} value={i}>10월 {date}일 ({WEEKDAYS[i]})</option>)}
          </select>
        </label>
        <p className="tc-footnote">{selectedDay !== null ? '직접 선택한 날짜이며 촬영일이나 출석을 확인하지 않습니다.' : validDay(eventDay) ? '오늘의 행사 날짜를 표시했어요. 다른 날짜로 바꿀 수 있어요.' : '오늘은 행사 기간이 아니에요. 기록할 날짜를 직접 선택해주세요.'}</p>
        {photo ? (
          <div className="tc-photo-preview">
            <figure className="tc-polaroid">
              <div className="tc-polaroid__image">
                <img src={photo} alt={`선택한 사진 미리보기: ${photoName}`} />
                {day !== null && <span className="tc-polaroid__stamp" aria-hidden="true">'26 10 {String(SERVICE_DAYS[day]).padStart(2, '0')}</span>}
              </div>
              <figcaption><strong>하나님 마음에 합한 사람</strong><small>{stamp} · 사도행전 13:22</small>{cleanMemo && <span className="tc-photo-memo">{cleanMemo}</span>}</figcaption>
            </figure>
            <p>내 화면의 미리보기 · 공개 접수 전에는 서버 전송 없음</p>
            <label className="tc-photo-field" htmlFor="tc-photo-memo">사진 아래 한 줄 (선택, 최대 40자)
              <input id="tc-photo-memo" value={memo} maxLength={40} disabled={sharing} placeholder="이 새벽에 기억하고 싶은 말" onChange={(e) => { setMemo(e.target.value); setMessage(''); }} />
            </label>
            <div className="tc-photo-actions">
              <button className="tc-primary" type="button" disabled={!readyFile || sharing} onClick={canShare ? share : download}>{sharing ? '공유 중…' : !readyFile ? failedKey === renderKey ? '사진을 다시 선택해주세요' : '프레임 준비 중…' : canShare ? '사진 공유하기' : '사진 다운로드'}</button>
              {canShare && <button className="tc-secondary" type="button" disabled={sharing} onClick={download}>사진 다운로드</button>}
              <button className="tc-line-action" type="button" disabled={sharing} onClick={clear}>사진·메모 지우기</button>
            </div>
          </div>
        ) : (
          <div className="tc-photo-empty">
            <div className="tc-polaroid-stack" aria-hidden="true"><span><i /></span><span><i /></span><span><i /><b>우리의 새벽</b></span></div>
            <h2>한 장의 사진, 한 줄의 기억</h2><p>내 사진에 프레임과 짧은 메모를 남겨보세요.</p>
          </div>
        )}
        <label className={photo ? 'tc-secondary tc-upload' : 'tc-primary tc-upload'} htmlFor="tc-photo-input">{photo ? '다른 사진 고르기' : '내 사진으로 미리보기'}</label>
        <input ref={inputRef} id="tc-photo-input" aria-label="내 사진으로 미리보기" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={sharing} hidden />
        <p className="tc-footnote">사진과 메모는 자동 저장·업로드하지 않아요. 공개 게시판 접수는 아래에서 별도로 동의해야 합니다. 공유는 직접 누를 때 선택한 앱으로 전달됩니다. 내보낸 PNG에는 원본 EXIF 정보가 포함되지 않아요. JPG·PNG·WebP, 최대 8MB</p>
        <div className="tc-photo-days">
          <h2>이 기기에 남긴 새벽 도장</h2>
          <p>사진을 고른 뒤 날짜별로 직접 남기는 개인 기록입니다. 출석 인증이나 전체 참여 인원이 아니에요. 사진과 메모는 저장하지 않습니다.</p>
          <ul>{SERVICE_DAYS.map((date, i) => <li key={date} data-stamped={stamps.includes(i)}>10/{date}<span>{stamps.includes(i) ? '남김' : '미기록'}</span></li>)}</ul>
          <button className="tc-secondary" type="button" disabled={!photo || !readyFile || day === null || sharing || stamps.includes(day)} onClick={addStamp}>{day !== null && stamps.includes(day) ? '이 날짜는 도장을 남겼어요' : '선택한 날짜에 도장 남기기'}</button>
          <button className="tc-line-action" type="button" onClick={() => {
            try { localStorage.removeItem(STAMPS_KEY); setStamps([]); setMessage('이 기기의 새벽 도장을 모두 지웠어요.'); }
            catch { setMessage('도장을 지우지 못했어요. 브라우저 저장소 설정을 확인해주세요.'); }
          }}>이 기기의 도장 모두 지우기</button>
        </div>
        {message && <p className="tc-form-status" role="status">{message}</p>}
        <Community kind="photo" text={cleanMemo} eventDay={day} file={readyFile} payloadKey={renderKey} />
        <div className="tc-quiet"><strong>함께 나온 분의 동의를 먼저 받아주세요.</strong><p>특히 어린이의 얼굴과 이름이 드러나는 사진은 보호자 동의와 공개 범위를 확인해야 합니다.</p></div>
      </div>
    </section>
  );
}
