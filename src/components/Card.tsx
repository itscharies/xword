import type { KeyboardEvent, ReactNode } from "react";

/** The app's tile: a bordered surface casting the hard offset shadow, used
 *  wherever puzzles or profiles are listed. The hover-invert and press-down
 *  cues are tied to onPress — a card that doesn't go anywhere doesn't light
 *  up.
 *
 *  A pressable card is a real <button> (as="button"). Cards that layer their
 *  own action buttons on top (edit/delete/follow) must stay an <li>: a
 *  button can't nest buttons, so the li carries role="button" and the
 *  Enter/Space handling that implies. as="div" is for a card riding inside
 *  another list item (the archive's swipe tile), where a nested <li> would be
 *  invalid.
 */
export function Card({
  as = "li",
  onPress,
  className,
  children,
}: {
  as?: "li" | "button" | "div";
  onPress?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const cls = ["card", onPress ? "interactive" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  if (as === "button")
    return (
      <button className={cls} onClick={onPress}>
        {children}
      </button>
    );
  const Tag = as;
  if (!onPress) return <Tag className={cls}>{children}</Tag>;
  return (
    <Tag
      className={cls}
      role="button"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(e: KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPress();
        }
      }}
    >
      {children}
    </Tag>
  );
}
