import type { Story, StoryDefault } from "@ladle/react";
import { ThemeControls } from "./ThemeControls.tsx";
import { SaveDataControls } from "./SaveDataControls.tsx";
import { ClaimProfileForm } from "./ClaimProfileForm.tsx";

export default {
  title: "Settings",
} satisfies StoryDefault;

export const Theme: Story = () => (
  <div style={{ maxWidth: 420 }}>
    <p style={{ color: "var(--muted)", fontSize: 14 }}>
      The real settings panel — it writes the actual document theme/accent, so
      it composes with (and overrides) the gallery's own pickers.
    </p>
    <ThemeControls />
  </div>
);

export const SaveData: Story = () => (
  <div style={{ maxWidth: 420 }}>
    <p style={{ color: "var(--muted)", fontSize: 14 }}>
      Export/import touch the browser's real localStorage — the import path
      confirms and reloads, so poke it knowingly.
    </p>
    <SaveDataControls />
  </div>
);

export const ClaimProfile: Story = () => (
  <div style={{ maxWidth: 420 }}>
    <p style={{ color: "var(--muted)", fontSize: 14 }}>
      Username claim form from the account page. Submitting needs a backend;
      here it validates and errors gracefully.
    </p>
    <ClaimProfileForm userId="user-ada" />
  </div>
);
