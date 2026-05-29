require("dotenv/config");

const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { google } = require("googleapis");
const http = require("http");

const fs = require("fs");

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

async function listLeads(auth) {
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Leads!A2:F"
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
            followUpScheduled: row[5] || "NO"
        }))
        .filter((lead) => lead.name.trim() !== "");
}

async function updateFollowUpScheduled(auth, rowNumber, value) {
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Leads!F${rowNumber}`,
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
    const delay = getDelayDays(lead.state);
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

    win.loadURL("http://localhost:5173");
}

app.whenReady().then(createWindow);

ipcMain.handle("google:login", async () => {
    return await googleLogin();
});

ipcMain.handle("google:status", async () => {
    return { google: Boolean(store.get("googleTokens")) };
});

ipcMain.handle("sheets:listLeads", async () => {
    const auth = getAuthedClient();
    return await listLeads(auth);
});

ipcMain.handle("sheets:addLead", async (_event, lead) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });

    console.log("[DEBUG] addLead called with:", lead);

    // Read all rows to find the next available row number
    const allRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Leads!A:F"
    });
    const allRows = allRes.data.values || [];
    const nextRowNumber = allRows.length + 1;

    console.log("[DEBUG] sheet has", allRows.length, "rows, inserting at row", nextRowNumber);

    // Use update with the calculated row number instead of append
    const updateResult = await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Leads!A${nextRowNumber}:F${nextRowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[
                lead.name,
                new Date().toISOString(),
                lead.lastInteraction || "",
                lead.interactionType,
                lead.state,
                "NO"
            ]]
        }
    });

    console.log("[DEBUG] update response:", updateResult.data);

    // Read again to verify
    const postRes = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Leads!A:F"
    });
    console.log("[DEBUG] sheet after add, all rows:", postRes.data.values);

    const listResult = await listLeads(auth);
    console.log("[DEBUG] leads after add:", listResult);

    return { status: "added" };
});

ipcMain.handle("sheets:updateLeadState", async (_event, rowNumber, state) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Leads!E${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[state]]
        }
    });
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadName", async (_event, rowNumber, name) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Leads!A${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[name]]
        }
    });
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadLastInteraction", async (_event, rowNumber, lastInteraction) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Leads!C${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[lastInteraction]]
        }
    });
    return { ok: true };
});

ipcMain.handle("sheets:updateLeadInteractionType", async (_event, rowNumber, interactionType) => {
    const auth = getAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `Leads!D${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
            values: [[interactionType]]
        }
    });
    return { ok: true };
});

ipcMain.handle("calendar:scheduleFollowUp", async (_event, lead) => {
    const auth = getAuthedClient();
    const scheduledAt = await createCalendarEvent(auth, lead);

    if (lead.rowNumber) {
        await updateFollowUpScheduled(auth, lead.rowNumber, new Date().toISOString());
    }

    return { ok: true, scheduledAt };
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
