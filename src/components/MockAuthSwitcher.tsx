import { useState } from "react";
import { MOCK_PROFILES, mockCurrentUserId, mockSignIn, mockSignOut } from "../lib/mockSupabase.ts";

/** Dev-only widget, only rendered by App.tsx when VITE_MOCK_BACKEND=1: lets
 *  you flip between signed-out and each seeded fake user to exercise
 *  signed-in/signed-out UI locally, without real OAuth or editing state into
 *  the code by hand. Firing mockSignIn/mockSignOut here reuses the exact
 *  same onAuthStateChange listeners the real app already subscribes
 *  through — see mockSupabase.ts and hooks/useAuthContext.tsx. */
export function MockAuthSwitcher() {
  const [current, setCurrent] = useState(mockCurrentUserId());

  const onChange = (userId: string) => {
    if (userId) mockSignIn(userId);
    else mockSignOut();
    setCurrent(userId || null);
  };

  return (
    <div className="mock-auth-switcher">
      <label>
        Mock backend — signed in as:{" "}
        <select value={current ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Signed out</option>
          {MOCK_PROFILES.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.display_name} (@{p.username})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
