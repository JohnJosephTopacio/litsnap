export function App() {
  return (
    <>
      <main>
        <h1>LitSnap</h1>
        <p>Highlight a word in your book to see its meaning — without leaving the page.</p>
      </main>
      <footer>
        {/* New tab, so the reader is never interrupted (TERMS-4). */}
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          Terms
        </a>
      </footer>
    </>
  );
}
