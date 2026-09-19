// Jev probe, step 2: asks TypeSafe's Jev to pick the element for a goal from a saved agent view.
// Question: how long does one pick take, and how often is it right?
// Usage: node spikes/jev-capture.mjs, then TYPESAFE_API_KEY=... node spikes/jev.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'results/jev');
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error('Set TYPESAFE_API_KEY.');

const ACTIONABLE = /^\s*(link|button|textbox|combobox|searchbox|checkbox|tab|menuitem)\b/;
const REF = /\[(e\d+)\]/;
const NONE = 'none';

// `line` matches the right element's line. `after` narrows it to the first match below another line.
const GOALS = [
  ['books', 'Open the Science Fiction category', { line: /link "Science Fiction"/ }],
  ['books', 'Go to the next page of results', { line: /link "next"/ }],
  ['books', 'Add the book Tipping the Velvet to the basket', { line: /button "Add to basket"/, after: /heading 3 "Tipping the Velvet"/ }],
  ['books', 'Add the book Sharp Objects to the basket', { line: /button "Add to basket"/, after: /heading 3 "Sharp Objects"/ }],
  ['books', 'Open the details page for the book Soumission', { line: /link "Soumission"/ }],
  ['books', 'Sign in to my account', null],
  ['govuk', 'Refuse the optional cookies', { line: /Reject additional cookies/ }],
  ['govuk', 'Find out how to renew a driving licence', { line: /link "Driving licences"/ }],
  ['govuk', 'Check the MOT history of a car', { line: /Check the MOT history/ }],
  ['govuk', 'Pay the road tax for my car', { line: /Tax your vehicle|Vehicle tax, MOT/ }],
  ['govuk', 'I got a speeding ticket. Find out what the fine is.', { line: /Penalty points/ }],
  ['govuk', 'Open the site search', { line: /Show search menu/ }],
  ['govuk', 'Tell the site this page was helpful', { line: /Yes this page is useful/ }],
  ['hn', 'Log in', { line: /link "login"/ }],
  ['hn', 'Read the comments on the story about Zig and Rust', { line: /link "\d+ comments"/, after: /What Zig felt like/ }],
  ['hn', 'Open the story about full-text search for Postgres', { line: /link "Tin: full-text search/ }],
  ['hn', 'See the job listings', { line: /link "jobs"/ }],
  ['hn', 'Load the next page of stories', { line: /link "More"/ }],
  ['hn', 'Open the profile of the user who posted the ZX Spectrum story', { line: /link "graemep"/ }],
  ['hn', 'Switch the site to dark mode', null],
  ['github', 'Sign in', { line: /link "Sign in"/ }],
  ['github', 'Open the list of issues', { line: /link "Issues"/ }],
  ['github', 'Open the src folder', { line: /link "src, \(Directory\)"/ }],
  ['github', 'Switch to a different branch', { line: /button "main branch"/ }],
  ['github', 'Open the most recent commit', { line: /link "Hatch 0\.1\.2"|link "Commit dc8853f"/ }],
  ['github', 'Star this repository', { line: /star a repository/ }],
  ['mdn', 'Search the documentation', { line: /Search the site|Skip to search/ }],
  ['mdn', 'Jump to the browser compatibility section', { line: /link "Browser compatibility"/ }],
  ['mdn', 'Switch the page to dark mode', { line: /Switch color theme/ }],
  ['mdn', 'Read about the grid-template-columns property', { line: /link "grid-template-columns"/ }],
  ['mdn', 'Change the language of the page', { line: /button "English \(US\)"/ }],
  ['wikipedia', 'Log in', { line: /link "Log in"/ }],
  ['wikipedia', 'See the edit history of this article', { line: /link "View history"/ }],
  ['wikipedia', 'Read this article in another language', { line: /button "\d+ languages"/ }],
  ['wikipedia', 'Open the article about Google Chrome', { line: /link "Google Chrome"/ }],
  ['wikipedia', 'Open the discussion page for this article', { line: /link "Talk"/ }],
];

function expected(lines, want) {
  if (!want) return [NONE];
  const refs = [];
  let armed = !want.after;
  for (const l of lines) {
    if (!armed && want.after.test(l)) { armed = true; continue; }
    if (armed && want.line.test(l) && REF.test(l)) {
      refs.push(l.match(REF)[1]);
      if (want.after) break;
    }
  }
  return refs;
}

async function ask(state, questions) {
  const t0 = performance.now();
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, model: 'jev-latest', questions }),
  });
  const body = await res.json();
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return { ms, body };
}

