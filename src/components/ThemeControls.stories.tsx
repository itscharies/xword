import type { Story, StoryDefault } from "@ladle/react";
import { ThemeControls } from "./ThemeControls.tsx";
import { SaveDataControls } from "./SaveDataControls.tsx";
import { ClaimProfileForm } from "./ClaimProfileForm.tsx";
import { AuthProvider } from "../hooks/useAuthContext.tsx";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Settings",
} satisfies StoryDefault;

export const Theme: Story = () => (
  <div style={{ maxWidth: 420 }}>
    <Note>
      The real settings panel — it writes the actual document theme/accent, so
      it composes with (and overrides) the gallery's own pickers. The accent
      row shows because the gallery counts as signed out; signed-in users set
      their accent via the account page's avatar colour instead.
    </Note>
    {/* ThemeControls branches on auth (accent row is signed-out only). */}
    <AuthProvider>
      <ThemeControls />
    </AuthProvider>
  </div>
);

export const SaveData: Story = () => (
  <div style={{ maxWidth: 420 }}>
    <Note>
      Export/import touch the browser's real localStorage — the import path
      confirms and reloads, so poke it knowingly.
    </Note>
    <SaveDataControls />
  </div>
);

export const ClaimProfile: Story = () => (
  <div style={{ maxWidth: 420 }}>
    <Note>
      Username claim form from the account page. Submitting needs a backend;
      here it validates and errors gracefully.
    </Note>
    <ClaimProfileForm userId="user-ada" />
  </div>
);
