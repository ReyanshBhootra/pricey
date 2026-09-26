# Pricey on iMessage

## How it works, in one picture

```
Your phone  --text-->  Photon (owns the iMessage number)  -->  this relay (on your laptop)  -->  Pricey website
Your phone  <--reply--  Photon                             <--  this relay                    <--  Pricey website
```

- **Photon** gives Pricey a real iMessage number. It can't think; it just passes texts along.
- **This relay** (`bot/`) is a tiny program that runs on your laptop. It hands each text to the Pricey website and sends the answer back. It also sends the "N spots near you have discounts" alerts.
- **The Pricey website** does the actual work: saves reports, vouching, Gemini answers. Same brain as the app.

The relay has to keep running for texts to get answers. Close it and Pricey stops replying (the website keeps working).

## Setup (about 10 minutes, once)

### 1. Photon dashboard (app.photon.codes)

1. **Add your phone:** avatar menu (top right) → add your phone number and confirm the code.
2. **Allow testers:** on the free plan, only phones added as **users** in your project can text Pricey. Add any teammate or judge phone you want to demo with.
3. **Get your two keys**, the project ID and the project secret. Easiest way: run the command Photon showed you in any empty folder, then open the `.env` file it creates:
   ```bash
   npm create spectrum-project@latest photon-keys -- --projectId YOUR_PROJECT_ID --providers imessage --yes
   ```
   The file `photon-keys/.env` has `PROJECT_ID=` and `PROJECT_SECRET=`. You can delete the folder afterwards.

### 2. On your laptop

```bash
git pull
cd bot
npm run setup
```

It asks three things: the project ID, the secret, and your website address (just press Enter for `https://pricey-nine.vercel.app`). It saves them in `bot/.env` (never uploaded to GitHub), installs what's needed, and prints a **TEXT_BOT_SECRET** for the next step.

### 3. Vercel

Vercel → your pricey project → **Settings** → **Environment Variables** → add:

- Key: `TEXT_BOT_SECRET`
- Value: the one `npm run setup` printed

Save, then **Deployments** → `...` on the newest → **Redeploy**. (This is a password so only your relay can use the texting API.)

### 4. Start it

```bash
npm start
```

You should see `Pricey relay running (iMessage)`. Leave that window open. Text your Photon number `help`.

Your Photon number is shown in the dashboard, or run `npx @photon-ai/cli spectrum lines list`.

## Things to text

- `help`
- `how much are eggs in brooklyn?`
- `eggs 3.99 at key food park slope`
- `free bagels at myrtle deli until 5pm`
- `deals in brooklyn`
- `alerts on brooklyn` (then `stop`)

## If something's off

- **"Could not connect to Photon"**: keys are wrong (run `npm run setup` again) or your phone isn't added in the dashboard.
- **Reply says "Pricey is having a moment"**: the website refused the relay. `TEXT_BOT_SECRET` in Vercel must match `bot/.env`, and you must redeploy after adding it.
- **No reply at all**: is `npm start` still running? Is the phone you're texting from added as a user in Photon?
- **No phone handy / Photon down on demo day**: open `pricey-nine.vercel.app/text`. Same brain, in the browser.

## For developers

- `src/index.ts`: the relay. Forwards texts to `POST /api/text`, polls `GET /api/text/digest` for alerts. Both need `Authorization: Bearer TEXT_BOT_SECRET`.
- `npm run terminal`: chat in a terminal window instead of iMessage (downloads Photon's terminal chat app).
- `bun test`: runs the relay with Photon faked against a running app (`PRICEY_URL`, `TEXT_BOT_SECRET` set).
