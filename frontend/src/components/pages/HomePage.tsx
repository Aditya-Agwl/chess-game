import { useState } from "react";
import type { MouseEvent } from "react";

type Props = {
  onPlay: () => void;
  onAnalyze: () => void;
};

export default function HomePage({ onPlay, onAnalyze }: Props) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function onMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    setTilt({
      x: (px - 0.5) * 16,
      y: (py - 0.5) * 16,
    });
  }

  function onLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <section
      className="home-stage"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        ["--tilt-x" as string]: `${tilt.x}px`,
        ["--tilt-y" as string]: `${tilt.y}px`,
      }}
    >
      <div className="chess-floaters" aria-hidden="true">
        <span className="piece p1">♘</span>
        <span className="piece p2">♛</span>
        <span className="piece p3">♞</span>
        <span className="piece p4">♜</span>
        <span className="piece p5">♝</span>
        <span className="piece p6">♔</span>
      </div>

      <div className="setup-card mode-card home-card">
        <h2>Choose Your Mode</h2>
        <p>Play now or review your recent games.</p>
        <div className="mode-actions mode-actions-vertical">
          <button className="btn btn-start" onClick={onPlay}>Play With Computer</button>
          <button className="btn btn-dark" onClick={onAnalyze}>Analyze Recent Games</button>
        </div>
      </div>
    </section>
  );
}
