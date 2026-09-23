import { useEffect, useState } from "react";
import type { MomentDraft } from "../../domain/types";
import {
  ACCEPTED_MOMENT_TYPES,
  formatFileSize,
  validateMomentUpload,
} from "./validation";

interface MomentsPanelProps {
  heading?: string;
  intro?: string;
  /** 항상 펼쳐 둔다. 토글 버튼을 숨긴다. */
  alwaysOpen?: boolean;
  /** 로컬 리허설 예시 장면 4장을 보여줄지. */
  showExamples?: boolean;
  /** 제목 블록을 그릴지. 바깥에 제목이 이미 있으면 false. */
  showHeading?: boolean;
  repositoryMode: "local" | "remote";
  connected: boolean;
  onDraftCreated: (draft: MomentDraft) => void;
  onUpload?: (file: File, draft: MomentDraft) => Promise<void>;
  onToast: (message: string) => void;
}

interface LocalPreview {
  url: string;
  fileName: string;
  mediaType: string;
  size: number;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `moment-${Date.now()}`;
}

export function MomentsPanel({
  heading = "오늘 특새 영상",
  intro = "촬영 파일은 자동 공개되지 않고 운영팀 검수 대기 상태로만 기록됩니다.",
  alwaysOpen = false,
  showExamples = true,
  showHeading = true,
  repositoryMode,
  connected,
  onDraftCreated,
  onUpload,
  onToast,
}: MomentsPanelProps) {
  const [openState, setOpen] = useState(false);
  const open = alwaysOpen || openState;
  const [consentChecked, setConsentChecked] = useState(false);
  const [preview, setPreview] = useState<LocalPreview | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0] ?? null;
    const validation = validateMomentUpload(file, consentChecked);
    if (!validation.ok || !file) {
      onToast(validation.message);
      event.target.value = "";
      return;
    }

    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview({
      url: URL.createObjectURL(file),
      fileName: file.name,
      mediaType: file.type,
      size: file.size,
    });

    const draft: MomentDraft = {
      id: generateId(),
      fileName: file.name,
      mediaType: file.type,
      size: file.size,
      status: "pending_review",
      createdAt: new Date().toISOString(),
    };
    onDraftCreated(draft);

    if (repositoryMode === "remote" && connected && onUpload) {
      setUploading(true);
      setUploadStatus("업로드 중");
      try {
        await onUpload(file, draft);
        setUploadStatus("검수 대기");
        onToast("파일을 올렸습니다. 운영팀 검수 전에는 공개되지 않습니다.");
      } catch {
        setUploadStatus("업로드 실패");
        onToast("파일을 올리지 못했습니다. 다시 시도해 주세요.");
      } finally {
        setUploading(false);
      }
    } else {
      setUploadStatus("로컬 검수 대기");
      onToast("이 기기에만 검수 대기 기록을 남겼습니다.");
    }
    event.target.value = "";
  };

  return (
    <section
      className="moment-wrap"
      aria-labelledby={showHeading ? "moments-heading" : undefined}
      aria-label={showHeading ? undefined : "사진·영상 업로드"}
    >
      {(showHeading || !alwaysOpen) && (
        <div className="moment-head">
          {showHeading && (
            <div>
              <h3 id="moments-heading">{heading}</h3>
              <p>{intro}</p>
            </div>
          )}
          {!alwaysOpen && (
            <button
              type="button"
              className="camera-btn"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              사진·영상 올리기
            </button>
          )}
        </div>
      )}

      {repositoryMode === "local" && showExamples && (
        <>
          <p className="file-hint">
            아래 장면은 로컬 리허설용 예시이며 실제 제출물이 아닙니다.
          </p>
          <div className="moments" aria-label="로컬 리허설 예시 장면">
            <article className="moment scene1">
              <span className="moment-tag">예시</span>
              <div className="moment-info">
                <div className="moment-time">03:52</div>
                <div className="moment-place">
                  송림 본당 앞 · 문 열림 안내 예시
                </div>
              </div>
            </article>
            <article className="moment scene2">
              <span className="moment-tag">예시</span>
              <div className="moment-info">
                <div className="moment-time">04:07</div>
                <div className="moment-place">드림센터 · 안내팀 준비 예시</div>
              </div>
            </article>
            <article className="moment scene3">
              <span className="moment-tag">예시</span>
              <div className="moment-info">
                <div className="moment-time">04:14</div>
                <div className="moment-place">체육관 · 예배 준비 예시</div>
              </div>
            </article>
            <article className="moment scene4">
              <span className="moment-tag">예시</span>
              <div className="moment-info">
                <div className="moment-time">04:18</div>
                <div className="moment-place">온라인 · 같은 시간 예배 예시</div>
              </div>
            </article>
          </div>
        </>
      )}

      {open && (
        <div
          className="share-panel open"
          role="region"
          aria-label="영상 업로드 패널"
        >
          <p>
            얼굴, 차량번호, 아이 이름이 보이지 않도록 촬영해 주세요.
            <br />
            {repositoryMode === "remote"
              ? connected
                ? "비공개 저장소로 전송하며 승인 전에는 공개되지 않습니다."
                : "공유 서버에 연결되지 않아 파일을 전송하지 않습니다."
              : "공유 서버 미연결로 이 기기에만 기록됩니다."}
          </p>
          <label className="consent">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            <span>영상에 나온 분들이 교회 내부 공유에 동의했습니다.</span>
          </label>
          <label
            className={`file-label ${
              !consentChecked || uploading || (repositoryMode === "remote" && !connected)
                ? "is-disabled"
                : ""
            }`}
            aria-disabled={
              !consentChecked || uploading || (repositoryMode === "remote" && !connected)
            }
          >
            촬영하거나 파일 선택
            <input
              type="file"
              accept={ACCEPTED_MOMENT_TYPES.join(",")}
              onChange={(event) => void handleFileChange(event)}
              disabled={
                !consentChecked ||
                uploading ||
                (repositoryMode === "remote" && !connected)
              }
            />
          </label>
          {!consentChecked && (
            <p className="file-hint" role="status">
              동의를 체크하면 파일 선택이 열립니다.
            </p>
          )}
          {preview && (
            <div className="uploaded-preview show" role="status">
              <strong>{uploadStatus}:</strong> {preview.fileName} (
              {preview.mediaType}, {formatFileSize(preview.size)})
            </div>
          )}
        </div>
      )}
    </section>
  );
}
