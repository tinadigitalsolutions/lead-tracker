const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  googleLogin: () => ipcRenderer.invoke("google:login"),
  getAuthStatus: () => ipcRenderer.invoke("google:status"),
  getSheets: () => ipcRenderer.invoke("sheets:getSheets"),
  listLeads: (sheetName) => ipcRenderer.invoke("sheets:listLeads", sheetName),
  addLead: (lead, sheetName) => ipcRenderer.invoke("sheets:addLead", lead, sheetName),
  scheduleFollowUp: (lead, sheetName) => ipcRenderer.invoke("calendar:scheduleFollowUp", lead, sheetName),
  updateLeadState: (rowNumber, state, sheetName) =>
    ipcRenderer.invoke("sheets:updateLeadState", rowNumber, state, sheetName),
  updateLeadName: (rowNumber, name, sheetName) =>
    ipcRenderer.invoke("sheets:updateLeadName", rowNumber, name, sheetName),
  updateLeadLastInteraction: (rowNumber, lastInteraction, sheetName) =>
    ipcRenderer.invoke("sheets:updateLeadLastInteraction", rowNumber, lastInteraction, sheetName),
  updateLeadInteractionType: (rowNumber, interactionType, sheetName) =>
    ipcRenderer.invoke("sheets:updateLeadInteractionType", rowNumber, interactionType, sheetName),
  updateLeadCustomer: (rowNumber, customer, sheetName) =>
    ipcRenderer.invoke("sheets:updateLeadCustomer", rowNumber, customer, sheetName),
  removeFollowUp: (lead, sheetName) =>
    ipcRenderer.invoke("calendar:removeFollowUp", lead, sheetName)
});