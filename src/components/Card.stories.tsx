import type { Story, StoryDefault } from "@ladle/react";
import { Card } from "./Card.tsx";
import { Avatar } from "./Avatar.tsx";
import { CheckIcon, DeleteIcon, EditIcon, UserPlusIcon } from "./icons.tsx";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Primitives / Card",
} satisfies StoryDefault;

export const Interactive: Story = () => (
  <div style={{ maxWidth: 620 }}>
    <Note>
      Cards with onPress light up: hover inverts to the accent, click presses
      the card down into its shadow. A plain click target is a real button;
      a card layering its own action buttons stays an li (role="button") so
      it can nest them.
    </Note>
    <ul className="card-list">
      <li>
        <Card as="button" onPress={() => {}}>
          <span className="ai-source">NYT Crossword</span>
          <span className="ai-theme">Double Meanings</span>
          <span className="ai-author">By Ada Composer</span>
          <span className="ai-done" title="Solved" aria-label="Solved">
            <CheckIcon />
          </span>
        </Card>
      </li>
      <Card className="account-tile" onPress={() => {}}>
        <span className="ai-source">My Tricky Mini</span>
        <span className="ai-author">Public · 12 solves</span>
        <div className="account-tile-actions">
          <button onClick={(e) => e.stopPropagation()} aria-label="Edit" title="Edit">
            <EditIcon />
          </button>
          <button onClick={(e) => e.stopPropagation()} aria-label="Delete" title="Delete">
            <DeleteIcon />
          </button>
        </div>
      </Card>
    </ul>
  </div>
);

export const Static: Story = () => (
  <div style={{ maxWidth: 620 }}>
    <Note>
      Without onPress a card is inert — no hover invert, no press-down, no
      pointer cursor — even when it carries action buttons of its own
      (profile rows, skeleton placeholders).
    </Note>
    <ul className="card-list">
      <Card className="account-tile">
        <div className="ai-row">
          <Avatar username="iris_solver" displayName="Iris" accent="pink" size={36} />
          <div className="ai-row-text">
            <span className="ai-source">Iris</span>
            <span className="ai-author">@iris_solver</span>
          </div>
        </div>
        <div className="account-tile-actions">
          <button aria-label="Follow Iris" title="Follow">
            <UserPlusIcon />
          </button>
        </div>
      </Card>
    </ul>
  </div>
);
