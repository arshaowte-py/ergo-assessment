#!/usr/bin/env node
/**
 * Mint a Drive refresh token for your own Google account.
 *
 *   npm run auth:drive
 *
 * Why this exists: Google gives service accounts no Drive storage quota, so
 * they cannot create files at all outside a Shared Drive. Uploads therefore run
 * as a real account, and the photos and PDFs land in that account's Drive.
 *
 * Run this on your own machine — it opens a browser and needs a loopback
 * listener. Paste the printed refresh token into Vercel as
 * GOOGLE_OAUTH_REFRESH_TOKEN.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/drive";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(`
GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env.local.

To create them:
  1. https://console.cloud.google.com/apis/credentials  (project: ergo-assessment-responses)
  2. Create credentials -> OAuth client ID -> Web application
  3. Under "Authorised redirect URIs" add exactly:
       ${REDIRECT}
  4. Copy the client ID and secret into .env.local

Also set the OAuth consent screen's publishing status to "In production".
While it is in "Testing", Google expires refresh tokens after 7 days and
uploads will start failing a week later.
`);
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Force the consent screen so Google actually returns a refresh token —
    // it only issues one on first approval otherwise.
    prompt: "consent",
  });

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const err = url.searchParams.get("error");
    const got = url.searchParams.get("code");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<body style="font-family:system-ui;padding:3rem;text-align:center">
         <h2>${err ? "Authorisation failed" : "Done — you can close this tab."}</h2>
         <p style="color:#666">${err ?? "Return to your terminal for the refresh token."}</p>
       </body>`,
    );
    server.close();
    err ? reject(new Error(err)) : resolve(got);
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\nOpening your browser. If it doesn't open, visit:\n\n${authUrl}\n`);
    const opener =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn(opener, [authUrl], { stdio: "ignore", detached: true, shell: process.platform === "win32" })
      .on("error", () => {})
      .unref();
  });
});

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }),
});

const token = await res.json();
if (!res.ok || !token.refresh_token) {
  console.error("Token exchange failed:", JSON.stringify(token, null, 2));
  process.exit(1);
}

// Confirm the token actually reaches the target folder before declaring success.
if (process.env.DRIVE_FOLDER_ID) {
  const check = await fetch(
    `https://www.googleapis.com/drive/v3/files/${process.env.DRIVE_FOLDER_ID}?fields=name,capabilities/canAddChildren`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  const folder = await check.json();
  console.log(
    check.ok && folder.capabilities?.canAddChildren
      ? `\nVerified: can write to Drive folder "${folder.name}".`
      : `\nWARNING: could not confirm write access to DRIVE_FOLDER_ID.\n${JSON.stringify(folder)}`,
  );
}

console.log(`
Add this to .env.local and to Vercel (Production + Preview):

GOOGLE_OAUTH_REFRESH_TOKEN=${token.refresh_token}
`);
