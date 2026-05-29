const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { google } = require("googleapis");
const http = require("http");
const dotenv = require("dotenv");

const fs = require("fs");

// Load env vars from common locations for packaged and dev runs.
const envPaths = [
    path.join(process.cwd(), ".env"),
    path.join(app.getPath("userData"), ".env"),
    path.join(app.getAppPath(), ".env")
];

for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: false });
    }
}

const requiredEnvKeys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_SHEET_ID",
    "GOOGLE_CALENDAR_ID"
];

function getMissingEnvKeys() {
    return requiredEnvKeys.filter((key) => !process.env[key] || !String(process.env[key]).trim());
}

function writeUserEnvFile(values) {
    const userEnvPath = path.join(app.getPath("userData"), ".env");
    const envContent = [
        `GOOGLE_CLIENT_ID=${values.GOOGLE_CLIENT_ID}`,
        `GOOGLE_CLIENT_SECRET=${values.GOOGLE_CLIENT_SECRET}`,
        `GOOGLE_SHEET_ID=${values.GOOGLE_SHEET_ID}`,
        `GOOGLE_CALENDAR_ID=${values.GOOGLE_CALENDAR_ID || "primary"}`
    ].join("\n") + "\n";

    fs.writeFileSync(userEnvPath, envContent, "utf8");
    dotenv.config({ path: userEnvPath, override: true });
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildEnvSetupHtml() {
    const defaults = {
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
        GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID || "",
        GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || "primary"
    };

    return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Lead Tracker Setup</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f6f8; margin: 0; }
      .card { max-width: 640px; margin: 24px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px; }
      h1 { margin: 0 0 10px; font-size: 20px; }
      p { margin: 0 0 14px; color: #4b5563; font-size: 13px; }
      label { display: block; margin: 10px 0 4px; font-size: 12px; font-weight: 700; color: #374151; }
      input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      button { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 13px; }
      button.primary { background: #111827; border-color: #111827; color: #fff; }
      .error { color: #b91c1c; min-height: 18px; font-size: 12px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Complete Setup</h1>
      <p>Enter your Google configuration. Values are stored locally for this device.</p>
      <form id="env-form">
        <label>GOOGLE_CLIENT_ID *</label>
        <input id="GOOGLE_CLIENT_ID" value="${escapeHtml(defaults.GOOGLE_CLIENT_ID)}" required />

        <label>GOOGLE_CLIENT_SECRET *</label>
        <input id="GOOGLE_CLIENT_SECRET" value="${escapeHtml(defaults.GOOGLE_CLIENT_SECRET)}" required />

        <label>GOOGLE_SHEET_ID *</label>
        <input id="GOOGLE_SHEET_ID" value="${escapeHtml(defaults.GOOGLE_SHEET_ID)}" required />

        <label>GOOGLE_CALENDAR_ID *</label>
        <input id="GOOGLE_CALENDAR_ID" value="${escapeHtml(defaults.GOOGLE_CALENDAR_ID)}" required />

        <div class="error" id="error"></div>
        <div class="actions">
          <button type="button" id="cancel">Cancel</button>
          <button class="primary" type="submit">Save and Continue</button>
        </div>
      </form>
    </div>
    <script>
      const { ipcRenderer } = require('electron');
      const form = document.getElementById('env-form');
      const error = document.getElementById('error');
      const cancel = document.getElementById('cancel');

      cancel.addEventListener('click', async () => {
        await ipcRenderer.invoke('env:cancel');
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.textContent = '';

        const payload = {
          GOOGLE_CLIENT_ID: document.getElementById('GOOGLE_CLIENT_ID').value.trim(),
          GOOGLE_CLIENT_SECRET: document.getElementById('GOOGLE_CLIENT_SECRET').value.trim(),
          GOOGLE_SHEET_ID: document.getElementById('GOOGLE_SHEET_ID').value.trim(),
          GOOGLE_CALENDAR_ID: document.getElementById('GOOGLE_CALENDAR_ID').value.trim() || 'primary'
        };

        const response = await ipcRenderer.invoke('env:save', payload);
        if (!response.ok) {
          error.textContent = response.error || 'Could not save configuration.';
        }
      });
    </script>
  </body>
</html>`;
}

function openEnvSetupWindow() {
    return new Promise((resolve) => {
        let finished = false;
        const setupWindow = new BrowserWindow({
            width: 720,
            height: 560,
            resizable: false,
            minimizable: false,
            maximizable: false,
            title: "Lead Tracker Setup",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        const cleanup = () => {
            ipcMain.removeHandler("env:save");
            ipcMain.removeHandler("env:cancel");
        };

        ipcMain.handle("env:save", async (_event, payload) => {
            const values = {
                GOOGLE_CLIENT_ID: String(payload?.GOOGLE_CLIENT_ID || "").trim(),
                GOOGLE_CLIENT_SECRET: String(payload?.GOOGLE_CLIENT_SECRET || "").trim(),
                GOOGLE_SHEET_ID: String(payload?.GOOGLE_SHEET_ID || "").trim(),
                GOOGLE_CALENDAR_ID: String(payload?.GOOGLE_CALENDAR_ID || "").trim() || "primary"
            };

            const missing = Object.entries(values)
                .filter(([key, value]) => key !== "GOOGLE_CALENDAR_ID" && !value)
                .map(([key]) => key);

            if (missing.length > 0) {
                return { ok: false, error: `Missing required fields: ${missing.join(", ")}` };
            }

            writeUserEnvFile(values);
            finished = true;
            cleanup();
            resolve(true);
            setupWindow.close();
            return { ok: true };
        });

        ipcMain.handle("env:cancel", async () => {
            finished = true;
            cleanup();
            resolve(false);
            setupWindow.close();
            return { ok: true };
        });

        setupWindow.on("closed", () => {
            if (!finished) {
                cleanup();
                resolve(false);
            }
        });

        setupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildEnvSetupHtml())}`);
    });
}

const storePath = path.join(app.getPath("userData"), "lead-tracker-store.json");

const store = {
    get(key) {
        if (!fs.existsSync(storePath)) return undefined;
        const data = JSON.parse(fs.readFileSync(storePath, "utf8"));
        return data[key];
    },
    set(key, value) {
        const data = fs.existsSync(storePath)
            ? JSON.parse(fs.readFileSync(storePath, "utf8"))
            : {};
        data[key] = value;
        fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
    }
};

function createOAuthClient(redirectUri = "http://127.0.0.1") {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );
}

