import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

type Note = {
  id: number;
  title: string;
  note: string;
  created: string | null;
  updated: string | null;
};

function stamp(value: string | null) {
  if (!value) return "-";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AccountNotes({ id }: { id: string | undefined }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Note | "new" | null>(null);

  const { data: notes, isLoading } = useQuery<Note[]>({
    queryKey: ["account-notes", id],
    enabled: !!id,
    queryFn: () => apiGet<Note[]>(`/api/accounts/${id}/notes`),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["account-notes", id] });
  }

  return (
    <section className="record-section notes-section">
      <div className="record-head">
        <h2>Notes</h2>
        <button className="link-button" onClick={() => setOpen("new")}>
          Add note
        </button>
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : !notes?.length ? (
        <p className="count">
          Nothing noted on this account yet. Use notes to track anything worth
          remembering - a complaint, an arrangement, a site visit.
        </p>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <button className="note-item" onClick={() => setOpen(n)}>
                <span className="note-title">{n.title}</span>
                <span className="note-preview">
                  {n.note.trim() ? n.note.trim().split("\n")[0] : "No detail"}
                </span>
                <span className="note-stamp">Updated {stamp(n.updated)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <NoteEditor
          accountId={id}
          note={open === "new" ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function NoteEditor({
  accountId,
  note,
  onClose,
  onSaved,
}: {
  accountId: string | undefined;
  note: Note | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (note) {
        const response = await fetch(`/api/notes/${note.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, note: body }),
        });
        if (!response.ok) {
          const b = await response.json().catch(() => null);
          throw new Error(b?.error ?? "Could not save the note");
        }
      } else {
        await apiPost(`/api/accounts/${accountId}/notes`, {
          title,
          note: body,
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!note) return;
    if (!confirm(`Delete the note "${note.title}"?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const b = await response.json().catch(() => null);
        throw new Error(b?.error ?? "Could not delete the note");
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{note ? "Edit note" : "New note"}</h2>
        {note && (
          <p className="modal-sub">
            Created {stamp(note.created)} · last updated {stamp(note.updated)}
          </p>
        )}

        <label className="field-input" style={{ marginBottom: 14 }}>
          <span>Title</span>
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this note about"
          />
        </label>

        <label className="field-input">
          <span>Note</span>
          <textarea
            rows={9}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={saving || !title.trim()}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {note && (
            <>
              <div style={{ flexGrow: 1 }} />
              <button
                className="danger small"
                onClick={remove}
                disabled={saving}
              >
                Delete
              </button>
            </>
          )}
          {!title.trim() && <span className="count">A title is required.</span>}
        </div>
      </div>
    </div>
  );
}
