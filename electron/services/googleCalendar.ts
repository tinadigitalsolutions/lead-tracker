import { google } from "googleapis";
import type { Lead, LeadState } from "../../src/types.js";

export function getFollowUpDelayDays(state: LeadState): number | null {
  if (state === "Cold") return 7;
  if (state === "Warm") return 4;
  if (state === "Hot") return 2;
  return null;
}

export async function createFollowUpEvent(auth: any, lead: Lead) {
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  const delayDays = getFollowUpDelayDays(lead.state);
  if (!delayDays) throw new Error("No follow-up delay for this state.");

  const start = new Date();
  start.setDate(start.getDate() + delayDays);
  start.setHours(9, 0, 0, 0);

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 30);

  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Follow up with ${lead.name}`,
      description: [
        `Lead state: ${lead.state}`,
        `Last interaction: ${lead.lastInteraction}`,
        `Interaction type: ${lead.interactionType}`,
        "",
        "Created by Lead Tracker."
      ].join("\n"),
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    }
  });

  return start.toISOString();
}
