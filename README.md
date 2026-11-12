# WireClaude

A browser review page for Claude Code commands and tool results. WireClaude holds each item until you send or block it.

## Operation

Claude Code can run commands, read files and fetch web pages on your computer. WireClaude explains commands before they run and displays outgoing tool results supported by the plugin API.

- When **Cautiousness high** is ticked, each Bash command waits on a card before it runs, and web search and web fetch results wait before Claude receives them. Unticked, both go through without a card. Claude Code explains the command using editable instructions. If the command runs a script such as `python analyse.py` or `./run.sh`, the card also shows the script and the explanation covers its behavior. The default instructions use Simplified Technical English based on [ste80-humanizer](https://github.com/Dodaios/ste80-humanizer).
- Tool results wait before Claude receives them. The page renders file contents, command output, web pages, MCP answers, PDFs, images, spreadsheets, HTML, Markdown and code.
- Local checks scan each result for sensitive data and private watch-list terms. Findings appear on the card and are removed when you send the result. Choose **Send original** to keep them. The private watch list remains in `~/.wireclaude`.
- There are two views of the same data. http://127.0.0.1:1308 shows swipe cards. http://127.0.0.1:1308/cockpit is a three.js flight-simulator cockpit: the waiting item on the centre display, the queue as a route on the navigation display, counts and messages on the EICAS, lit SEND, BLOCK, TRUST SITE and SEND ORIGINAL buttons on the glare shield, access rules and history on the side display, and the explanation instructions and watch list on the FMS. The weather outside follows the waiting item: fog for findings, a storm for an error, night while checks are off. The ground is OpenStreetMap, on a tour of cities; the map tiles come from tile.openstreetmap.org, which therefore sees your IP address and the area shown. Press H in the cockpit for the keys. The page that opens on its own uses the view you opened last.
- Swipe right or press Right Arrow, Enter or Y to send. Swipe left or press Left Arrow or N to block. Swipe up or press Up Arrow or T to send a web fetch result and trust its site for the project. Press O to send the original with all findings.
- The access panel shows the read and edit rules calculated from your Claude Code settings.

Prompts, Read, Edit and Write calls, and web search and web fetch calls pass through because Claude Code already displays them or asks for them. Content returned by Read waits for review when the local checks find something, and always when **Cautiousness high** is ticked.

## Requirements

- Claude Code 2.1.295 or later. Older versions let tool calls through when the page is not running.
- Python 3 on the PATH as `python3`, `python` or `py`.
- Git for Windows when running on Windows. If it is unavailable, start the page with `py server.py` from the plugin folder.

## Install

Add the following settings to `.claude/settings.json` to offer the plugin to everyone who opens the project. Claude Code offers the plugin after they trust the folder.

```json
{
  "extraKnownMarketplaces": {
    "wireclaude": { "source": { "source": "github", "repo": "jangrau13/wireclaude" } }
  },
  "enabledPlugins": { "wireclaude@wireclaude": true }
}
```

Run this terminal command for a personal installation or the VS Code extension:

```
claude plugin install wireclaude --marketplace jangrau13/wireclaude
```

Add `--scope project` to the install command to limit it to the current project. Start a new session and open http://127.0.0.1:1308.

## Limits

- The page sees data exposed through hooks. System prompts, CLAUDE.md files, pasted images, `@file` mentions, editor selections and compacted context bypass the page.
- Blocking a tool result replaces its text after the tool has run.
- Claude Code does not allow plugins to replace or hold back tool errors, so WireClaude changes each Bash command to never fail. The command's output is kept in a temporary file and printed when the command ends, followed by its exit code if it failed; it can then be cleaned or blocked like any result. A command stopped by a timeout prints nothing. The temporary file is deleted at the latest when the command's result arrives, and tool calls that name it are refused. Bash output therefore appears only when the command ends, and stdout and stderr arrive together.
- PowerShell commands get a line that prints the exit code of a failed command. A PowerShell command that calls `exit`, and errors from other tools, still reach Claude whatever you choose. Block such an error to tell Claude to ignore it and stop, then rewind past that step before sending another message.

Your explanation instructions and the server log are stored in `~/.wireclaude/`.

## License

[MIT](LICENSE). The software has no warranty.

## Test

```
python3 test_server.py
```
