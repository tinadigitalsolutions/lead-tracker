import electron from "electron";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  googleLogin: () => ipcRenderer.invoke("google:login"),
  getAuthStatus: () => ipcRenderer.invoke("google:status"),
  listLeads: () => ipcRenderer.invoke("sheets:listLeads"),
  addLead: (lead: { name: string; interactionType: string; state: string; lastInteraction?: string }) =>
    ipcRenderer.invoke("sheets:addLead", lead),
  scheduleFollowUp: (lead: unknown) =>
    ipcRenderer.invoke("calendar:scheduleFollowUp", lead),
  updateLeadState: (rowNumber: number, state: string) =>
    ipcRenderer.invoke("sheets:updateLeadState", rowNumber, state),
  updateLeadName: (rowNumber: number, name: string) =>
    ipcRenderer.invoke("sheets:updateLeadName", rowNumber, name),
  updateLeadLastInteraction: (rowNumber: number, lastInteraction: string) =>
    ipcRenderer.invoke("sheets:updateLeadLastInteraction", rowNumber, lastInteraction),
  updateLeadInteractionType: (rowNumber: number, interactionType: string) =>
    ipcRenderer.invoke("sheets:updateLeadInteractionType", rowNumber, interactionType)
});