// A choice takes 255 options, so a long page goes out as several questions in one call.
function questionsFor(goal, candidates, describe) {
  const questions = {};
  for (let i = 0; i < candidates.length; i += 254) {
    const criteria = { [NONE]: 'No element in this list does what the user wants.' };
    for (const c of candidates.slice(i, i + 254)) criteria[c.ref] = describe(c);
    questions[`q${i / 254}`] = {
      type: 'choice',
      instructions: `The state is an outline of a web page. Which element should be clicked or typed into to do this: "${goal}"? Choose "${NONE}" when no listed element does it.`,
      criteria,
    };
  }
  return questions;
}

function best(answers) {
  let pick = { ref: NONE, p: 0 };
  let noneP = 1;
  for (const a of Object.values(answers)) {
    noneP = Math.min(noneP, a.probabilities?.[NONE] ?? 0);
    for (const [ref, p] of Object.entries(a.probabilities ?? {})) if (ref !== NONE && p > pick.p) pick = { ref, p };
  }
  // The element wins when some chunk prefers it to "none".
  const chosen = Object.values(answers).some((a) => a.choice !== NONE);
  return chosen ? pick : { ref: NONE, p: noneP };
}

const MODES = {
  // The whole agent view is the state, so Jev sees what surrounds each element.
  full: (view, goal, cands) => [view, questionsFor(goal, cands, (c) => c.text)],
  // The goal is the state, and each option carries its own line and the heading above it.
  lean: (view, goal, cands) => [`The user wants to: ${goal}`, questionsFor(goal, cands, (c) => (c.near ? `${c.text} (under ${c.near})` : c.text))],
};

const views = {};
function load(page) {
  if (views[page]) return views[page];
  const view = readFileSync(join(dir, `${page}.txt`), 'utf8');
  const lines = view.split('\n');
  const cands = [];
  let near = '';
  for (const l of lines) {
    const h = l.match(/^\s*heading \d "([^"]+)"/);
    if (h) near = `heading "${h[1]}"`;
    if (ACTIONABLE.test(l) && REF.test(l)) cands.push({ ref: l.match(REF)[1], text: l.trim().replace(/\s*\[e\d+\]/, ''), near });
  }
  return (views[page] = { view, lines, cands });
}

await ask('warm up', { w: { type: 'noul', instructions: 'Is this a greeting?' } });

const rows = [];
for (const mode of Object.keys(MODES)) {
  for (const [page, goal, want] of GOALS) {
    const { view, lines, cands } = load(page);
    const ok = expected(lines, want);
    if (!ok.length) throw new Error(`No element matches the label for "${goal}" on ${page}. Capture the page again or fix the label.`);
    const [state, questions] = MODES[mode](view, goal, cands);
    try {
      const { ms, body } = await ask(state, questions);
      const pick = best(body.answers);
      rows.push({ mode, page, goal, ms, tokens: body.usage.input_tokens, options: cands.length, pick: pick.ref, p: +pick.p.toFixed(2), right: ok.includes(pick.ref), expected: ok });
    } catch (e) {
      rows.push({ mode, page, goal, error: e.message });
    }
    const r = rows.at(-1);
    console.log(`${mode}  ${page.padEnd(9)}  ${r.error ? 'ERROR ' + r.error : `${r.right ? 'right' : 'WRONG'}  ${String(r.ms).padStart(5)} ms  ${String(r.tokens).padStart(6)} tok  p=${r.p}  ${r.pick}`}  ${goal}`);
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const mode of Object.keys(MODES)) {
  const done = rows.filter((r) => r.mode === mode && !r.error);
  const sure = done.filter((r) => r.p >= 0.8);
  console.log(`\n${mode}: ${done.filter((r) => r.right).length}/${done.length} right; at p >= 0.8: ${sure.filter((r) => r.right).length}/${sure.length} right; median ${median(done.map((r) => r.ms))} ms, slowest ${Math.max(...done.map((r) => r.ms))} ms; median ${median(done.map((r) => r.tokens))} tokens; ${rows.filter((r) => r.mode === mode && r.error).length} errors`);
}
writeFileSync(join(dir, 'results.json'), JSON.stringify(rows, null, 2));
