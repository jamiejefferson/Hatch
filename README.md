# Hatch

A stripped-down macOS browser that any MCP-capable agent can drive, built for people who design and develop websites with agents.

Pages sit as frames, called Hatches, on a canvas. The user compares pages side by side, zooms the canvas, drags a Hatch taller to see more of a page, and switches one Hatch to Fit to view for the look of an ordinary browser. Hatch holds no AI: the user's own agent (Claude Code or any other MCP client) opens pages, reads them, acts on them and answers the comments the user pins.

Hatch is a trial build. It changes often, and the feedback button inside it is the fastest way to shape it.

## Install it

Hatch needs a Mac with Apple silicon. Paste this line into Terminal:

```
curl -fsSL https://raw.githubusercontent.com/jamiejefferson/hatch/main/install.sh | sh
```

It downloads the latest release, puts `Hatch.app` in Applications and opens it. macOS shows no warning, because a download made this way carries no quarantine mark. The same line installs a newer version over an older one, and the workspace stays as it was.

To install by hand instead:

1. Download `Hatch-<version>-mac-arm64.zip` from the [latest release](https://github.com/jamiejefferson/hatch/releases/latest), unzip it and move `Hatch.app` to Applications.
2. Open Hatch. macOS says it cannot check the app, because the trial build carries no Apple Developer ID. Choose Done.
3. Open System Settings, then Privacy & Security. Scroll to the line about Hatch and choose Open Anyway. macOS asks once.

A terminal does the same in one line: `xattr -dr com.apple.quarantine /Applications/Hatch.app`.

Hatch has no automatic update. The install line above fetches whichever version is newest.

## Start using it

Hatch opens with a six-step guide that points at the real controls. Help > Show the Guide runs it again.

1. **Open a page.** The plus button in the Hatch panel opens a Hatch, and so does a double tap on empty canvas.
2. **Add a project.** The Projects panel takes a folder. Hatch starts its dev server and serves it at `hatch:<name>`.
3. **Pin a comment.** Select a Hatch, choose the comment tool and pick an element.
4. **Hand Hatch to your agent.** Hatch needs no setup. When you want your agent to use it, press "Copy the details for your agent" in Settings and paste them to the agent. `connect/README.md` holds the setup by hand for Claude Code, Claude Desktop, Cursor, VS Code and Codex CLI.

## Send feedback

The speech-bubble icon in the top strip, and Help > Send Feedback, open a short form that takes a kind, such as a bug or an idea, and a message. Hatch adds its own version and the macOS version. A picture of the Hatch window goes along when the switch is on, and the form shows that picture first. Hatch sends no name and no address.

Feedback goes to a database that the app can write to and cannot read. A send that fails stays in `~/.hatch/feedback-outbox/` and goes out the next time Hatch opens.

## What works

- **Canvas.** Pages sit side by side at their real layout width. The canvas zooms and pans, a Hatch drags taller, and Fit to view gives the look of an ordinary browser.
- **Agents.** An agent opens pages, reads the agent view, acts by element reference, answers dialogs, takes screenshots, measures an element with `get_element` and asks the user to switch views. A second agent gets its own tab.
- **Local projects.** Hatch registers a folder, starts its dev server on a stable port and serves it at `hatch:<name>`, which is `http://<name>.localhost:4282` in any browser. A folder of plain HTML gets the same address and reloads when a file changes.
- **Comments.** The user pins a comment to an element. An agent reads it, acts on it, replies and resolves it. A project's comments are markdown files in `<project>/.hatch/comments/`.
- **Sign-ins.** Hatch fills a saved sign-in for an agent after the user agrees. The agent never receives the password. Google refuses to sign anyone in inside an app built on Electron, so for a site that offers Google alone, the Sign-ins panel copies that site's sign-in from Chrome, Arc, Brave or Edge. macOS asks for the user's password first, because the browser keeps its cookie key in the Keychain.
- **Grab for Paper.** The user picks an element and pastes it into the Paper design tool. The clipboard holds the form Paper's own Chrome extension writes; a paste into Paper still needs one check by a person.
- **Default browser.** Settings has a button that makes Hatch the Mac's default browser, so a link clicked in another app opens in a new Hatch.
- **Extraction.** With "Let agents run script in pages" switched on, an agent takes an element's markup, its computed styles and its images out of a page.

Hatch keeps its data in `~/.hatch/`. It listens on this Mac only, so no port opens to the network.

## Build it from source

```
pnpm install
pnpm dev
```

`pnpm package` builds `release/mac-arm64/Hatch.app`. `pnpm release` also writes the zip a trial user downloads, with an ad-hoc signature. `AGENTS.md` lists the other commands, the code layout and the rules the code depends on.

From a checkout, the stdio command for an agent is `node out/main/hatch-mcp.js` after `pnpm build`.

## Licence

MIT. See `LICENSE`.
