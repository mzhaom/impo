# tmux-mobile-mobile

React Native Command Center client for tmux-mobile.

This app is a client only. It authenticates against a tmux-mobile controller
with the existing Google device-login flow, stores the returned browser session
token in SecureStore, and calls the same HTTPS API used by the web Command
Center.

## Scope

First screen:

- Machine filter
- Agent session cards
- Start Codex/Claude in a machine directory
- Send text to a pane
- Rename tmux/rmux window
- View pane tail
- View structured transcript

The older browser main app/window-driver UI is intentionally not ported yet.

## Development

```bash
yarn install
yarn dev
yarn ios
yarn typecheck
```

The default controller is `https://eng.impo.ai`. Override it at build time with:

```bash
TMUX_MOBILE_CONTROLLER_URL=https://example.com yarn dev
```
