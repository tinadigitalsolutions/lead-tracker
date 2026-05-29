import { google } from "googleapis";
import type { LeadState, InteractionType } from "../../src/types.js";

const SHEET_NAME = "Leads";
const HEADER = ["Name", "First Added", "Last Interaction", "Interaction Type", "State", "Follow-up Scheduled"];

function sheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("Missing GOOGLE_SHEET_ID in .env");
  return id;
}

export type InstagramInteraction = {
  name: string;
  timestamp: string;
  type: InteractionType;
  message?: string;
};

export async function ensureHeader(auth: any) {
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = sheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:F1`
  }).catch(() => null);

  const values = res?.data.values?.[0] || [];
  if (values.join("|") !== HEADER.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:F1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] }
    });
  }
}

export async function listLeads(auth: any) {
  await ensureHeader(auth);
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!A2:F`
  });

  const rows = res.data.values || [];

  return rows.map((row, idx) => ({
    rowNumber: idx + 2,
    name: row[0] || "",
    firstAdded: row[1] || "",
    lastInteraction: row[2] || "",
    interactionType: row[3] || "PM",
    state: row[4] || "Cold",
    followUpScheduled: row[5] || "NO"
  }));
}

export async function upsertLeadFromInteraction(auth: any, interaction: InstagramInteraction) {
  await ensureHeader(auth);
  const sheets = google.sheets({ version: "v4", auth });
  const leads = await listLeads(auth);

  const existing = leads.find(
    (lead) => lead.name.trim().toLowerCase() === interaction.name.trim().toLowerCase()
  );

  const state = classifyState(interaction.message || "");

  if (!existing) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId(),
      range: `${SHEET_NAME}!A:F`,
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

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!C${existing.rowNumber}:E${existing.rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[interaction.timestamp, interaction.type, state]]
    }
  });

  return "updated";
}

export async function addLead(
  auth: any,
  lead: {
    name: string;
    interactionType: InteractionType;
    state: LeadState;
    lastInteraction?: string;
  }
) {
  await ensureHeader(auth);
  const sheets = google.sheets({ version: "v4", auth });
  
  // Read all rows to calculate the next row number
  const allRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!A:F`
  });
  const allRows = allRes.data.values || [];
  const nextRowNumber = allRows.length + 1;

  const lastInteraction = lead.lastInteraction || new Date().toISOString();

  // Use update with calculated row number to ensure new rows
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!A${nextRowNumber}:F${nextRowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        lead.name,
        new Date().toISOString(),
        lastInteraction,
        lead.interactionType,
        lead.state,
        "NO"
      ]]
    }
  });

  return { status: "added" as const };
}

export async function updateLeadFollowUpScheduled(auth: any, rowNumber: number, value: string) {
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!F${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] }
  });
}

export async function updateLeadState(auth: any, rowNumber: number, state: string) {
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!E${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[state]] }
  });
}

export async function updateLeadName(auth: any, rowNumber: number, name: string) {
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!A${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[name]] }
  });
}

export async function updateLeadLastInteraction(auth: any, rowNumber: number, lastInteraction: string) {
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!C${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[lastInteraction]] }
  });
}

export async function updateLeadInteractionType(auth: any, rowNumber: number, interactionType: string) {
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${SHEET_NAME}!D${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[interactionType]] }
  });
}

function classifyState(message: string): LeadState {
  const msg = message.toLowerCase();

  if (["book", "schedule", "call", "price", "pricing", "quote", "buy", "ready"].some((w) => msg.includes(w))) {
    return "Hot";
  }

  if (["interested", "tell me more", "details", "info"].some((w) => msg.includes(w))) {
    return "Warm";
  }

  return "Cold";
}
