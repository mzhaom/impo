# Repo Notes

This repo is the React Native mobile client for tmux-mobile Command Center.

Keep the mobile app as a client only. It talks to the tmux-mobile controller over HTTPS and must not implement tmux/rmux control or agent WebSocket logic locally.

First product scope is Command Center: machine list, agent cards, start agent, send text, rename window, pane tail, and transcript. The older browser main app/window-driver UI is intentionally out of scope for now.
