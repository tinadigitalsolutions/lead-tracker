import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarPlus, LogIn, RefreshCw } from "lucide-react";
import type { InteractionType, Lead, LeadState } from "./types";

const defaultInteractionTypes = ["PM", "Post Comment"];

const stateDelay: Record<LeadState, number | null> = {
  Cold: 7,
  Warm: 4,
  Hot: 2,
  Inactive: null,
};

export default function App() {
  const addLeadFieldStyle = { fontSize: "13px", fontWeight: "700" };

  const [leads, setLeads] = useState<Lead[]>([]);
  const [sheets, setSheets] = useState<string[]>([]);
  const [currentSheet, setCurrentSheet] = useState<string>("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [sortConfig, setSortConfig] = useState<{ column: keyof Lead | null; direction: "asc" | "desc" }>({ column: null, direction: "asc" });
  const [columnFilters, setColumnFilters] = useState<Partial<Record<keyof Lead, string>>>({});
  const [stateFilter, setStateFilter] = useState<LeadState[]>([]);

  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadType, setNewLeadType] = useState<InteractionType>("PM");
  const [interactionTypes, setInteractionTypes] = useState<InteractionType[]>(defaultInteractionTypes);
  const [newInteractionTypeMode, setNewInteractionTypeMode] = useState<"select" | "new">("select");
  const [newLeadState, setNewLeadState] = useState<LeadState>("Cold");
  const [newLeadCustomer, setNewLeadCustomer] = useState("");
  const [newCustomerMode, setNewCustomerMode] = useState<"select" | "new">("select");

  const [loading, setLoading] = useState(false);
  const [firstLaunchPromptShown, setFirstLaunchPromptShown] = useState(false);

  // Per-row days override for scheduling
  const [daysOverride, setDaysOverride] = useState<Record<number, number>>({});

  // Local row drafts prevent Google Sheets refreshes from fighting the text inputs.
  const [drafts, setDrafts] = useState<Record<number, Lead>>({});

  const visibleLeads = useMemo(() => {
    let result = leads;

    // Apply state filter
    if (stateFilter.length > 0) {
      result = result.filter((lead) => stateFilter.includes(lead.state));
    }

    // Apply other column filters (excluding state)
    for (const [col, val] of Object.entries(columnFilters)) {
      if (col === "state" || !val) continue;
      result = result.filter((lead) =>
        String(lead[col as keyof Lead] ?? "").toLowerCase().includes(val.toLowerCase())
      );
    }

    if (sortConfig.column) {
      const { column, direction } = sortConfig;
      result = [...result].sort((a, b) => {
        const aVal = String(a[column] ?? "");
        const bVal = String(b[column] ?? "");
        return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }

    return result;
  }, [leads, columnFilters, stateFilter, sortConfig]);

  const interactionTypeOptions = useMemo(() => {
    const all = [...defaultInteractionTypes, ...interactionTypes, ...leads.map((lead) => lead.interactionType)];
    return Array.from(new Set(all.filter(Boolean)));
  }, [interactionTypes, leads]);

  function getDraft(lead: Lead): Lead {
    if (!lead.rowNumber) return lead;
    return drafts[lead.rowNumber] ?? lead;
  }

  function updateDraft(rowNumber: number, field: keyof Lead, value: string) {
    const baseLead = leads.find((lead) => lead.rowNumber === rowNumber);
    if (!baseLead) return;

    setDrafts((previous) => ({
      ...previous,
      [rowNumber]: {
        ...baseLead,
        ...previous[rowNumber],
        [field]: value,
      },
    }));
  }

  function clearDraft(rowNumber: number) {
    setDrafts((previous) => {
      const copy = { ...previous };
      delete copy[rowNumber];
      return copy;
    });
  }

  function toggleSort(column: keyof Lead) {
    setSortConfig((prev) => ({
      column,
      direction: prev.column === column && prev.direction === "asc" ? "desc" : "asc",
    }));
  }

  function setColumnFilter(col: keyof Lead, val: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: val }));
  }

  function sortIcon(col: keyof Lead) {
    if (sortConfig.column !== col) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  }

  async function refresh() {
    const auth = await window.api.getAuthStatus();

    setGoogleConnected(auth.google);
    setEmail(auth.email || "");

    // On first launch, prompt user to connect Google
    if (auth.isFirstLaunch && !firstLaunchPromptShown) {
      setFirstLaunchPromptShown(true);
      const shouldConnect = window.confirm(
        "Welcome to Lead Tracker! Connect your Google account to get started?"
      );
      if (shouldConnect) {
        await connectGoogle();
        return; // connectGoogle will call refresh internally
      }
    }

    if (auth.google) {
      try {
        const availableSheets = await window.api.getSheets();
        setSheets(availableSheets);
        const sheet = currentSheet && availableSheets.includes(currentSheet)
          ? currentSheet
          : availableSheets[0] ?? "";
        if (sheet !== currentSheet) setCurrentSheet(sheet);
        if (sheet) {
          const loadedLeads = await window.api.listLeads(sheet);
          setLeads(loadedLeads);
          const loadedTypes = loadedLeads.map((lead) => lead.interactionType).filter(Boolean);
          setInteractionTypes(Array.from(new Set([...defaultInteractionTypes, ...loadedTypes])));
        }
      } catch (err: any) {
        setStatus(err.message || "Failed to load leads.");
      }
    }
  }

  useEffect(() => {
    refresh();
  }, [currentSheet, firstLaunchPromptShown]);

  async function connectGoogle() {
    setLoading(true);
    setStatus("Opening Google login...");

    try {
      if (!window.api) {
        alert(
          "Electron preload did not load. Do not open this app in Chrome/Safari. Run it through Electron with npm run dev."
        );
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

  async function addNewLead() {
    if (!newLeadName.trim()) {
      setStatus("Please enter a lead name.");
      return;
    }

    const customer = newLeadCustomer.trim();
    if (!customer) {
      setStatus("Please select or enter a customer.");
      return;
    }

    const interactionType = newLeadType.trim();
    if (!interactionType) {
      setStatus("Please select or enter an interaction type.");
      return;
    }

    setLoading(true);
    setStatus("Saving new lead...");

    try {
      const result = await window.api.addLead({
        name: newLeadName.trim(),
        interactionType,
        state: newLeadState,
        lastInteraction: new Date().toISOString().split("T")[0],
        customer,
      }, customer);

      setStatus(result.status === "added" ? "New lead added." : "Existing lead updated.");
      setNewLeadName("");
      setNewLeadType("PM");
      setNewInteractionTypeMode("select");
      setNewLeadState("Cold");
      setNewLeadCustomer("");
      setNewCustomerMode("select");

      // Switch to the customer's sheet and refresh sheets list
      const availableSheets = await window.api.getSheets();
      setSheets(availableSheets);
      setCurrentSheet(customer);
      const loadedLeads = await window.api.listLeads(customer);
      setLeads(loadedLeads);
      const loadedTypes = loadedLeads.map((lead) => lead.interactionType).filter(Boolean);
      setInteractionTypes(Array.from(new Set([...defaultInteractionTypes, interactionType, ...loadedTypes])));
    } catch (err: any) {
      setStatus(err.message || "Failed to add lead.");
    } finally {
      setLoading(false);
    }
  }

  async function schedule(lead: Lead) {
    setLoading(true);
    setStatus(`Scheduling follow-up for ${lead.name}...`);

    try {
      const result = await window.api.scheduleFollowUp(lead, currentSheet);

      setStatus(`Follow-up scheduled for ${new Date(result.scheduledAt).toLocaleString()}.`);
      setLeads(await window.api.listLeads(currentSheet));
    } catch (err: any) {
      setStatus(err.message || "Failed to schedule follow-up.");
    } finally {
      setLoading(false);
    }
  }

  async function updateName(lead: Lead, name: string) {
    if (!lead.rowNumber || !name.trim()) return;

    try {
      await window.api.updateLeadName(lead.rowNumber, name.trim(), currentSheet);
      clearDraft(lead.rowNumber);
      setLeads(await window.api.listLeads(currentSheet));
    } catch (err: any) {
      setStatus(err.message || "Failed to update lead name.");
    }
  }

  async function updateLastInteraction(lead: Lead, lastInteraction: string) {
    if (!lead.rowNumber) return;

    try {
      await window.api.updateLeadLastInteraction(lead.rowNumber, lastInteraction, currentSheet);
      clearDraft(lead.rowNumber);
      setLeads(await window.api.listLeads(currentSheet));
    } catch (err: any) {
      setStatus(err.message || "Failed to update last interaction.");
    }
  }

  async function updateInteractionType(lead: Lead, interactionType: InteractionType) {
    if (!lead.rowNumber) return;

    try {
      await window.api.updateLeadInteractionType(lead.rowNumber, interactionType, currentSheet);
      clearDraft(lead.rowNumber);
      setLeads(await window.api.listLeads(currentSheet));
    } catch (err: any) {
      setStatus(err.message || "Failed to update interaction type.");
    }
  }

  async function updateCustomer(lead: Lead, customer: string) {
    if (!lead.rowNumber) return;

    try {
      await window.api.updateLeadCustomer(lead.rowNumber, customer, currentSheet);
      clearDraft(lead.rowNumber);
      setLeads(await window.api.listLeads(currentSheet));
    } catch (err: any) {
      setStatus(err.message || "Failed to update customer.");
    }
  }

  async function updateState(lead: Lead, state: LeadState) {
    if (!lead.rowNumber) return;

    try {
      await window.api.updateLeadState(lead.rowNumber, state, currentSheet);
      clearDraft(lead.rowNumber);
      setLeads(await window.api.listLeads(currentSheet));
    } catch (err: any) {
      setStatus(err.message || "Failed to update lead state.");
    }
  }

  async function removeFollowUp(lead: Lead) {
    if (!lead.rowNumber) return;

    try {
      await window.api.removeFollowUp(lead, currentSheet);
      setLeads(await window.api.listLeads(currentSheet));
    } catch (err: any) {
      setStatus(err.message || "Failed to remove follow-up.");
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
              <LogIn size={16} />
              Connect Google
            </button>
          )}
        </div>
      </header>

      <section className="toolbar">
        <h2 style={{ margin: "0", fontSize: "16px", fontWeight: "700", width: "100%" }}>Add New Lead</h2>

        <input
          type="text"
          placeholder="Lead name"
          value={newLeadName}
          onChange={(event) => setNewLeadName(event.target.value)}
          disabled={!googleConnected || loading}
          style={addLeadFieldStyle}
        />

        {newCustomerMode === "select" ? (
          <select
            value={newLeadCustomer}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setNewCustomerMode("new");
                setNewLeadCustomer("");
              } else {
                setNewLeadCustomer(e.target.value);
              }
            }}
            disabled={!googleConnected || loading}
            style={{ ...addLeadFieldStyle, borderColor: !newLeadCustomer ? "#f87171" : undefined, minWidth: "140px" }}
          >
            <option value="">Select customer *</option>
            {sheets.map((sheet) => (
              <option key={sheet} value={sheet}>{sheet}</option>
            ))}
            <option value="__new__">+ New customer…</option>
          </select>
        ) : (
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              type="text"
              placeholder="New customer name *"
              value={newLeadCustomer}
              onChange={(e) => setNewLeadCustomer(e.target.value)}
              disabled={!googleConnected || loading}
              autoFocus
              style={{ ...addLeadFieldStyle, borderColor: !newLeadCustomer ? "#f87171" : undefined }}
            />
            <button
              onClick={() => { setNewCustomerMode("select"); setNewLeadCustomer(""); }}
              disabled={loading}
              title="Cancel"
              style={addLeadFieldStyle}
            >✕</button>
          </div>
        )}

        {newInteractionTypeMode === "select" ? (
          <select
            value={interactionTypeOptions.includes(newLeadType) ? newLeadType : ""}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setNewInteractionTypeMode("new");
                setNewLeadType("");
              } else {
                setNewLeadType(e.target.value as InteractionType);
              }
            }}
            disabled={!googleConnected || loading}
            style={{ ...addLeadFieldStyle, borderColor: !newLeadType.trim() ? "#f87171" : undefined, minWidth: "150px" }}
          >
            <option value="">Select interaction type *</option>
            {interactionTypeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
            <option value="__new__">+ New interaction type...</option>
          </select>
        ) : (
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              type="text"
              placeholder="New interaction type *"
              value={newLeadType}
              onChange={(e) => setNewLeadType(e.target.value as InteractionType)}
              disabled={!googleConnected || loading}
              autoFocus
              style={{ ...addLeadFieldStyle, borderColor: !newLeadType.trim() ? "#f87171" : undefined, minWidth: "150px" }}
            />
            <button
              onClick={() => {
                setNewInteractionTypeMode("select");
                setNewLeadType("PM");
              }}
              disabled={loading}
              title="Cancel"
              style={addLeadFieldStyle}
            >✕</button>
          </div>
        )}

        <select
          value={newLeadState}
          onChange={(event) => setNewLeadState(event.target.value as LeadState)}
          disabled={!googleConnected || loading}
          style={addLeadFieldStyle}
        >
          <option value="Cold">Cold</option>
          <option value="Warm">Warm</option>
          <option value="Hot">Hot</option>
          <option value="Inactive">Inactive</option>
        </select>

        <button className="primary" onClick={addNewLead} disabled={!googleConnected || loading} style={addLeadFieldStyle} title="Add new lead">
          +
        </button>

        <button onClick={refresh} disabled={!googleConnected || loading} title="Re-sync sheet" style={addLeadFieldStyle}>
          <RefreshCw size={16} />
        </button>

        <select
          value={currentSheet}
          onChange={(e) => setCurrentSheet(e.target.value)}
          disabled={!googleConnected || loading}
          style={addLeadFieldStyle}
        >
          {sheets.map((sheet) => (
            <option key={sheet} value={sheet}>
              {sheet}
            </option>
          ))}
        </select>

        <div className="filters">
          {(["Cold", "Warm", "Hot", "Inactive"] as const).map((s) => (
            <button
              key={s}
              className={stateFilter.includes(s) ? "active" : ""}
              onClick={() =>
                setStateFilter((prev) =>
                  prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                )
              }
              disabled={loading}
              style={{ fontSize: "13px", fontWeight: "700" }}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {status && (
        <div className="status">
          <AlertCircle size={16} />
          {status}
        </div>
      )}

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort("name")}>Name {sortIcon("name")}</th>
              <th className="sortable" onClick={() => toggleSort("customer")}>Customer {sortIcon("customer")}</th>
              <th className="sortable" onClick={() => toggleSort("firstAdded")}>First Added {sortIcon("firstAdded")}</th>
              <th className="sortable" onClick={() => toggleSort("lastInteraction")}>Last Interaction {sortIcon("lastInteraction")}</th>
              <th className="sortable" onClick={() => toggleSort("interactionType")}>Interaction Type {sortIcon("interactionType")}</th>
              <th className="sortable" onClick={() => toggleSort("state")}>
                <select
                  value={stateFilter.length === 1 ? stateFilter[0] : ""}
                  onChange={(e) => {
                    e.stopPropagation();
                    setStateFilter(e.target.value ? [e.target.value as LeadState] : []);
                  }}
                  style={{ width: "100%", fontSize: "13px", fontWeight: "700" }}
                  title="Select a state to filter"
                >
                  <option value="">All States</option>
                  <option value="Cold">Cold</option>
                  <option value="Warm">Warm</option>
                  <option value="Hot">Hot</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </th>
              <th className="sortable" onClick={() => toggleSort("followUpScheduled")} style={{ width: "140px" }}>Follow-up {sortIcon("followUpScheduled")}</th>
              <th>Calendar</th>
            </tr>
            <tr className="filter-row">
              <td>
                <input
                  type="text"
                  placeholder="Filter name…"
                  value={columnFilters.name ?? ""}
                  onChange={(e) => setColumnFilter("name", e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Filter customer…"
                  value={columnFilters.customer ?? ""}
                  onChange={(e) => setColumnFilter("customer", e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="e.g. 2026-05"
                  value={columnFilters.firstAdded ?? ""}
                  onChange={(e) => setColumnFilter("firstAdded", e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="e.g. 2026-05"
                  value={columnFilters.lastInteraction ?? ""}
                  onChange={(e) => setColumnFilter("lastInteraction", e.target.value)}
                />
              </td>
              <td>
                <select
                  value={columnFilters.interactionType ?? ""}
                  onChange={(e) => setColumnFilter("interactionType", e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">All</option>
                  {interactionTypeOptions.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </td>
              <td />
              <td>
                <input
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters.followUpScheduled ?? ""}
                  onChange={(e) => setColumnFilter("followUpScheduled", e.target.value)}
                />
              </td>
              <td />
            </tr>
          </thead>

          <tbody>
            {visibleLeads.map((lead) => {
              const draft = getDraft(lead);
              const delay = stateDelay[draft.state];
              const followUpDate = draft.followUpScheduled && draft.followUpScheduled.trim() !== "" && draft.followUpScheduled.trim().toUpperCase() !== "NO"
                ? new Date(draft.followUpScheduled)
                : null;
              const alreadyScheduled = followUpDate !== null && !isNaN(followUpDate.getTime());
              const followUpPast = alreadyScheduled && followUpDate! <= new Date();

              return (
                <tr key={lead.rowNumber ?? lead.name}>
                  <td>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(event) =>
                        lead.rowNumber && updateDraft(lead.rowNumber, "name", event.target.value)
                      }
                      onBlur={(event) => updateName(lead, event.target.value)}
                      disabled={loading}
                      style={{ width: "200px" }}
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      value={draft.customer || ""}
                      onChange={(event) =>
                        lead.rowNumber && updateDraft(lead.rowNumber, "customer", event.target.value)
                      }
                      onBlur={(event) => updateCustomer(lead, event.target.value)}
                      disabled={loading}
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    {(() => {
                      const d = new Date(draft.firstAdded);
                      return isNaN(d.getTime())
                        ? draft.firstAdded
                        : d.toLocaleDateString(undefined, { dateStyle: "medium" });
                    })()}
                  </td>

                  <td>
                    <input
                      type="date"
                      value={draft.lastInteraction}
                      onChange={(event) =>
                        lead.rowNumber &&
                        updateDraft(lead.rowNumber, "lastInteraction", event.target.value)
                      }
                      onBlur={(event) => updateLastInteraction(lead, event.target.value)}
                      disabled={loading}
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    <select
                      value={draft.interactionType}
                      onChange={(event) => {
                        const interactionType = event.target.value as InteractionType;

                        if (lead.rowNumber) {
                          updateDraft(lead.rowNumber, "interactionType", interactionType);
                        }

                        updateInteractionType(lead, interactionType);
                      }}
                      disabled={loading}
                      style={{ width: "100%" }}
                    >
                      {interactionTypeOptions.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>

                  <td className={`state-cell state-${draft.state.toLowerCase()}`}>
                    <select
                      className="state-select"
                      value={draft.state}
                      onChange={(event) => {
                        const state = event.target.value as LeadState;

                        if (lead.rowNumber) {
                          updateDraft(lead.rowNumber, "state", state);
                          // Clear the days override so it resets to the new state's default
                          setDaysOverride((prev) => {
                            const copy = { ...prev };
                            delete copy[lead.rowNumber!];
                            return copy;
                          });
                        }

                        updateState(lead, state);
                      }}
                      disabled={loading}
                    >
                      <option value="Cold">Cold</option>
                      <option value="Warm">Warm</option>
                      <option value="Hot">Hot</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </td>

                  <td style={{ width: "140px" }}>
                    {draft.followUpScheduled && draft.followUpScheduled.trim() !== "" && draft.followUpScheduled.trim().toUpperCase() !== "NO"
                      ? (() => {
                          const d = new Date(draft.followUpScheduled);
                          return isNaN(d.getTime())
                            ? draft.followUpScheduled
                            : d.toLocaleDateString(undefined, { dateStyle: "medium" });
                        })()
                      : <span className="muted">—</span>}
                  </td>

                  <td>
                    {alreadyScheduled && !followUpPast ? (
                      <div className="schedule-cell">
                        <button disabled>
                          <CalendarPlus size={15} />
                          Scheduled
                        </button>
                        <button
                          className="remove-followup"
                          disabled={loading}
                          onClick={() => removeFollowUp(draft)}
                          title="Remove follow-up"
                        >
                          ✕
                        </button>
                      </div>
                    ) : delay === null ? (
                      <button disabled>
                        <CalendarPlus size={15} />
                        Disabled
                      </button>
                    ) : (
                      <div className="schedule-cell">
                        <input
                          type="number"
                          className="days-input"
                          min={1}
                          max={365}
                          value={lead.rowNumber != null ? (daysOverride[lead.rowNumber] ?? delay) : delay}
                          onChange={(e) => {
                            if (lead.rowNumber != null)
                              setDaysOverride((prev) => ({ ...prev, [lead.rowNumber!]: Number(e.target.value) }));
                          }}
                          disabled={loading}
                        />
                        <span className="days-label">days</span>
                        <button
                          disabled={loading}
                          onClick={() => {
                            const days = lead.rowNumber != null ? (daysOverride[lead.rowNumber] ?? delay) : delay;
                            schedule({ ...draft, scheduleDays: days ?? undefined });
                          }}
                        >
                          <CalendarPlus size={15} />
                          {followUpPast ? "Reschedule" : "Schedule"}
                        </button>
                        {followUpPast && (
                          <button
                            className="remove-followup"
                            disabled={loading}
                            onClick={() => removeFollowUp(draft)}
                            title="Remove follow-up"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {visibleLeads.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
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