function getAuthedClient() {
    const tokens = store.get("googleTokens");
    if (!tokens) throw new Error("Google is not connected yet.");

    const auth = createOAuthClient();
    auth.setCredentials(tokens);
    return auth;
}

async function googleLogin() {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                const port = server.address().port;
                const redirectUri = `http://127.0.0.1:${port}`;
                const url = new URL(req.url, redirectUri);
                const code = url.searchParams.get("code");

                const auth = createOAuthClient(redirectUri);
                const { tokens } = await auth.getToken(code);

                store.set("googleTokens", tokens);

                res.end("Google connected. You can close this window.");
                server.close();
                resolve({ ok: true });
            } catch (err) {
                server.close();
                reject(err);
            }
        });

        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            const redirectUri = `http://127.0.0.1:${port}`;
            const auth = createOAuthClient(redirectUri);

            const authUrl = auth.generateAuthUrl({
                access_type: "offline",
                prompt: "consent",
                scope: [
                    "https://www.googleapis.com/auth/spreadsheets",
                    "https://www.googleapis.com/auth/calendar.events",
                    "https://www.googleapis.com/auth/userinfo.email"
                ]
            });

            shell.openExternal(authUrl);
        });
    });
}

async function listLeads(auth, sheetName = "Leads") {
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!A2:H`
    });

    const rows = res.data.values || [];

    return rows
        .map((row, index) => ({
            rowNumber: index + 2,
            name: row[0] || "",
            firstAdded: row[1] || "",
            lastInteraction: row[2] || "",
            interactionType: row[3] || "PM",
            state: row[4] || "Cold",
            followUpScheduled: row[5] || "NO",
            customer: row[6] || "",
            instagramHandle: row[7] || ""
        }))
        .filter((lead) => lead.name.trim() !== "");
}

async function getSheets(auth) {
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID
    });

    return (res.data.sheets || [])
        .map((sheet) => sheet.properties.title);
}

async function getOrCreateSheet(auth, sheetName) {
    const sheets = google.sheets({ version: "v4", auth });

    try {
        // Try to read from the sheet to see if it exists
        const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `${sheetName}!A1:H1`
        });
        
        const headers = headerRes.data.values?.[0] || [];
        
        // Check if Instagram Handle header exists in column H
        if (!headers[7] || headers[7] !== "Instagram Handle") {
            // Add the Instagram Handle header
            await sheets.spreadsheets.values.update({
                spreadsheetId: process.env.GOOGLE_SHEET_ID,
                range: `${sheetName}!H1`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [["Instagram Handle"]]
                }
            });
        }
        
        return;
    } catch (err) {
        // Sheet doesn't exist, create it
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: sheetName
                            }
                        }
                    }
                ]
            }
        });

        // Add headers
        await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `${sheetName}!A1:H1`,
            valueInputOption: "RAW",
            requestBody: {
                values: [[
                    "Name",
                    "First Added",
                    "Last Interaction",
                    "Interaction Type",
                    "State",
                    "Follow-up Scheduled",
                    "Customer",
                    "Instagram Handle"
                ]]
            }
        });
    }
}

async function updateFollowUpScheduled(auth, rowNumber, value, sheetName = "Leads") {
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!F${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[value]]
        }
    });
}

async function updateCustomer(auth, rowNumber, value, sheetName = "Leads") {
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!G${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[value]]
        }
    });
}

async function updateInstagramHandle(auth, rowNumber, value, sheetName = "Leads") {
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!H${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[value]]
        }
    });
}

function getDelayDays(state) {
    if (state === "Cold") return 7;
    if (state === "Warm") return 4;
    if (state === "Hot") return 2;
    return null;
}

async function createCalendarEvent(auth, lead) {
    const delay = lead.scheduleDays || getDelayDays(lead.state);
    if (!delay) throw new Error("Inactive leads cannot be scheduled.");

    const calendar = google.calendar({ version: "v3", auth });

    const start = new Date();
    start.setDate(start.getDate() + delay);
    start.setHours(9, 0, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    await calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
        requestBody: {
            summary: `Follow up with ${lead.name}`,
            description: `Lead state: ${lead.state}\nLast interaction: ${lead.lastInteraction}`,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() }
        }
    });

    return start.toISOString();
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (!app.isPackaged && devUrl) {
        win.loadURL(devUrl);
    } else {
        win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
    }
}

app.whenReady().then(async () => {
    if (getMissingEnvKeys().length > 0) {
        const saved = await openEnvSetupWindow();
        if (!saved) {
            app.quit();
            return;
        }
    }
    createWindow();
});

ipcMain.handle("google:login", async () => {
    const result = await googleLogin();
    // Mark first launch as complete when login succeeds
    store.set("firstLaunchDone", true);
    return result;
});

ipcMain.handle("google:status", async () => {
    const hasTokens = Boolean(store.get("googleTokens"));
    const firstLaunchDone = store.get("firstLaunchDone");
    return { 
        google: hasTokens,
        isFirstLaunch: !firstLaunchDone && !hasTokens
    };
});

ipcMain.handle("sheets:getSheets", async () => {
    const auth = getAuthedClient();
    return await getSheets(auth);
});

ipcMain.handle("sheets:listLeads", async (_event, sheetName) => {
    const auth = getAuthedClient();
    return await listLeads(auth, sheetName);
});

ipcMain.handle("sheets:addLead", async (_event, lead, sheetName) => {
    const auth = getAuthedClient();
    
    // Ensure the sheet exists, create if not
    await getOrCreateSheet(auth, sheetName);
    
    const sheets = google.sheets({ version: "v4", auth });

    // Read all rows to find the next available row number
    const allRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!A:H`
    });
    const allRows = allRes.data.values || [];
    const nextRowNumber = allRows.length + 1;

    // Use update with the calculated row number instead of append
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!A${nextRowNumber}:H${nextRowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[
                lead.name,
                new Date().toISOString(),
                lead.lastInteraction || "",
                lead.interactionType,
                lead.state,
                "NO",
                lead.customer || "",
                ""
            ]]
        }
    });

    return { status: "added" };
});

