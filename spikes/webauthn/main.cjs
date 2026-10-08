// Throwaway: what does WebAuthn do in Electron with and without configureWebAuthn?
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const page = `<!doctype html><title>wa</title><script>
async function probe(){
  const out = {};
  out.uvpaa = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(e=>'err '+e);
  out.conditional = await (PublicKeyCredential.isConditionalMediationAvailable?.() ?? Promise.resolve('n/a')).catch(e=>'err '+e);
  const t0 = performance.now();
  const race = (p) => Promise.race([p.then(()=>'resolved', e=>e.name+': '+e.message), new Promise(r=>setTimeout(()=>r('still pending after 8s'),8000))]);
  out.get = await race(navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'localhost',userVerification:'preferred',timeout:60000}}));
  out.getMs = Math.round(performance.now()-t0);
  return out;
}
</script>`;
const srv = http.createServer((q, r) => { r.setHeader('content-type','text/html'); r.end(page); }).listen(0, async () => {
  await app.whenReady();
  if (process.env.CONFIGURE) {
    try { app.configureWebAuthn({ touchID: { keychainAccessGroup: 'TEST.com.hatch.webauthn' } }); console.log('configured'); }
    catch (e) { console.log('configure threw', e.message); }
  }
  const win = new BrowserWindow({ show: true, width: 400, height: 300 });
  win.webContents.session.on('select-webauthn-account', (e, d, cb) => { console.log('select-webauthn-account', d.relyingPartyId, d.accounts.length); cb(); });
  await win.loadURL(`http://localhost:${srv.address().port}/`);
  console.log(JSON.stringify(await win.webContents.executeJavaScript('probe()', true)));
  app.quit();
});
