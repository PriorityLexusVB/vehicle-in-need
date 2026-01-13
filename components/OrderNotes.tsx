import React, { useEffect, useMemo, useState } from "react";
import type { OrderNote, AppUser, OrderNoteRole } from "../types";
import {
  addOrderNote,
  subscribeToOrderNotes,
} from "../services/orderNotesService";

interface OrderNotesProps {
  orderId: string;
  currentUser?: AppUser | null;
}

const formatNoteTimestamp = (note: OrderNote): string => {
  const ts = note.createdAt;
  if (!ts) return "…";

  try {
    return ts.toDate().toLocaleString();
  } catch {
    return "…";
  }
};

const roleLabel = (role?: OrderNoteRole) => {
  if (role === "manager") return "Manager";
  if (role === "admin") return "Admin";
  return "User";
};

const OrderNotes: React.FC<OrderNotesProps> = ({ orderId, currentUser }) => {
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newText, setNewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isTest = import.meta.env.MODE === "test";

  const canAdd = !!currentUser?.isManager;

  const createdByName = useMemo(() => {
    if (!currentUser) return "Unknown";
    return currentUser.displayName || currentUser.email || "Unknown";
  }, [currentUser]);

  useEffect(() => {
    if (isTest) {
      setLoading(false);
      setNotes([]);
      return;
    }

    if (!orderId) {
      setLoading(false);
      setNotes([]);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const unsub = subscribeToOrderNotes(
      orderId,
      (nextNotes) => {
        setNotes(nextNotes);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load order notes", error);
        setLoadError("Unable to load notes right now.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [orderId, isTest]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser?.uid) {
      setSubmitError("You must be signed in to add notes.");
      return;
    }

    const text = newText.trim();
    if (!text) return;

    if (text.length > 2000) {
      setSubmitError("Note is too long (max 2000 characters).");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await addOrderNote({
        orderId,
        text,
        createdByUid: currentUser.uid,
        createdByName,
        createdByEmail: currentUser.email,
        createdByRole: (currentUser.isManager
          ? "manager"
          : "user") as OrderNoteRole,
      });
      setNewText("");
    } catch (error) {
      console.error("Failed to add order note", error);
      setSubmitError("Failed to add note. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-50 p-3 rounded-lg border">
      <div className="flex items-center justify-between gap-3 mb-2">
        <strong className="block text-slate-500 text-sm font-semibold">
          Process Notes
        </strong>
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {!loadError && notes.length === 0 && !loading && (
        <p className="text-sm text-slate-500">No notes yet.</p>
      )}

      {!loadError && notes.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-auto pr-1">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-white border border-slate-200 rounded-md p-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-600">
                    {note.createdByName || "Unknown"}
                  </span>
                  {note.createdByRole && (
                    <span className="ml-1 text-slate-400">
                      ({roleLabel(note.createdByRole)})
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {formatNoteTimestamp(note)}
                </div>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">
                {note.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <form onSubmit={handleAdd} className="mt-3">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Add Note
          </label>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={3}
            maxLength={2000}
            className="block w-full p-2.5 border border-slate-300 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
            placeholder="Add a process update…"
          />
          {submitError && (
            <p className="mt-1 text-sm text-red-600">{submitError}</p>
          )}
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={isSubmitting || newText.trim().length === 0}
              className="text-sm bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving…" : "Add Note"}
            </button>
          </div>
        </form>
      )}

      {!canAdd && (
        <p className="mt-3 text-xs text-slate-400">
          Only managers/admin can add notes.
        </p>
      )}
    </div>
  );
};

export default OrderNotes;
