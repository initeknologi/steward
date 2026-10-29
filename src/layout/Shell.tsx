import { NavLink, Outlet } from "react-router-dom";
import { ACTORS, principalLabel } from "../format.ts";
import { store } from "../engine/store.ts";
import { useLedger } from "../engine/useLedger.ts";

export function Shell() {
  const ledger = useLedger();

  function reset() {
    const confirmed = window.confirm(
      "Replace the saved sample with a fresh one?",
    );
    if (confirmed) store.reset();
  }

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="kicker">Agent treasury</p>
            <strong>Steward</strong>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          <NavLink to="/" end>
            Console
          </NavLink>
          <NavLink to="/policies">Policies</NavLink>
          <NavLink to="/trace">Trace</NavLink>
        </nav>
        <p className="aside-note">
          Records verdicts. Does not hold funds.
        </p>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="segmented" role="group" aria-label="Environment mode">
            {(["observe", "enforce"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={ledger.mode === mode}
                onClick={() => store.setMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <label className="actor">
            <span>Acting as</span>
            <select value={ledger.actor} onChange={(event) => store.setActor(event.target.value)}>
              {ACTORS.map((actor) => (
                <option key={actor} value={actor}>
                  {principalLabel(actor)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="text-button" onClick={reset}>
            Reset sample
          </button>
        </header>
        <p className="mode-note">
          {ledger.mode === "enforce"
            ? "New requests are recorded as enforce. Pay only on an allow."
            : "New requests are recorded as observe. Payments still go through."}
        </p>
        <main id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
