/**
 * Commentary Simplifier (standalone part of Matchwise).
 * "Connect" attaches to a stream of commentary lines and rewrites each one in
 * plain words, explaining the jargon. In this prototype the only stream is the
 * demo: a previous commentary sample (sample-commentary.txt) replayed as live.
 * A real livestream would need a backend that transcribes the broadcast.
 *
 * Gemini does the simplifying; without a key it falls back to the built-in
 * soccer glossary (js/sports/soccer.js).
 */
(function () {
  'use strict';
  const CFG = window.MATCHWISE_CONFIG || {};
  const SPORT = window.SPORTS[CFG.SPORT || 'soccer'];
  const DEMO_URL = 'demo://previous-commentary';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = { connected: false, timers: [], queue: Promise.resolve(), history: [], warned: false };
  const status = m => { $('status').textContent = m; };

  function apiKey() {
    let k = $('key').value.trim() || (CFG.GEMINI_API_KEY || '').trim();
    if (!k) try { k = (JSON.parse(localStorage.getItem('matchwise.v1')) || {}).apiKey || ''; } catch (e) { }
    return k.trim();
  }

  /* ---- Glossary lookup (fallback + highlighting) ---- */
  const idx = {};
  Object.entries(SPORT.jargon).forEach(([k, v]) => { idx[k] = k; (v.aliases || []).forEach(a => { idx[a.toLowerCase()] = k; }); });
  const re = new RegExp('\\b(' + Object.keys(idx).sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  function findTerms(text) {
    const found = []; let m; re.lastIndex = 0;
    while ((m = re.exec(text))) { const t = idx[m[0].toLowerCase()]; if (!found.includes(t)) found.push(t); }
    return found;
  }
  function highlight(text) {
    let out = '', last = 0, m; re.lastIndex = 0;
    while ((m = re.exec(text))) { out += esc(text.slice(last, m.index)) + `<b style="color:var(--accent);text-decoration:underline dotted">${esc(m[0])}</b>`; last = m.index + m[0].length; }
    return out + esc(text.slice(last));
  }

  /* ---- Gemini: rewrite one line in plain words ---- */
  async function simplify(text) {
    const key = apiKey();
    if (!key || !navigator.onLine) throw new Error('fallback');
    const sys = `You are Matchwise, a friendly soccer companion for newcomers. You get one line of live commentary. Rewrite it in plain, jargon-free English that keeps the excitement, in one or two short sentences${$('simple').checked ? ', using very short sentences and everyday words a 10-year-old knows' : ''}. Then list each piece of soccer jargon or slang from the line as a term with a short plain-English meaning. Never add facts, players, stats or scores that aren't in the line. If unsure what a line means, say so. Return only JSON: {"simple":"...","terms":[{"term":"...","meaning":"..."}]}`;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CFG.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`, {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify({ previous_lines: T.history.slice(-3), line: text }) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } }
        })
      });
      if (!res.ok) throw new Error('http');
      const d = await res.json();
      return JSON.parse((d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '').replace(/^```json|```$/g, '').trim());
    } finally { clearTimeout(to); }
  }

  /* Each incoming line is queued so results stay in order. */
  function incoming(text) {
    const el = document.createElement('article'); el.className = 'line';
    el.innerHTML = `<div class="src">🎙️ ${highlight(text)}</div><div class="out muted">Simplifying…</div>`;
    const log = $('log'); log.appendChild(el); log.scrollTop = log.scrollHeight;
    T.queue = T.queue.then(async () => {
      let r;
      try { r = await simplify(text); }
      catch (e) {
        // Offline fallback: show the commentary plus glossary meanings.
        const terms = findTerms(text).map(t => ({ term: t, meaning: SPORT.jargon[t].meaning }));
        r = { simple: terms.length ? '' : 'Nothing tricky in this line.', terms };
        if (!T.warned) { T.warned = true; status('Connected. Using built-in definitions (add a Gemini key for full plain-English rewrites).'); }
      }
      T.history.push(text);
      const out = el.querySelector('.out'); out.className = 'out'; out.textContent = r.simple || '';
      if (!r.simple) out.hidden = true;
      if (r.terms && r.terms.length) el.insertAdjacentHTML('beforeend', `<ul class="terms">${r.terms.map(t => `<li>💡 <b>${esc(t.term)}</b>: ${esc(t.meaning)}</li>`).join('')}</ul>`);
      log.scrollTop = log.scrollHeight;
    });
  }

  /* ---- Parse "[mm:ss] text" lines (or plain lines) ---- */
  function parse(raw) {
    let t = 0;
    return raw.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = l.match(/^\[?(\d{1,2}):(\d{2})\]?\s+(.*)$/);
      const text = m ? m[3] : l; if (m) t = Number(m[1]) * 60 + Number(m[2]);
      const o = { t, text }; t += Math.max(2.5, text.split(/\s+/).length / 2.5); return o;
    });
  }

  /* ---- Connect / disconnect ---- */
  async function connect() {
    const url = $('stream').value.trim();
    $('go').disabled = true; T.warned = false; T.history = []; $('log').innerHTML = '';
    status('Connecting to stream…'); $('go').textContent = '🔌 Connecting…';
    await new Promise(r => setTimeout(r, 1500));
    if (url !== DEMO_URL) {
      $('stream').value = DEMO_URL;
      status('Live stream links aren\'t supported in this prototype yet, so I connected to the demo stream instead.');
    }
    let lines;
    try { lines = parse(await (await fetch('sample-commentary.txt')).text()); }
    catch (e) { $('go').disabled = false; $('go').textContent = '🔌 Connect'; return status('Couldn\'t load the demo stream. Serve the folder over http and try again.'); }
    T.connected = true; $('go').disabled = false; $('go').textContent = '⏹ Disconnect';
    if (url === DEMO_URL) status('● Connected · Demo stream (previous commentary)');
    const speed = Number($('speed').value) || 1;
    lines.forEach(l => T.timers.push(setTimeout(() => incoming(l.text), (l.t / speed) * 1000)));
    T.timers.push(setTimeout(() => { disconnect(); status('Stream ended. Press Connect to replay.'); }, (lines[lines.length - 1].t / speed + 3) * 1000));
  }
  function disconnect() {
    T.connected = false; T.timers.forEach(clearTimeout); T.timers = [];
    $('go').textContent = '🔌 Connect'; $('go').disabled = false;
  }
  $('go').onclick = () => { if (T.connected) { disconnect(); status('Disconnected.'); } else connect(); };
})();
