// As google-hide.cjs, plus Hatch's dialog stand-ins, which are no native functions.
try { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true }); } catch {}
try { Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true }); } catch {}
window.alert = (m) => {};
window.confirm = (m) => false;
window.prompt = (m, d) => null;
