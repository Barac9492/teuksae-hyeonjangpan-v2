interface ToastProps {
  message: string;
  visible: boolean;
}

export function Toast({ message, visible }: ToastProps) {
  return (
    <div className={`toast ${visible ? 'show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
