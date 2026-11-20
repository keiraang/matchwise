/**
 * Matchwise app logic. Plain JS, no build step.
 * Sections: 1 State  2 Helpers  3 AI (Gemini)  4 Cards  5 Live/Demo engine
 *           6 Screens (onboarding, quiz, result, listen, settings)  7 Boot
 */
(function () {
  'use strict';

  const CFG = window.MATCHWISE_CONFIG || {};
  const SPORT = window.SPORTS[CFG.SPORT || 'soccer'];
  const MODES = SPORT.modes;
  const STORE_KEY = 'matchwise.v1';

  /* ============================ 1. STATE ============================ */
  const defaults = {
    mode: 'kickoff', quizDone: false, quizSkipped: false, quizResult: null, onboarded: false,
    textSize: 1, simple: false, lang: 'English', tts: false, apiKey: '', nudgeDismissed: false
  };
  let S = Object.assign({}, defaults, load());
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
  const apiKey = () => (S.apiKey || CFG.GEMINI_API_KEY || '').trim();

  /* ============================ 2. HELPERS ========================== */
  const $app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPES = {
    language: { icon: '🗣️', label: 'Language' }, move: { icon: '⚽', label: 'Move' },
    ref: { icon: '🟨', label: 'Ref call' }, crowd: { icon: '🔊', label: 'Crowd' }, moment: { icon: '🔥', label: 'Moment' }
  };

  function applyTextSize() { document.documentElement.style.setProperty('--fs', S.textSize); }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function openSheet(html) {
    closeSheet();
    const root = document.getElementById('sheet-root');
    root.innerHTML = `<div class="sheet-back" data-action="close-sheet"><div class="sheet" role="dialog" aria-modal="true" aria-label="Details">${html}
      <button class="btn btn-block" style="margin-top:1rem" data-action="close-sheet-btn">Close</button></div></div>`;
    root.querySelector('[data-action="close-sheet-btn"]').focus();
  }
  function closeSheet() { document.getElementById('sheet-root').innerHTML = ''; }

  // Jargon glossary -> one regex (longest terms first)
  const jargonIndex = {};
  Object.entries(SPORT.jargon).forEach(([k, v]) => { jargonIndex[k] = k; (v.aliases || []).forEach(a => { jargonIndex[a.toLowerCase()] = k; }); });
  const jargonRe = new RegExp('\\b(' + Object.keys(jargonIndex).sort((a, b) => b.length - a.length)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  function highlight(text) {
    let out = '', last = 0, m; jargonRe.lastIndex = 0;
    while ((m = jargonRe.exec(text))) {
      out += esc(text.slice(last, m.index)) + `<button class="jargon" data-action="define" data-term="${esc(jargonIndex[m[0].toLowerCase()])}" aria-label="Define ${esc(m[0])}">${esc(m[0])}</button>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  function defineTerm(term) {
    const j = SPORT.jargon[term]; if (!j) return;
    openSheet(`<p class="small muted">Quick definition</p><h2 class="hero" style="font-size:1.6rem">${esc(term)}</h2>
      <p style="margin-top:.6rem">${esc(j.meaning)}</p><p class="muted" style="margin-top:.6rem"><b style="color:#fff">Why it matters:</b> ${esc(j.why)}</p>`);
  }

  /* ============================ 3. AI (GEMINI) ====================== */
  // The system prompt from the product brief, with {mode} filled in per request.
  function systemPrompt() {
    return `You are Matchwise, a warm, friendly soccer companion for newcomers. You receive a short snippet of live commentary transcript and/or a crowd-sound label. Identify jargon, moves, referee decisions, and crowd reactions. Explain each in plain, jargon-free language, in one or two sentences, in a tone that makes the user feel smart and welcome, never condescending. Adapt the depth to the user's mode: ${MODES[S.mode].guide}. Always say why it matters right now. If you are unsure what happened, say so rather than guessing. Never invent match facts, stats, players or scores that aren't in the input. For crowd chants and culture, give accurate, respectful context and note when something is regional or varies by club. Do not reproduce offensive chant lyrics; if a chant is crude or offensive, say it is controversial and why, without quoting it. Return only valid JSON.
${SPORT.promptContext}
Return JSON: {"cards":[{"type":"language|move|ref|crowd|moment","title":"...","explanation":"...","why_it_matters":"...","deeper":"...","term":"optional highlighted word"}]}
Rules: at most 2 cards; return {"cards":[]} for trivial snippets; do not repeat anything in alreadyExplained.${S.simple ? '\nSimple English: use very short sentences and everyday words a 10-year-old knows.' : ''}${S.lang !== 'English' ? `\nWrite every text field in ${S.lang}.` : ''}`;
  }

  async function gemini(systemText, userText, timeoutMs = 9000) {
    if (!apiKey()) throw new Error('no-key');
    if (!navigator.onLine) throw new Error('offline');
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CFG.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } }
        })
      });
      if (!res.ok) throw new Error('http-' + res.status);
      const data = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      return JSON.parse(txt.replace(/^```json|```$/g, '').trim());
    } finally { clearTimeout(to); }
  }

  async function aiCards(snippet) {
    const payload = {
      commentary: snippet.text || '', crowd_sound: snippet.crowd || '',
      alreadyExplained: [...L.seen]
    };
    const json = await gemini(systemPrompt(), JSON.stringify(payload));
    const ok = Object.keys(TYPES);
    return (json.cards || []).filter(c => ok.includes(c.type) && c.title && c.explanation).slice(0, 2);
  }

  /* ============================ 4. CARDS ============================ */
  const keyOf = c => (c.term || c.title).toLowerCase();

  // Offline fallback: cached demo cards, else local glossary lookup.
  function fallbackCards(snippet) {
    if (snippet.cached) return snippet.cached.filter(c => c.modes.includes(S.mode));
    const out = []; let m; jargonRe.lastIndex = 0;
    while ((m = jargonRe.exec(snippet.text || '')) && out.length < 2) {
      const term = jargonIndex[m[0].toLowerCase()];
      if (out.some(c => c.term === term)) continue;
      const j = SPORT.jargon[term];
      out.push({ type: 'language', title: term[0].toUpperCase() + term.slice(1), explanation: j.meaning, why_it_matters: j.why, deeper: '', term });
    }
    return out;
  }

  async function explain(snippet) {
    let cards, usedAI = false;
    try { cards = await aiCards(snippet); usedAI = true; }
    catch (e) {
      cards = fallbackCards(snippet);
      if (!L.warnedOffline) {
        L.warnedOffline = true;
        toast(e.message === 'no-key' ? 'Using built-in explanations. Add a Gemini key in Settings for richer ones.'
          : 'Couldn\'t reach the AI, so I\'m using built-in explanations.');
      }
    }
    // Skip anything already explained this session.
    cards = cards.filter(c => !L.seen.has(keyOf(c)) || c.type === 'moment' || c.type === 'crowd');
    cards.slice(0, 2).forEach(c => { L.seen.add(keyOf(c)); addCard(c); });
    L.lastCards.push(...cards.slice(0, 2)); L.lastCards = L.lastCards.slice(-6);
    return usedAI;
  }

  function cardHtml(c, id) {
    const T = TYPES[c.type] || TYPES.language;
    return `<article class="ecard t-${esc(c.type)}" aria-label="${esc(T.label)}: ${esc(c.title)}">
      <span class="tag"><span aria-hidden="true">${T.icon}</span> ${esc(T.label)}</span>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.explanation)}</p>
      ${c.why_it_matters ? `<p class="why"><b>Why it matters now:</b> ${esc(c.why_it_matters)}</p>` : ''}
      ${c.deeper ? `<button class="more" data-action="more" aria-expanded="false" aria-controls="d${id}">Tell me more</button><p class="deeper" id="d${id}" hidden>${esc(c.deeper)}</p>` : ''}
    </article>`;
  }

  let cardCount = 0;
  function addCard(c) {
    const feed = document.getElementById('feed'); if (!feed) return;
    const empty = feed.querySelector('.empty'); if (empty) empty.remove();
    feed.insertAdjacentHTML('beforeend', cardHtml(c, ++cardCount));
    if (S.mode === 'tactics') feed.lastElementChild.querySelector('[data-action="more"]')?.click();
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    if (S.tts) speak(`${c.title}. ${c.explanation} ${c.why_it_matters || ''}`);
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text); u.rate = 1;
    speechSynthesis.speak(u);
  }

  /* ============================ 5. LIVE / DEMO ENGINE =============== */
  const L = {
    running: false, demo: false, rec: null, buffer: [], pendingCrowd: '', transcript: [],
    seen: new Set(), lastCards: [], timers: [], clock: null, startedAt: 0, queue: Promise.resolve(),
    stream: null, audioCtx: null, volTimer: null, warnedOffline: false, wantListening: false
  };

  // Snippets are processed one at a time so cards stay in order.
  const enqueue = snippet => { L.queue = L.queue.then(() => explain(snippet)).catch(() => {}); };

  function pushTranscript(text, crowd) {
    L.transcript.push({ ts: Date.now(), text, crowd });
    L.transcript = L.transcript.slice(-40);
    renderStrip();
  }
  function renderStrip(interim) {
    const el = document.getElementById('strip'); if (!el) return;
    const lines = L.transcript.slice(-3).map(l =>
      (l.text ? `<p>${highlight(l.text)}</p>` : '') + (l.crowd ? `<p class="crowdline">🔊 Crowd: ${esc(l.crowd)}</p>` : '')).join('');
    el.innerHTML = (lines || '<p class="muted">Captions will appear here. Underlined words are tappable.</p>') + (interim ? `<p class="muted">${esc(interim)}…</p>` : '');
    el.scrollTop = el.scrollHeight;
  }
  function setStatus(label, live) {
    const d = document.getElementById('dot'), s = document.getElementById('statusText');
    if (d) d.className = 'dot' + (live ? ' live' : ''); if (s) s.textContent = label;
  }
  function setListenBtn() {
    const b = document.getElementById('listenBtn'); if (!b) return;
    const mic = document.getElementById('demoToggle')?.checked;   // toggle = "use microphone instead"
    b.textContent = L.running ? '⏹ Disconnect' : mic ? '🎙️ Start microphone' : '🔌 Connect';
    b.setAttribute('aria-pressed', String(L.running));
  }

  function stopAll() {
    L.running = false; L.wantListening = false;
    L.timers.forEach(clearTimeout); L.timers = [];
    clearInterval(L.clock); clearInterval(L.volTimer);
    try { L.rec && (L.rec.onend = null, L.rec.stop()); } catch (e) { }
    L.rec = null;
    try { L.stream && L.stream.getTracks().forEach(t => t.stop()); } catch (e) { }
    try { L.audioCtx && L.audioCtx.close(); } catch (e) { }
    L.stream = L.audioCtx = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setStatus('Ready when you are', false); setListenBtn();
  }

  /* ---- Demo ---- */
  function startDemo() {
    stopAll(); L.running = L.demo = true; L.seen.clear(); L.warnedOffline = false; L.lastCards = [];
    L.startedAt = Date.now();
    setStatus('Connected · Demo stream 0:00', true); setListenBtn();
    L.clock = setInterval(() => {
      const s = Math.floor((Date.now() - L.startedAt) / 1000);
      setStatus(`Connected · Demo stream ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, true);
    }, 1000);
    SPORT.demo.events.forEach(ev => L.timers.push(setTimeout(() => {
      pushTranscript(ev.text, ev.crowd);
      if (ev.cached && ev.cached.length) enqueue({ text: ev.text, crowd: ev.crowd, cached: ev.cached });
    }, ev.t * 1000)));
    L.timers.push(setTimeout(() => { stopAll(); setStatus('Full time. Nice work!', false); toast('Stream ended. Press Connect to replay it.'); }, (SPORT.demo.durationSec + 2) * 1000));
  }

  /* ---- Live mic ---- */
  async function startLive() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return fallbackToDemo('This browser can\'t turn speech into text (try Chrome or Safari). Starting the demo match instead.');
    if (!navigator.mediaDevices?.getUserMedia) return fallbackToDemo('No microphone found. Starting the demo match instead.');
    try { L.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { return fallbackToDemo(e.name === 'NotAllowedError' ? 'Microphone is blocked, so here\'s the demo match instead.' : 'Couldn\'t start the microphone. Here\'s the demo match instead.'); }
    stopAllKeepStream(); L.running = true; L.demo = false; L.wantListening = true; L.seen.clear(); L.warnedOffline = false;
    setStatus('Listening', true); setListenBtn();
    startVolumeWatch();

    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const t = r[0].transcript.trim(); if (t) { L.buffer.push(t); pushTranscript(t, ''); } } else interim += r[0].transcript;
      }
      renderStrip(interim);
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') fallbackToDemo('Microphone is blocked, so here\'s the demo match instead.');
      else if (e.error === 'network') toast('Speech service is offline. Check your connection.');
    };
    rec.onend = () => { if (L.wantListening) try { rec.start(); } catch (e) { } };   // keep listening
    L.rec = rec; try { rec.start(); } catch (e) { }

    // Batch whatever was heard every few seconds. Only text is sent, never audio.
    L.clock = setInterval(() => {
      const text = L.buffer.join(' ').trim(), crowd = L.pendingCrowd;
      L.buffer = []; L.pendingCrowd = '';
      if (crowd) pushTranscript('', crowd);
      if (text || crowd) enqueue({ text, crowd });
    }, (CFG.BATCH_SECONDS || 9) * 1000);
  }
  function stopAllKeepStream() { L.timers.forEach(clearTimeout); L.timers = []; clearInterval(L.clock); }

  // Crowd sound heuristic: loudness only (nothing is recorded or uploaded).
  function startVolumeWatch() {
    try {
      const ctx = L.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(L.stream).connect(an);
      const buf = new Uint8Array(an.fftSize); let base = 0.02, loudFor = 0;
      L.volTimer = setInterval(() => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > Math.max(base * 2.4, 0.08)) { loudFor += 0.5; } else { if (loudFor >= 4) L.pendingCrowd = 'sustained loud chanting or singing'; else if (loudFor >= 1) L.pendingCrowd = 'sudden loud roar or cheer'; loudFor = 0; base = base * 0.95 + rms * 0.05; }
      }, 500);
    } catch (e) { /* crowd detection is a bonus */ }
  }

  // "Connect": attach to the livestream. Prototype: the stream is the demo commentary.
  function connectStream() {
    const b = document.getElementById('listenBtn'); b.disabled = true; b.textContent = '🔌 Connecting…';
    setStatus('Connecting to stream…', false);
    setTimeout(() => { b.disabled = false; startDemo(); }, 1500);
  }

  function fallbackToDemo(msg) {
    toast(msg);
    const t = document.getElementById('demoToggle'); if (t) t.checked = false;
    startDemo();
  }

  /* "Wait, what?": recap the last 30 seconds */
  async function waitWhat() {
    const cutoff = Date.now() - 30000;
    const recent = L.transcript.filter(l => l.ts >= cutoff);
    const text = recent.map(l => [l.text, l.crowd && `(crowd: ${l.crowd})`].filter(Boolean).join(' ')).join(' ').trim();
    if (!text && !L.lastCards.length) return toast('Nothing to recap yet. Start listening first!');
    openSheet('<p class="small muted">Wait, what?</p><h2 class="hero" style="font-size:1.5rem">The last 30 seconds</h2><p id="recap" style="margin-top:.6rem">Working it out…</p>');
    let summary;
    try {
      const sys = `You are Matchwise, a warm soccer companion for newcomers. Explain what just happened in the last 30 seconds in 2 to 3 simple, friendly sentences with no jargon. Never invent facts that aren't in the input; if unsure, say so. Mode: ${MODES[S.mode].guide}${S.simple ? ' Use very short sentences.' : ''}${S.lang !== 'English' ? ` Write in ${S.lang}.` : ''} Return only JSON: {"summary":"..."}`;
      summary = (await gemini(sys, JSON.stringify({ transcript_last_30s: text }))).summary;
    } catch (e) {
      summary = L.lastCards.length ? 'Here\'s the gist: ' + L.lastCards.slice(-3).map(c => c.explanation).join(' ') : `Here\'s what was just said: "${text}"`;
    }
    const el = document.getElementById('recap'); if (el) el.textContent = summary;
    if (S.tts) speak(summary);
  }

  /* ============================ 6. SCREENS ========================== */
  let screen = S.onboarded ? 'listen' : 'onboarding';
  function go(name) { if (screen === 'listen' && name !== 'listen') stopAll(); screen = name; render(); window.scrollTo(0, 0); }

  function render() { applyTextSize(); ({ onboarding, quiz: renderQuiz, result: renderResult, listen: renderListen, settings: renderSettings })[screen](); }
  const PRIVACY = 'Matchwise only listens while you\'re connected or using the microphone. Audio isn\'t saved.';

  /* ---- Onboarding ---- */
  function onboarding() {
    $app.innerHTML = `<section class="screen" style="justify-content:center">
      <div style="font-size:3rem" aria-hidden="true">⚽</div>
      <h1 class="hero">Watch any match.<br>Understand every moment.</h1>
      <p class="muted">Matchwise listens to the commentary and the crowd, then explains the jargon, the moves, the ref's calls and the chants, in plain words.</p>
      <div class="stack">
        <button class="btn btn-primary btn-block" data-action="start-quiz">Take the 2-min quiz</button>
        <button class="btn btn-block" data-action="skip-onboarding">Skip, just start</button>
      </div>
      <p class="small muted">🔒 ${PRIVACY}</p></section>`;
  }

  /* ---- Quiz ---- */
  let qi = 0, answers = [];
  function renderQuiz() {
    const q = SPORT.quiz[qi]; const done = qi;
    const opts = q.kind === 'mc'
      ? q.options.map((o, i) => ({ label: o, idx: i }))
      : [{ label: 'Yes, I know what it means', idx: 'know' }, { label: 'I\'ve heard it, but I\'m not sure', idx: 'heard' }];
    opts.push({ label: 'I have no idea', idx: 'none' });
    $app.innerHTML = `<section class="screen">
      <div class="topbar"><div><p class="small muted">Find your viewing style · no pressure</p><p class="small"><b>Question ${qi + 1} of ${SPORT.quiz.length}</b></p></div>
        <button class="btn btn-ghost" data-action="skip-quiz">Skip for now</button></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${SPORT.quiz.length}" aria-valuenow="${done}"><i style="width:${(done / SPORT.quiz.length) * 100}%"></i></div>
      <h1 class="hero" style="font-size:1.6rem">${esc(q.q)}</h1>
      <div class="stack" id="opts" role="group" aria-label="Answers">${opts.map(o => `<button class="opt" data-action="answer" data-idx="${o.idx}">${esc(o.label)}</button>`).join('')}</div>
      <div id="feedback" aria-live="polite"></div></section>`;
  }
  function answerQuiz(idx) {
    const q = SPORT.quiz[qi]; let score, msg;
    if (q.kind === 'mc') {
      const n = Number(idx);
      score = idx === 'none' ? 0 : n === q.correct ? 1 : 0;
      msg = idx === 'none' ? 'No worries at all, that\'s exactly why this app exists! ' : n === q.correct ? 'Nice one! ' : 'Good guess, and a really common mix-up. ';
      msg += q.explain;
      document.querySelectorAll('.opt').forEach(b => {
        b.disabled = true;
        if (b.dataset.idx === String(q.correct)) b.classList.add('right');
        else if (b.dataset.idx === String(idx)) b.classList.add('picked-wrong');
      });
    } else {
      score = idx === 'know' ? 1 : idx === 'heard' ? 0.5 : 0;
      msg = (idx === 'none' ? 'Totally fine! Here\'s the quick version: ' : idx === 'know' ? 'Great, you\'re ahead of the game! Quick reminder: ' : 'Close enough, here it is: ') + q.answer;
      document.querySelectorAll('.opt').forEach(b => { b.disabled = true; });
    }
    answers.push({ cat: q.cat, score });
    const last = qi === SPORT.quiz.length - 1;
    document.getElementById('feedback').innerHTML = `<div class="panel"><p>${esc(msg)}</p>
      <button class="btn btn-primary btn-block" style="margin-top:.8rem" data-action="next-q">${last ? 'See my viewing style' : 'Next'}</button></div>`;
    document.querySelector('[data-action="next-q"]').focus();
  }
  function recommend() {
    const sum = c => answers.filter(a => a.cat === c).reduce((s, a) => s + a.score, 0);
    const v = sum('vocab'), r = sum('rules'), c = sum('culture'), total = v + r + c;
    let mode, reason;
    if (total <= 3.5) { mode = 'kickoff'; reason = 'You\'re new to the sport and that\'s perfectly fine. We\'ll explain everything in simple words so you never feel lost.'; }
    else if (total >= 7) { mode = 'tactics'; reason = 'You already know your stuff, so we\'ll skip the basics and dig into formations, pressing and strategy.'; }
    else if (c >= 1.5 && c >= (v + r) / 3 + 0.5) { mode = 'culture'; reason = 'You seem drawn to the people side of the game. We\'ll focus on chants, rivalries, history and crowd emotion.'; }
    else { mode = 'casual'; reason = 'You know the basics. We\'ll only step in for jargon, unusual ref calls and the big moments.'; }
    return { mode, reason, total, v, r, c };
  }
  function renderResult() {
    const res = S.quizResult || recommend(); const m = MODES[res.mode];
    $app.innerHTML = `<section class="screen">
      <p class="small muted">Your viewing style</p>
      <div style="font-size:3rem" aria-hidden="true">${m.emoji}</div>
      <h1 class="hero">${esc(m.name)}</h1>
      <p>${esc(res.reason)}</p>
      <p class="muted">${esc(m.blurb)}</p>
      <div class="stack">
        <button class="btn btn-primary btn-block" data-action="accept-mode" data-mode="${res.mode}">Use ${esc(m.name)}</button>
        <button class="btn btn-block" data-action="pick-mode">Choose a different mode</button>
      </div><p class="small muted">You can change this anytime in Settings.</p></section>`;
  }
  function modePickerHtml(current) {
    return `<h2 class="hero" style="font-size:1.4rem;margin-bottom:.8rem">Choose your viewing mode</h2><div class="stack">${Object.values(MODES).map(m =>
      `<button class="modecard" aria-pressed="${m.id === current}" data-action="set-mode" data-mode="${m.id}"><b>${m.emoji} ${esc(m.name)}</b><br><span class="muted">${esc(m.blurb)}</span></button>`).join('')}</div>`;
  }

  /* ---- Listen ---- */
  function renderListen() {
    const m = MODES[S.mode];
    const nudge = !S.quizDone && !S.nudgeDismissed ? `<div class="panel nudge"><p>Want a mode that fits you better? <b>Take the 2-minute quiz.</b></p>
      <div class="row" style="margin-top:.6rem"><button class="btn btn-primary" data-action="start-quiz">Take the quiz</button><button class="btn" data-action="dismiss-nudge">Not now</button></div></div>` : '';
    $app.innerHTML = `<section class="screen" style="height:100dvh;padding-bottom:0">
      <div class="topbar">
        <button class="badge" data-action="open-modes" aria-label="Viewing mode: ${esc(m.name)}. Tap to change">${m.emoji} ${esc(m.name)}</button>
        <button class="icon-btn" data-action="settings" aria-label="Settings">⚙️</button>
      </div>
      <div class="status" aria-live="polite"><span id="dot" class="dot"></span><span id="statusText">Ready when you are</span></div>
      <div id="strip" class="strip" role="log" aria-label="Live captions"></div>
      <div id="feed" class="feed" role="log" aria-live="polite" aria-label="Explainer cards">
        <div class="empty muted"><p style="font-size:2rem" aria-hidden="true">👂</p><p>Press <b>Connect</b> to join the demo stream (a previous match commentary). Explanations will pop up here.</p></div>
      </div>
      ${nudge}
      <div class="controls" style="padding-bottom:calc(.8rem + env(safe-area-inset-bottom))">
        <div class="row"><button id="listenBtn" class="btn btn-primary listen" data-action="toggle-listen" aria-pressed="false">🔌 Connect</button></div>
        <label class="switch"><span class="small">Use my microphone instead</span><input id="demoToggle" type="checkbox" role="switch"></label>
        <button class="btn btn-block" data-action="wait-what">🤔 Wait, what? <span class="muted small">(explain the last 30 seconds)</span></button>
        <p class="small muted" style="text-align:center">🔒 ${PRIVACY}</p>
      </div></section>`;
    renderStrip(); setListenBtn();
    document.getElementById('demoToggle').addEventListener('change', () => { if (L.running) stopAll(); setListenBtn(); });
  }

  /* ---- Settings ---- */
  function renderSettings() {
    $app.innerHTML = `<section class="screen">
      <div class="topbar"><button class="btn" data-action="back">← Back</button><h1 class="hero" style="font-size:1.4rem">Settings</h1></div>
      <div class="panel stack"><h2>Viewing mode</h2>${modePickerHtml(S.mode).replace(/<h2.*?<\/h2>/, '')}
        <button class="btn btn-block" data-action="start-quiz">${S.quizDone ? 'Retake the quiz' : 'Take the 2-minute quiz'}</button></div>
      <div class="panel stack"><h2>Text size</h2>
        <div class="seg" role="group" aria-label="Text size">${[['Small', .9], ['Medium', 1], ['Large', 1.2], ['Huge', 1.4]].map(([l, v]) => `<button data-action="size" data-v="${v}" aria-pressed="${S.textSize === v}">${l}</button>`).join('')}</div>
        <label class="switch"><span>Simple English<br><span class="small muted">Shorter sentences, everyday words (AI explanations)</span></span><input type="checkbox" role="switch" data-setting="simple" ${S.simple ? 'checked' : ''}></label>
        <label class="switch"><span>Read cards aloud<br><span class="small muted">Text-to-speech for each new card</span></span><input type="checkbox" role="switch" data-setting="tts" ${S.tts ? 'checked' : ''}></label>
      </div>
      <div class="panel stack"><label for="lang"><b>Language</b></label>
        <select id="lang" data-setting="lang">${['English', 'Español', 'Français', 'Deutsch', 'Português', 'العربية', '日本語', '한국어', 'हिन्दी'].map(l => `<option ${S.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <p class="small muted">Preview: non-English languages ask Gemini to translate explanations. Built-in offline cards stay in English.</p></div>
      <div class="panel stack"><label for="key"><b>Gemini API key</b></label>
        <input id="key" type="password" autocomplete="off" placeholder="${CFG.GEMINI_API_KEY ? 'Set in config.js' : 'Paste key (stored only in this browser)'}" value="${esc(S.apiKey)}" data-setting="apiKey">
        <p class="small muted">Without a key the app uses built-in explanations.</p></div>
      <p class="small muted">🔒 ${PRIVACY} Only text transcripts are sent for explanation.</p>
      <button class="btn btn-block" data-action="reset">Reset all my data</button></section>`;
  }

  /* ---- Event delegation (one handler for the whole app) ---- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'close-sheet': if (e.target === el) closeSheet(); break;
      case 'close-sheet-btn': closeSheet(); break;
      case 'define': defineTerm(el.dataset.term); break;
      case 'more': { const d = el.nextElementSibling; const open = d.hidden; d.hidden = !open; el.setAttribute('aria-expanded', String(open)); el.textContent = open ? 'Show less' : 'Tell me more'; break; }
      case 'start-quiz': qi = 0; answers = []; S.onboarded = true; save(); go('quiz'); break;
      case 'skip-onboarding': S.onboarded = true; S.quizSkipped = true; S.mode = S.quizDone ? S.mode : 'kickoff'; save(); go('listen'); break;
      case 'skip-quiz': S.onboarded = true; S.quizSkipped = true; if (!S.quizDone) S.mode = 'kickoff'; save(); go('listen'); toast('No problem! Starting in Kickoff mode. You can take the quiz anytime.'); break;
      case 'answer': answerQuiz(el.dataset.idx); break;
      case 'next-q': if (qi < SPORT.quiz.length - 1) { qi++; renderQuiz(); } else { S.quizResult = recommend(); save(); go('result'); } break;
      case 'accept-mode': S.mode = el.dataset.mode; S.quizDone = true; save(); go('listen'); break;
      case 'pick-mode': openSheet(modePickerHtml(S.quizResult?.mode)); S.quizDone = true; break;
      case 'open-modes': openSheet(modePickerHtml(S.mode)); break;
      case 'set-mode': S.mode = el.dataset.mode; save(); closeSheet(); if (screen === 'result') { S.quizDone = true; save(); go('listen'); } else render(); toast(`Mode: ${MODES[S.mode].name}`); break;
      case 'settings': go('settings'); break;
      case 'back': go('listen'); break;
      case 'dismiss-nudge': S.nudgeDismissed = true; save(); document.querySelector('.nudge')?.remove(); break;
      case 'size': S.textSize = Number(el.dataset.v); save(); render(); break;
      case 'toggle-listen':
        if (L.running) { stopAll(); break; }
        if (document.getElementById('demoToggle').checked) startLive(); else connectStream(); break;
      case 'wait-what': waitWhat(); break;
      case 'reset': if (confirm('Clear your mode, quiz result and settings?')) { localStorage.removeItem(STORE_KEY); S = Object.assign({}, defaults); screen = 'onboarding'; render(); } break;
    }
  });
  document.addEventListener('change', e => {
    const k = e.target.dataset?.setting; if (!k) return;
    S[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; save();
  });
  window.addEventListener('offline', () => toast('You\'re offline. Using built-in explanations.'));

  /* ============================ 7. BOOT ============================= */
  render();
})();
