// The Hatch guide. Plain script, no build step.
(() => {
  // The feedback service is the one the Hatch app writes to. This key inserts and reads nothing.
  const FEEDBACK_URL = 'https://zxyexylnnnojprmmdhzz.supabase.co';
  const FEEDBACK_KEY = 'sb_publishable_ft-eUqQ10ir2Dx8ycl0j2Q_xhbPfjIy';
  const GUIDE_VERSION = 'guide-web';
  const FEATURES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const STORE = 'hatch-guide';
  // The sizes the Hatch panel offers.
  const SIZES = [
    { name: 'Desktop', width: 960, height: 752 },
    { name: 'Laptop', width: 1440, height: 900 },
    { name: 'Tablet portrait', width: 768, height: 1024 },
    { name: 'Tablet landscape', width: 1024, height: 768 },
    { name: 'Mobile', width: 390, height: 844 },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE)) || {};
    } catch {
      return {};
    }
  };
  const state = { done: [], revealed: false, hintSeen: false, ...read() };
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {
      // A private window may refuse storage. The guide still works for this visit.
    }
  };

  // ---------- Toast ----------

  const toast = $('#toast');
  let toastTimer;
  const showToast = (text) => {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
  };

  // ---------- Done it! ----------

  const TICK =
    '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle class="tick-fill" cx="20" cy="20" r="18.5" stroke="#fff" stroke-width="3"/><path class="tick-mark" d="M12 20.5l5.5 5.5L28.5 14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const buttons = new Map();

  const paint = () => {
    for (const [stage, button] of buttons) {
      const done = state.done.includes(stage);
      button.setAttribute('aria-pressed', String(done));
      $('span', button).textContent = done ? 'Done!' : 'Done it!';
    }
    const count = FEATURES.filter((s) => state.done.includes(s)).length;
    $('#tried').textContent = count === FEATURES.length ? 'You tried all 9 features.' : `You tried ${count} of 9 features.`;
  };

  const setDone = (stage, done) => {
    const has = state.done.includes(stage);
    if (done === has) return;
    state.done = done ? [...state.done, stage] : state.done.filter((s) => s !== stage);
    save();
    paint();
    if (!done) return;
    if (stage === 2) hideHint();
    const left = FEATURES.filter((s) => !state.done.includes(s)).length;
    showToast(left ? `Stage ${stage} done. ${left} to go.` : `Stage ${stage} done. You tried every feature.`);
  };

  for (const row of $$('.try[data-try]')) {
    const stage = Number(row.dataset.try);
    const wrap = document.createElement('div');
    wrap.className = 'done-wrap';
    wrap.innerHTML = `<button type="button" class="done" aria-pressed="false">${TICK}<span>Done it!</span></button><button type="button" class="link-button" aria-expanded="false">Add feedback on this stage</button>`;
    row.append(wrap);

    const form = document.createElement('form');
    form.className = 'note-form';
    form.hidden = true;
    form.dataset.note = String(stage);
    form.innerHTML =
      '<textarea class="field" name="message" maxlength="4800" placeholder="What happened when you tried this?" aria-label="Your feedback on this stage" required></textarea><button type="submit" class="pill">Send</button><p class="note-status" aria-live="polite"></p>';
    row.after(form);

    const [done, link] = $$('button', wrap);
    buttons.set(stage, done);
    done.addEventListener('click', () => setDone(stage, !state.done.includes(stage)));
    link.addEventListener('click', () => toggleForm(form, link));
  }

  // ---------- Feedback ----------

  function toggleForm(form, opener) {
    form.hidden = !form.hidden;
    opener.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) $('textarea', form).focus({ preventScroll: true });
    layout();
  }

  const closeButton = $('#close-feedback');
  closeButton.addEventListener('click', () => toggleForm($('#close-form'), closeButton));

  const uuid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

  // Chrome reports a frozen macOS version, so the note names the platform alone.
  const osVersion = () => (/Mac/.test(navigator.userAgent) ? 'macOS' : navigator.platform || 'unknown');

  async function send(note, text) {
    const tag = note === 'close' ? '[Guide]' : `[Guide, stage ${note}]`;
    const res = await fetch(`${FEEDBACK_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        apikey: FEEDBACK_KEY,
        authorization: `Bearer ${FEEDBACK_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id: uuid(),
        kind: 'other',
        message: `${tag} ${text}`.slice(0, 5000),
        app_version: GUIDE_VERSION,
        os_version: osVersion(),
        screenshot_path: null,
      }),
    });
    if (!res.ok) throw new Error(`The feedback service answered ${res.status}.`);
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('.note-form');
    if (!form) return;
    e.preventDefault();
    const area = $('textarea', form);
    const status = $('.note-status', form);
    const button = $('button[type="submit"]', form);
    const text = area.value.trim();
    if (!text) return;
    button.disabled = true;
    status.textContent = 'Hatch is sending your note.';
    try {
      await send(form.dataset.note, text);
      area.value = '';
      status.textContent = 'Your note reached us. Thank you.';
    } catch {
      status.textContent = 'Your note did not send. Check your connection and press Send again.';
    }
    button.disabled = false;
    layout();
  });

  // ---------- The sidebar hint ----------

  // Hatch's sidebar is 320px wide, so a width change of about that much is the sidebar and nothing else.
  const SIDEBAR = 320;
  const hint = $('#sidebar-hint');
  const hideHint = () => {
    if (hint.hidden) return;
    hint.hidden = true;
    state.hintSeen = true;
    save();
  };
  hint.hidden = state.hintSeen || state.done.includes(2);
  $('#hint-close').addEventListener('click', hideHint);

  // ---------- Stage 3: the reveal ----------

  const stage3 = $('#stage-3');
  let settledWidth = window.innerWidth;
  let settleTimer;

  const reveal = () => {
    if (state.revealed) return;
    state.revealed = true;
    save();
    stage3.classList.add('revealed');
    layout();
    setDone(3, true);
  };

  if (state.revealed) stage3.classList.add('revealed');

  // Hatch hears Esc too and leaves Fit to view, so the page lets the key through.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && showing === 3) reveal();
  });

  // ---------- Stage 5: the size readout ----------

  const readoutSize = $('#readout-size');
  const readoutName = $('#readout-name');
  let sawWide = window.innerWidth > 390;

  const measure = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    readoutSize.textContent = `${w} × ${h}`;
    const match = SIZES.find((s) => s.width === w && s.height === h) || SIZES.find((s) => s.width === w);
    for (const el of $$('.control[data-size]')) el.classList.toggle('active', match !== undefined && el.dataset.size === `${match.width}x${match.height}`);
    readoutName.textContent = match ? `This Hatch is at the ${match.name} size.` : 'This Hatch is at a custom size.';
    if (w > 390) sawWide = true;
    if (w <= 390 && sawWide && scrolledTo(5)) setDone(5, true);
  };

  // ---------- Stage 7: the agent's press ----------

  $('#agent-button').addEventListener('click', () => {
    const answer = $('#agent-answer');
    answer.textContent = 'Your agent is driving Hatch.';
    answer.classList.add('live');
    setDone(7, true);
  });

  $('#copy-prompt').addEventListener('click', async (e) => {
    const text = $('#agent-prompt').textContent;
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('#agent-prompt'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      e.target.textContent = 'Press ⌘C';
    }
    setTimeout(() => (e.target.textContent = 'Copy'), 2000);
  });

  $('#sample-button').addEventListener('click', () => showToast('The sample button felt that press.'));

  // ---------- Stage 9: the practice form ----------

  $('#practice-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const answer = $('#practice-answer');
    answer.textContent = 'The practice form accepted the sign-in. Nothing left this page.';
    answer.classList.add('live');
    setDone(9, true);
  });

  // ---------- Layered panels and the progress bar ----------

  const panels = $$('.panel');
  const stages = panels.filter((p) => p.dataset.stage);
  const fill = $('#progress-fill');
  const count = $('#progress-count');
  let tops = [];
  let current = 1;
  let showing = 1;

  // A sticky panel reports its stuck position, so the natural tops come from the heights.
  function layout() {
    const header = $('.progress').offsetHeight;
    const view = window.innerHeight;
    let y = $('#guide').offsetTop;
    tops = panels.map((panel) => {
      const top = y;
      const height = panel.offsetHeight;
      // A panel taller than the view scrolls to its foot before the next one covers it.
      panel.style.top = `${Math.min(header, view - height)}px`;
      y += height;
      return top;
    });
    track();
  }

  function track() {
    const line = window.scrollY + window.innerHeight * 0.5;
    let stage = 1;
    stages.forEach((panel) => {
      if (tops[panels.indexOf(panel)] <= line) stage = Number(panel.dataset.stage);
    });
    showing = stage;
    if (stage >= 3) hideHint();
    current = Math.max(current, stage);
    fill.style.width = `${(stage / stages.length) * 100}%`;
    count.textContent = `${String(stage).padStart(2, '0')} / ${stages.length}`;
  }

  const scrolledTo = (stage) => current >= stage;

  window.addEventListener('scroll', track, { passive: true });
  // A resize arrives in steps, so the page reads the change once the width has settled.
  const settle = () => {
    const delta = window.innerWidth - settledWidth;
    settledWidth = window.innerWidth;
    if (Math.abs(Math.abs(delta) - SIDEBAR) <= 24) {
      if (delta < 0) hideHint();
      return;
    }
    // Leaving Fit to view changes the page's width, which is how the page sees the canvas appear.
    if (Math.abs(delta) > 40 && scrolledTo(3)) reveal();
  };

  window.addEventListener('resize', () => {
    layout();
    measure();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 250);
  });
  if (document.fonts?.ready) document.fonts.ready.then(layout);
  window.addEventListener('load', layout);

  paint();
  layout();
  measure();
})();
