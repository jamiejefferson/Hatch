// Sends the cookies the browser holds for the site in this tab to Hatch on this Mac. The browser hands them over itself,
// so macOS never asks for the Keychain. Hatch listens on 127.0.0.1 from port 42824, moving up when that port is taken.
const PORTS = Array.from({ length: 11 }, (_, i) => 42824 + i);

const lead = document.getElementById('lead');
const send = document.getElementById('send');
const result = document.getElementById('result');

/** The site a page belongs to, as Hatch counts it: app.figma.com gives figma.com, and shop.example.co.uk gives example.co.uk. */
function siteOf(host) {
  const clean = host.toLowerCase().replace(/\.$/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean) || !clean.includes('.')) return clean;
  const labels = clean.split('.');
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  const take = tld.length === 2 && second.length <= 3 && labels.length >= 3 ? 3 : 2;
  return labels.slice(-take).join('.');
}

function browserName() {
  const brands = (navigator.userAgentData?.brands ?? []).map((b) => b.brand);
  if (brands.includes('Microsoft Edge')) return 'Edge';
  if (brands.includes('Brave')) return 'Brave';
  if (brands.includes('Google Chrome')) return 'Chrome';
  return 'your browser';
}

const say = (text, error = false) => {
  result.textContent = text;
  result.className = error ? 'error' : '';
};

/** Tries each port Hatch may hold, and returns Hatch's answer. */
async function deliver(body) {
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/signin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const answer = await res.json().catch(() => null);
      if (answer && ('ok' in answer || 'error' in answer)) return answer;
    } catch {
      // Nothing listens on this port. The next one may be Hatch's.
    }
  }
  return null;
}

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url && URL.canParse(tab.url) ? new URL(tab.url) : null;
  if (!url || !/^https?:$/.test(url.protocol)) {
    lead.textContent = 'Open the website you signed in to in this tab, then press the Hatch button again.';
    return;
  }
  const site = siteOf(url.hostname);
  lead.textContent = `Hatch opens ${site} signed in, as you are here. Your Mac password stays out of it.`;
  send.textContent = `Send my sign-in for ${site} to Hatch`;
  send.hidden = false;
  send.addEventListener('click', async () => {
    send.disabled = true;
    say('');
    const cookies = await chrome.cookies.getAll({ domain: site });
    if (cookies.length === 0) {
      send.disabled = false;
      return say(`This browser holds no sign-in for ${site}. Sign in here first, then press the button again.`, true);
    }
    const answer = await deliver({ site, url: url.href, browser: browserName(), cookies });
    send.disabled = false;
    if (!answer) return say('Hatch is not running. Open Hatch, then press the button again.', true);
    if (!answer.ok) return say(answer.error || 'Hatch could not take the sign-in.', true);
    say(answer.reloaded ? `Hatch has your sign-in for ${site} and opened its pages again.` : `Hatch has your sign-in for ${site}. Open it in Hatch and you are signed in.`);
  });
}

void start();
