import http from "node:http";
import { AddressInfo } from "node:net";
import { google } from "googleapis";
import electron from "electron";
const { shell } = electron;

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}`;

const scopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email"
];

function requireGoogleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  }

  return { clientId, clientSecret };
}

export function getOAuthClient(tokens?: any) {
  const { clientId, clientSecret } = requireGoogleEnv();

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  if (tokens) oauth2Client.setCredentials(tokens);

  return oauth2Client;
}

export async function googleLogin() {
  const { clientId, clientSecret } = requireGoogleEnv();

  return await new Promise<any>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "", REDIRECT_URI);
        const code = url.searchParams.get("code");

        if (!code) {
          res.end("Missing code.");
          return;
        }

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
        const { tokens } = await oauth2Client.getToken(code);

        res.end("Google connected. You can close this window.");
        server.close();

        resolve(tokens);
      } catch (error) {
        server.close();
        reject(error);
      }
    });

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: scopes
      });

      shell.openExternal(authUrl).catch(reject);
    });
  });
}

export async function getGoogleProfile(auth: any) {
  const oauth2 = google.oauth2({ version: "v2", auth });
  const result = await oauth2.userinfo.get();
  return result.data;
}
