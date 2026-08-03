import type { Story, StoryDefault } from "@ladle/react";
import { Avatar } from "./Avatar.tsx";
import { AvatarStack, type AvatarPerson } from "./AvatarStack.tsx";
import { ACCENTS } from "../lib/theme.ts";

export default {
  title: "Primitives / Avatar",
} satisfies StoryDefault;

export const Sizes: Story = () => (
  <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
    {[16, 24, 32, 48, 64, 96].map((size) => (
      <Avatar key={size} username="ada" displayName="Ada" size={size} />
    ))}
  </div>
);

const NATO_ALPHABET = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliett",
  "kilo",
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
  "tango",
  "uniform",
  "victor",
  "whiskey",
  "xray",
  "yankee",
  "zulu",
];

export const PatternVariety: Story = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, maxWidth: 560 }}>
    {NATO_ALPHABET.map((name) => (
      <div key={name} style={{ textAlign: "center", fontSize: 12 }}>
        <Avatar username={name} displayName={name} size={48} />
        <div style={{ color: "var(--muted)" }}>{name}</div>
      </div>
    ))}
  </div>
);

/** A saved profile accent overrides the username-derived colour — the same
 *  pattern in each of the ten accents, plus the derived default first. */
export const SavedAccent: Story = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, maxWidth: 560 }}>
    <div style={{ textAlign: "center", fontSize: 12 }}>
      <Avatar username="oscar" displayName="oscar" size={48} />
      <div style={{ color: "var(--muted)" }}>derived</div>
    </div>
    {ACCENTS.map((a) => (
      <div key={a.id} style={{ textAlign: "center", fontSize: 12 }}>
        <Avatar username="oscar" displayName="oscar" accent={a.id} size={48} />
        <div style={{ color: "var(--muted)" }}>{a.id}</div>
      </div>
    ))}
  </div>
);

const people = (n: number): AvatarPerson[] =>
  ["ada", "grace", "alan", "edie", "ivy"].slice(0, n).map((name) => ({
    user_id: `user-${name}`,
    username: name,
    display_name: name,
  }));

export const Stack: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {[1, 2, 3, 5].map((n) => (
      <div key={n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AvatarStack people={people(n)} />
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          {n} {n === 1 ? "person" : "people"}
          {n > 3 ? " (renders the first three)" : ""}
        </span>
      </div>
    ))}
  </div>
);