ipcMain.handle("sheets:updateLeadState", async (_event, rowNumber, state, sheetName) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!E${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[state]]
        }
    });
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadName", async (_event, rowNumber, name, sheetName) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!A${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[name]]
        }
    });
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadLastInteraction", async (_event, rowNumber, lastInteraction, sheetName) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!C${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[lastInteraction]]
        }
    });
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadInteractionType", async (_event, rowNumber, interactionType, sheetName) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `${sheetName}!D${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[interactionType]]
        }
    });
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadCustomer", async (_event, rowNumber, customer, sheetName) => {
    const auth = getAuthedClient();
    await updateCustomer(auth, rowNumber, customer, sheetName);
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadInstagramHandle", async (_event, rowNumber, instagramHandle, sheetName) => {
    const auth = getAuthedClient();
    await updateInstagramHandle(auth, rowNumber, instagramHandle, sheetName);
    return { ok: true };
});

ipcMain.handle("calendar:scheduleFollowUp", async (_event, lead, sheetName) => {
    const auth = getAuthedClient();
    const scheduledAt = await createCalendarEvent(auth, lead);

    if (lead.rowNumber) {
        await updateFollowUpScheduled(auth, lead.rowNumber, scheduledAt, sheetName);
    }

    return { ok: true, scheduledAt };
});

