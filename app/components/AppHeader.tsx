"use client";

export default function AppHeader({ onReset }: { onReset?: () => void }) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden />
          <span>budget-helper</span>
        </div>
        {onReset && (
          <button className="btn btn-ghost btn-sm" onClick={onReset}>
            Start over
          </button>
        )}
      </div>
    </header>
  );
}
