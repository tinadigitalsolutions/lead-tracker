const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  googleLogin: () => ipcRenderer.invoke("google:login"),
  getAuthStatus: () => ipcRenderer.invoke("google:status"),
  listLeads: () => ipcRenderer.invoke("sheets:listLeads"),
  addLead: (lead) => ipcRenderer.invoke("sheets:addLead", lead),
  scheduleFollowUp: (lead) => ipcRenderer.invoke("calendar:scheduleFollowUp", lead),
  updateLeadState: (rowNumber, state) =>
    ipcRenderer.invoke("sheets:updateLeadState", rowNumber, state),
  updateLeadName: (rowNumber, name) =>
    ipcRenderer.invoke("sheets:updateLeadName", rowNumber, name),
  updateLeadLastInteraction: (rowNumber, lastInteraction) =>
    ipcRenderer.invoke("sheets:updateLeadLastInteraction", rowNumber, lastInteraction),
  updateLeadInteractionType: (rowNumber, interactionType) =>
    ipcRenderer.invoke("sheets:updateLeadInteractionType", rowNumber, interactionType)
});