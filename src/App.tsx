import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, RefreshCw, LogIn, AlertCircle } from "lucide-react";
import type { InteractionType, Lead, LeadState } from "./types";

const stateDelay: Record<LeadState, number | null> = {
  Cold: 7,
  Warm: 4,
  Hot: 2,
  Inactive: null
};
export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState<"All" | LeadState>("All");
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadType, setNewLeadType] = useState<InteractionType>("PM");
  const [newLeadState, setNewLeadState] = useState<LeadState>("Cold");
  const [loading, setLoading] = useState(false);

  const visibleLeads = useMemo(() => {
    if (filter === "All") return leads;
    return leads.filter((l) => l.state === filter);
  }, [leads, filter]);

  async function refresh() {
    const auth = await window.api.getAuthStatus();
    setGoogleConnected(auth.google);
    setEmail(auth.email || "");

    if (auth.google) {
      try {
        setLeads(await window.api.listLeads());
      } catch (err: any) {
        setStatus(err.message || "Failed to load leads.");
      }
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function connectGoogle() {
    setLoading(true);
    setStatus("Opening Google login...");
    try {
      if (!window.api) {
        alert("Electron preload did not load. Do not open this app in Chrome/Safari. Run it through Electron with npm run dev.");
        return;
      }
      const result = await window.api.googleLogin();
      setGoogleConnected(result.ok);
      setEmail(result.email || "");
      setStatus("Google connected.");
      await refresh();
    } catch (err: any) {
      setStatus(err.message || "Google login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function schedule(lead: Lead) {
    setLoading(true);
    setStatus(`Scheduling follow-up for ${lead.name}...`);
    try {
      const result = await window.api.scheduleFollowUp(lead);
      setStatus(`Follow-up scheduled for ${new Date(result.scheduledAt).toLocaleString()}.`);
      setLeads(await window.api.listLeads());
    } catch (err: any) {
      setStatus(err.message || "Failed to schedule follow-up.");
    } finally {
      setLoading(false);
    }
  }

  async function addNewLead() {
    if (!newLeadName.trim()) {
      setStatus("Please enter a lead name.");
      return;
    }

    setLoading(true);
    setStatus("Saving new lead...");

    try {
      const result = await window.api.addLead({
        name: newLeadName.trim(),
        interactionType: newLeadType,
        state: newLeadState
      });

      setStatus(result.status === "added" ? "New lead added." : "Existing lead updated.");
      setNewLeadName("");
      setNewLeadType("PM");
      setNewLeadState("Cold");
      setLeads(await window.api.listLeads());
    } catch (err: any) {
      setStatus(err.message || "Failed to add lead.");
    } finally {
      setLoading(false);
    }
  }

  async function updateState(lead: Lead, state: LeadState) {
    if (!lead.rowNumber) return;
    try {
      await window.api.updateLeadState(lead.rowNumber, state);
      setLeads(await window.api.listLeads());
    } catch (err: any) {
      setStatus(err.message || "Failed to update lead state.");
    }
  }

  async function updateName(lead: Lead, name: string) {
    if (!lead.rowNumber || !name.trim()) return;
    try {
      await window.api.updateLeadName(lead.rowNumber, name.trim());
      setLeads(await window.api.listLeads());
    } catch (err: any) {
      setStatus(err.message || "Failed to update lead name.");
    }
  }

  async function updateLastInteraction(lead: Lead, lastInteraction: string) {
    if (!lead.rowNumber) return;
    try {
      await window.api.updateLeadLastInteraction(lead.rowNumber, lastInteraction);
      setLeads(await window.api.listLeads());
    } catch (err: any) {
      setStatus(err.message || "Failed to update last interaction.");
    }
  }

  async function updateInteractionType(lead: Lead, interactionType: InteractionType) {
    if (!lead.rowNumber) return;
    try {
      await window.api.updateLeadInteractionType(lead.rowNumber, interactionType);
      setLeads(await window.api.listLeads());
    } catch (err: any) {
      setStatus(err.message || "Failed to update interaction type.");
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <h1>Lead Tracker</h1>
          <p>Manage leads in Google Sheets and schedule follow-up reminders in Google Calendar.</p>
        </div>
        <div className="auth-card">
          <div className={googleConnected ? "pill ok" : "pill warn"}>
            {googleConnected ? `Google connected${email ? `: ${email}` : ""}` : "Google not connected"}
          </div>
          {!googleConnected && (
            <button className="primary" onClick={connectGoogle} disabled={loading}>
              <LogIn size={16} /> Connect Google
            </button>
          )}
        </div>
      </header>

      <section className="toolbar">
        <div className="add-lead-panel">
          <input
            type="text"
            placeholder="New lead name"
            value={newLeadName}
            onChange={(e) => setNewLeadName(e.target.value)}
            disabled={!googleConnected || loading}
          />
          <select
            value={newLeadType}
            onChange={(e) => setNewLeadType(e.target.value as InteractionType)}
            disabled={!googleConnected || loading}
          >
            <option value="PM">PM</option>
            <option value="Post Comment">Post Comment</option>
          </select>
          <select
            value={newLeadState}
            onChange={(e) => setNewLeadState(e.target.value as LeadState)}
            disabled={!googleConnected || loading}
          >
            <option>Cold</option>
            <option>Warm</option>
            <option>Hot</option>
            <option>Inactive</option>
          </select>
          <button className="primary" onClick={addNewLead} disabled={!googleConnected || loading || !newLeadName.trim()}>
            Add Lead
          </button>
        </div>

        <button onClick={refresh} disabled={!googleConnected || loading}>
          Re-sync Sheet
        </button>

        <div className="filters">
          {(["All", "Cold", "Warm", "Hot", "Inactive"] as const).map((s) => (
            <button key={s} className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>
              {s}
            </button>
          ))}
        </div>
      </section>

      {status && (
        <div className="status">
          <AlertCircle size={16} /> {status}
        </div>
      )}

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>First Added</th>
              <th>Last Interaction</th>
              <th>Interaction Type</th>
              <th>State</th>
              <th>Follow-up Scheduled</th>
              <th>Calendar</th>
            </tr>
          </thead>
          <tbody>
            {visibleLeads.map((lead) => {
              const delay = stateDelay[lead.state];
              const alreadyScheduled = lead.followUpScheduled && lead.followUpScheduled !== "NO";
              return (
                <tr key={`${lead.rowNumber}-${lead.name}`}>
                  <td><input type="text" value={lead.name} onBlur={(e) => updateName(lead, e.target.value)} disabled={loading} style={{ width: "100%" }} /></td>
                  <td><input type="text" value={lead.firstAdded} disabled style={{ width: "100%", opacity: 0.6 }} /></td>
                  <td><input type="text" value={lead.lastInteraction} onBlur={(e) => updateLastInteraction(lead, e.target.value)} disabled={loading} style={{ width: "100%" }} /></td>
                  <td>
                    <select value={lead.interactionType} onBlur={(e) => updateInteractionType(lead, e.target.value as InteractionType)} disabled={loading} style={{ width: "100%" }}>
                      <option value="PM">PM</option>
                      <option value="Post Comment">Post Comment</option>
                    </select>
                  </td>
                  <td>
                    <select value={lead.state} onBlur={(e) => updateState(lead, e.target.value as LeadState)} disabled={loading} style={{ width: "100%" }}>
                      <option>Cold</option>
                      <option>Warm</option>
                      <option>Hot</option>
                      <option>Inactive</option>
                    </select>
                  </td>
                  <td>{lead.followUpScheduled || "NO"}</td>
                  <td>
                    <button disabled={loading || delay === null || alreadyScheduled} onClick={() => schedule(lead)}>
                      <CalendarPlus size={15} />
                      {alreadyScheduled ? "Scheduled" : delay ? `Schedule +${delay}d` : "Disabled"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleLeads.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No leads yet. Connect Google and refresh the sheet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
