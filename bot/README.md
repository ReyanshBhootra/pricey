# Pricey on iMessage (Photon Spectrum)

A thin relay: texts come in through Photon, go to the Pricey app's `/api/text`, and the reply goes back. Alerts ("alerts on brooklyn") are checked every few minutes and sent as one bundled text.

## Setup

1. In the Photon dashboard, add your phone (avatar menu, top right). Photon needs it before a line works.
2. In Vercel, add `TEXT_BOT_SECRET` (any long random string) and redeploy.
3. Here: `cp .env.example .env` and fill in `PROJECT_ID`, `PROJECT_SECRET` (from Photon), `PRICEY_URL`, and the same `TEXT_BOT_SECRET`.
4. `bun install`, then `bun start`, and leave it running. Text your Photon line from your phone.

No phone yet? `bun run terminal` chats with Pricey right in this terminal, same replies.

## Try

- `help`
- `how much are eggs in brooklyn?`
- `eggs 3.99 at key food park slope`
- `free bagels at myrtle deli until 5pm`
- `deals in brooklyn`
- `alerts on brooklyn` / `stop`