ipcMain.handle("sheets:removeFollowUp", async (_event, rowNumber, sheetName) => {
    const auth = getAuthedClient();
    await updateFollowUpScheduled(auth, rowNumber, "NO", sheetName);
    return { ok: true };
});

ipcMain.handle("calendar:removeFollowUp", async (_event, lead, sheetName) => {
    if (!lead.rowNumber) return { ok: true };

    const auth = getAuthedClient();
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    try {
        // Search for events matching the lead name
        const res = await calendar.events.list({
            calendarId,
            q: `Follow up with ${lead.name}`,
            maxResults: 10
        });

        const events = res.data.items || [];
        
        // Find and delete the event matching the scheduled date
        for (const event of events) {
            if (lead.followUpScheduled && event.start?.dateTime) {
                const eventDate = new Date(event.start.dateTime);
                const scheduledDate = new Date(lead.followUpScheduled);
                
                // Match by date (same day)
                if (eventDate.toDateString() === scheduledDate.toDateString()) {
                    await calendar.events.delete({
                        calendarId,
                        eventId: event.id
                    });
                    break;
                }
            }
        }
    } catch (err) {
        console.error("Failed to delete calendar event:", err);
    }

    // Always update the sheet, even if calendar deletion fails
    await updateFollowUpScheduled(auth, lead.rowNumber, "NO", sheetName);
    return { ok: true };
});

async function upsertLeadFromInteraction(auth, interaction) {
    const sheets = google.sheets({ version: "v4", auth });

    const rowsRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Leads!A2:F"
    });

    const rows = rowsRes.data.values || [];

    const existingIndex = rows.findIndex((row) => {
        return (row[0] || "").trim().toLowerCase() === interaction.name.trim().toLowerCase();
    });

    const state = classifyState(interaction.message || "");

    if (existingIndex === -1) {
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: "Leads!A:F",
            valueInputOption: "RAW",
            requestBody: {
                values: [[
                    interaction.name,
                    new Date().toISOString(),
                    interaction.timestamp,
                    interaction.type,
                    state,
                    "NO"
                ]]
            }
        });

        return "added";
    }

    const rowNumber = existingIndex + 2;

    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Leads!C${rowNumber}:E${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[
                interaction.timestamp,
                interaction.type,
                state
            ]]
        }
    });

    return "updated";
}

function classifyState(message) {
    const msg = message.toLowerCase();

    if (
        msg.includes("price") ||
        msg.includes("pricing") ||
        msg.includes("call") ||
        msg.includes("book") ||
        msg.includes("schedule")
    ) {
        return "Hot";
    }

    if (
        msg.includes("interested") ||
        msg.includes("info") ||
        msg.includes("details")
    ) {
        return "Warm";
    }

    return "Cold";
}
