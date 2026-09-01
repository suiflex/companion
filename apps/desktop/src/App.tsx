export default function App() {
  return (
    <div className="shell">
      <aside className="rail" aria-label="Navigasi utama">
        <span className="brand">Com</span>
        <button type="button" title="Catatan" className="rail-btn" aria-label="Catatan">
          ▤
        </button>
        <button type="button" title="Rapat masuk" className="rail-btn" aria-label="Rapat masuk">
          ◈
        </button>
        <button type="button" title="Tanya lintas nota" className="rail-btn" aria-label="Tanya lintas nota">
          ✦
        </button>
        <button type="button" title="Vault & jembatan" className="rail-btn rail-spacer" aria-label="Vault & jembatan">
          ⚙
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <span className="vault">~/Companion</span>
          <span className="badge">EXT TERSAMBUNG</span>
        </header>
        <section className="empty">
          <h1>Companion Desktop</h1>
          <p>Scaffold Tauri 2 — shell desktop untuk vault lokal. UI dikerjakan bertahap.</p>
        </section>
      </main>
    </div>
  );
}
