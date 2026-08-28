# Repo Notes

This directory is the React Native mobile client for IMPO Command Center.

Keep the mobile app as a client only. It talks to the IMPO Controller over HTTPS and must not implement tmux/rmux control or Connector WebSocket logic locally.

First product scope is Command Center: machine list, agent cards, start agent, send text, rename window, pane tail, and transcript. The older browser main app/window-driver UI is intentionally out of scope for now.
