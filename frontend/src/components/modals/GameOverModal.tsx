import type { GameOverModalState } from "../../types";

type Props = {
  modal: GameOverModalState;
  onNewGame: () => void;
  onClose: () => void;
};

export default function GameOverModal({ modal, onNewGame, onClose }: Props) {
  if (!modal.visible) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <h2 id="result-title">{modal.title}</h2>
        <p>{modal.message}</p>
        <div className="modal-actions">
          <button className="btn btn-reset" onClick={onNewGame}>
            Back to Setup
          </button>
          <button className="btn btn-light" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
