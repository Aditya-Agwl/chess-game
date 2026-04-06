type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmActionModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmBusy = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!visible) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="result-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="btn btn-dark" onClick={onConfirm} disabled={confirmBusy}>
            {confirmBusy ? "Please wait..." : confirmLabel}
          </button>
          <button className="btn btn-light" onClick={onCancel} disabled={confirmBusy}>
            {cancelLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
