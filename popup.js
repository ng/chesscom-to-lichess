const btn = document.getElementById('import-btn');
const statusEl = document.getElementById('status');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', !!isError);
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  setStatus('Grabbing PGN from chess.com…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https:\/\/(www\.)?chess\.com\//.test(tab.url)) {
      throw new Error('Open a chess.com game tab, then try again.');
    }

    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPgnFromPage,
      world: 'MAIN',
    });
    if (!result || !result.pgn) {
      throw new Error((result && result.error) || 'Could not find a PGN on this page.');
    }

    setStatus('Uploading to Lichess…');
    const res = await fetch('https://lichess.org/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ pgn: result.pgn }),
    });
    if (!res.ok) {
      throw new Error(`Lichess returned ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (!data.url) throw new Error('Lichess response missing game URL.');

    chrome.tabs.create({ url: data.url });
    statusEl.innerHTML = `Opened <a href="${data.url}" target="_blank" rel="noopener">${data.url}</a>`;
  } catch (err) {
    setStatus('Error: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
});

// Runs in the chess.com page. Must be self-contained — no closures.
function extractPgnFromPage() {
  return new Promise((resolve) => {
    const click = (el) =>
      el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    const readPgnTextarea = () => {
      for (const t of document.querySelectorAll('textarea')) {
        const v = t.value || '';
        if (/^\s*\[Event /m.test(v)) return v;
      }
      return null;
    };

    const existing = readPgnTextarea();
    if (existing) return resolve({ pgn: existing });

    const findByText = (selector, matcher) =>
      [...document.querySelectorAll(selector)].find((el) => matcher((el.textContent || '').trim()));

    const shareBtn =
      document.querySelector(
        'button[aria-label*="Share" i], button[data-cy="share"], a[aria-label*="Share" i]'
      ) ||
      findByText('button, a', (t) => t.toLowerCase() === 'share');
    if (!shareBtn) return resolve({ error: 'Share button not found. Is the game finished?' });
    click(shareBtn);

    let attempts = 0;
    const tick = () => {
      attempts++;
      const pgnTab = findByText('button, a, span, div', (t) => t.toUpperCase() === 'PGN');
      if (pgnTab) click(pgnTab);
      const pgn = readPgnTextarea();
      if (pgn) {
        // Best-effort: close modal so UI returns to normal.
        const closeBtn = document.querySelector(
          '[aria-label="Close" i], button[aria-label*="close" i], .modal-close'
        );
        if (closeBtn) click(closeBtn);
        return resolve({ pgn });
      }
      if (attempts > 50) return resolve({ error: 'Timed out reading PGN from share modal.' });
      setTimeout(tick, 100);
    };
    setTimeout(tick, 200);
  });
}
