import { useState } from "react";
import { claimProfile } from "../lib/profile.ts";

/** First-sign-in prompt: pick a username + display name before doing
 *  anything else account-related. Reloads on success so every consumer of
 *  useProfile() (header, My Puzzles, admin checks) picks up the new row. */
export function ClaimProfileForm({ userId }: { userId: string }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    const { error } = await claimProfile(userId, username.trim().toLowerCase(), displayName);
    if (error) {
      setSaving(false);
      setFormError(error);
      return;
    }
    window.location.reload();
  };

  return (
    <div className="setting-row">
      <span className="setting-label">Set up your profile</span>
      <form className="settings" onSubmit={submit} style={{ gap: 10 }}>
        <input
          className="text-input"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          required
        />
        <input
          className="text-input"
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          pattern="[a-z0-9_]{3,20}"
          title="3-20 lowercase letters, numbers, or underscores"
          required
        />
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
      {formError && <span className="savedata-status">{formError}</span>}
    </div>
  );
}
