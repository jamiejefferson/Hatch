# Hatch sign-in for Chrome, Arc, Brave and Edge

This extension sends your sign-in for the site in the current tab to Hatch. The browser hands the site's cookies over itself, so macOS never asks for your password, as it does when Hatch reads a browser's cookie file.

## Install

1. Open `chrome://extensions` (in Arc, `arc://extensions`; in Edge, `edge://extensions`).
2. Switch on Developer mode.
3. Press Load unpacked and choose this folder. Hatch's Settings opens it for you under Sign-ins.
4. Pin the Hatch button to the toolbar.

## Use

1. Sign in to the site in your browser, with a password, Touch ID, a passkey or your phone.
2. Press the Hatch button and then "Send my sign-in".
3. Hatch sets the cookies and opens that site's pages again, signed in.

The browser warns at install that the extension can read every site's data. It needs that to read a site's cookies, because a permission asked for at the moment of sending can close the extension's window before it finishes. It reads cookies only when you press the button, and sends cookies for that one site, to `127.0.0.1` on this Mac alone. Hatch takes them only from this extension: its manifest carries a fixed key, so every copy has the id `hokaggdcgckaklkhecpnpplhmdbmmjjk`, and a web page cannot send a request with that origin.
