export type LeadState = "Cold" | "Warm" | "Hot" | "Inactive";
export type InteractionType = string;

export interface Lead {
  rowNumber?: number;
  name: string;
  firstAdded: string;
  lastInteraction: string;
  interactionType: InteractionType;
  state: LeadState;
  followUpScheduled: string;
  customer?: string;
  scheduleDays?: number;
}

declare global {
  interface Window {
    api: {
      googleLogin: () => Promise<{ ok: boolean; email?: string }>;
      getAuthStatus: () => Promise<{ google: boolean; email?: string }>;
      getSheets: () => Promise<string[]>;
      listLeads: (sheetName: string) => Promise<Lead[]>;
      addLead: (lead: {
        name: string;
        interactionType: InteractionType;
        state: LeadState;
        lastInteraction?: string;
        customer?: string;
      }, sheetName: string) => Promise<{ status: "added" | "updated" }>;
      scheduleFollowUp: (lead: Lead, sheetName: string) => Promise<{ ok: boolean; scheduledAt: string }>;
      updateLeadState: (rowNumber: number, state: LeadState, sheetName: string) => Promise<{ ok: boolean }>;
      updateLeadName: (rowNumber: number, name: string, sheetName: string) => Promise<{ ok: boolean }>;
      updateLeadLastInteraction: (rowNumber: number, lastInteraction: string, sheetName: string) => Promise<{ ok: boolean }>;
      updateLeadInteractionType: (rowNumber: number, interactionType: InteractionType, sheetName: string) => Promise<{ ok: boolean }>;
      updateLeadCustomer: (rowNumber: number, customer: string, sheetName: string) => Promise<{ ok: boolean }>;
      removeFollowUp: (lead: Lead, sheetName: string) => Promise<{ ok: boolean }>;
    };
  }
}
