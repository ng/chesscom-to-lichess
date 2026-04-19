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
    });
    if (!result || !result.pgn) {
      throw new Error((result && result.error) || 'Could not find a PGN on this page.');
    }

    setStatus('Uploading to Lichess…');
    const res = await fetch('https://lichess.org/api/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ pgn: result.pgn }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const snippet = text.replace(/\s+/g, ' ').slice(0, 140);
      throw new Error(`Lichess returned ${res.status} (non-JSON): ${snippet}`);
    }
    if (!res.ok || !data.url) {
      throw new Error(data.error || `Lichess returned ${res.status}`);
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: closeShareModalOnPage,
    }).catch(() => {});

    chrome.tabs.create({ url: data.url });
    statusEl.innerHTML = `Opened <a href="${data.url}" target="_blank" rel="noopener">${data.url}</a>`;
  } catch (err) {
    setStatus('Error: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
});

// Runs in the chess.com page. Must be self-contained — no closures.
function closeShareModalOnPage() {
  const click = (el) =>
    el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  const closeBtn = document.querySelector(
    '[data-cy="modal-close-button"], [aria-label="Close" i], .modal-close'
  );
  if (closeBtn) click(closeBtn);
}

// Runs in the chess.com page. Must be self-contained — no closures.
function extractPgnFromPage() {
  return new Promise((resolve) => {
    const click = (el) =>
      el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    // Chess.com's PGN textarea holds the PGN in the `value` attribute (Vue binding).
    // `.value` property may be empty when the framework hasn't synced text content,
    // so fall back to getAttribute('value') and textContent.
    const readPgn = () => {
      const ta =
        document.querySelector('textarea[name="pgn"]') ||
        document.querySelector('textarea.share-menu-tab-pgn-textarea');
      if (ta) {
        const v = ta.value || ta.getAttribute('value') || ta.textContent || '';
        if (/^\s*\[Event /m.test(v)) return v;
      }
      for (const t of document.querySelectorAll('textarea')) {
        const v = t.value || t.getAttribute('value') || t.textContent || '';
        if (/^\s*\[Event /m.test(v)) return v;
      }
      return null;
    };

    const existing = readPgn();
    if (existing) return resolve({ pgn: existing });

    const findByText = (selector, matcher) =>
      [...document.querySelectorAll(selector)].find((el) => matcher((el.textContent || '').trim()));

    const shareBtn =
      document.querySelector(
        'button[aria-label*="Share" i], a[aria-label*="Share" i], button[data-cy*="share" i]'
      ) || findByText('button, a', (t) => t.toLowerCase() === 'share');
    if (!shareBtn) return resolve({ error: 'Share button not found. Is the game finished?' });
    click(shareBtn);

    let attempts = 0;
    const tick = () => {
      attempts++;
      const pgnTab =
        document.querySelector('[data-cy="pgn-tab-button"], #tab-pgn') ||
        findByText('button, [role="tab"]', (t) => t.toUpperCase() === 'PGN');
      if (pgnTab && pgnTab.getAttribute('aria-selected') !== 'true') click(pgnTab);

      const pgn = readPgn();
      if (pgn) {
        const closeBtn = document.querySelector(
          '[data-cy="modal-close-button"], [aria-label="Close" i], .modal-close'
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
