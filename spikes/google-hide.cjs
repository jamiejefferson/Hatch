// Runs in the page's own world before its scripts: hides what only Chromium has.
try { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true }); } catch {}
try { Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true }); } catch {}
