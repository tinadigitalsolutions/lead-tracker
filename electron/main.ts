import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import Store from "electron-store";
import { googleLogin, getOAuthClient, getGoogleProfile } from "./services/googleAuth.js";
import { addLead, listLeads, updateLeadFollowUpScheduled, updateLeadState, updateLeadName, updateLeadLastInteraction, updateLeadInteractionType, upsertLeadFromInteraction } from "./services/googleSheets.js";
import { createFollowUpEvent, getFollowUpDelayDays } from "./services/googleCalendar.js";
const { app, BrowserWindow, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type StoreShape = {
  googleTokens?: any;
  googleEmail?: string;
};

export const store = new Store<StoreShape>({
  name: "lead-tracker"
});

let mainWindow: any = null;

function createWindow() {
  console.log("Preload path:", path.join(__dirname, "preload.js"));
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("google:login", async () => {
  const tokens = await googleLogin();
  store.set("googleTokens", tokens);

  const auth = getOAuthClient(tokens);
  const profile = await getGoogleProfile(auth);
  store.set("googleEmail", profile.email || "");

  return { ok: true, email: profile.email || "" };
});

ipcMain.handle("google:status", async () => {
  const tokens = store.get("googleTokens");
  return {
    google: Boolean(tokens),
    email: store.get("googleEmail") || ""
  };
});

ipcMain.handle("sheets:listLeads", async () => {
  const auth = getOAuthClient(store.get("googleTokens"));
  return await listLeads(auth);
});

ipcMain.handle("sheets:addLead", async (_event, lead: { name: string; interactionType: string; state: string; lastInteraction?: string }) => {
  const auth = getOAuthClient(store.get("googleTokens"));
  const result = await addLead(auth, {
    name: lead.name,
    interactionType: lead.interactionType as any,
    state: lead.state as any,
    lastInteraction: lead.lastInteraction
  });
  return result;
});

ipcMain.handle("sheets:updateLeadState", async (_event, rowNumber: number, state: string) => {
  const auth = getOAuthClient(store.get("googleTokens"));
  await updateLeadState(auth, rowNumber, state);
  return { ok: true };
});

ipcMain.handle("sheets:updateLeadName", async (_event, rowNumber: number, name: string) => {
  const auth = getOAuthClient(store.get("googleTokens"));
  await updateLeadName(auth, rowNumber, name);
  return { ok: true };
});

ipcMain.handle("sheets:updateLeadLastInteraction", async (_event, rowNumber: number, lastInteraction: string) => {
  const auth = getOAuthClient(store.get("googleTokens"));
  await updateLeadLastInteraction(auth, rowNumber, lastInteraction);
  return { ok: true };
});

ipcMain.handle("sheets:updateLeadInteractionType", async (_event, rowNumber: number, interactionType: string) => {
  const auth = getOAuthClient(store.get("googleTokens"));
  await updateLeadInteractionType(auth, rowNumber, interactionType);
  return { ok: true };
});

ipcMain.handle("calendar:scheduleFollowUp", async (_event, lead: any) => {
  const delayDays = getFollowUpDelayDays(lead.state);
  if (!delayDays) {
    throw new Error("Inactive leads cannot be scheduled.");
  }

  if (lead.followUpScheduled && lead.followUpScheduled !== "NO") {
    throw new Error("This lead already has a follow-up scheduled.");
  }

  const auth = getOAuthClient(store.get("googleTokens"));
  const scheduledAt = await createFollowUpEvent(auth, lead);

  if (lead.rowNumber) {
    await updateLeadFollowUpScheduled(auth, lead.rowNumber, scheduledAt);
  }

  return { ok: true, scheduledAt };
});
