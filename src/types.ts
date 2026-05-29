export type LeadState = "Cold" | "Warm" | "Hot" | "Inactive";
export type InteractionType = "PM" | "Post Comment";

export interface Lead {
  rowNumber?: number;
  name: string;
  firstAdded: string;
  lastInteraction: string;
  interactionType: InteractionType;
  state: LeadState;
  followUpScheduled: string;
}

declare global {
  interface Window {
    api: {
      googleLogin: () => Promise<{ ok: boolean; email?: string }>;
      getAuthStatus: () => Promise<{ google: boolean; email?: string }>;
      listLeads: () => Promise<Lead[]>;
      addLead: (lead: {
        name: string;
        interactionType: InteractionType;
        state: LeadState;
        lastInteraction?: string;
      }) => Promise<{ status: "added" | "updated" }>;
      scheduleFollowUp: (lead: Lead) => Promise<{ ok: boolean; scheduledAt: string }>;
      updateLeadState: (rowNumber: number, state: LeadState) => Promise<{ ok: boolean }>;
      updateLeadName: (rowNumber: number, name: string) => Promise<{ ok: boolean }>;
      updateLeadLastInteraction: (rowNumber: number, lastInteraction: string) => Promise<{ ok: boolean }>;
      updateLeadInteractionType: (rowNumber: number, interactionType: InteractionType) => Promise<{ ok: boolean }>;
    };
  }
}
