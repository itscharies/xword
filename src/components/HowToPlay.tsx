/** Body of the "How to play" info modal — a concise guide to solving and the
 * app's features, including the physical-keyboard shortcuts. */
export function HowToPlay() {
  return (
    <div className="howto">
      <section>
        <h3>How to play</h3>
        <p>
          Tap a square and type to fill in answers — the highlighted clue shows
          above the grid. Solve every square correctly to finish.
        </p>
      </section>

      <section>
        <h3>Getting around</h3>
        <ul>
          <li>Tap a square, or use the arrow keys, to move.</li>
          <li>
            Tap the square again — or tap the clue bar — to switch between Across
            and Down.
          </li>
          <li>
            Tap any clue to jump to it; <b>Tab</b> / <b>Shift+Tab</b> go to the
            next / previous clue.
          </li>
        </ul>
      </section>

      <section>
        <h3>Check &amp; Reveal</h3>
        <p>
          Stuck? <b>Check</b> flags wrong letters and <b>Reveal</b> fills in the
          answer. Each works on the current <b>cell</b>, the current <b>word</b>,
          or the whole <b>puzzle</b>.
        </p>
      </section>

      <section>
        <h3>Good to know</h3>
        <ul>
          <li>The timer pauses with ❚❚ and resumes when you touch the grid.</li>
          <li>
            A few squares are rebus squares (more than one letter) — turn on the
            rebus key to type several letters into one square.
          </li>
          <li>
            In <b>Settings</b> (⚙) choose light/dark, an accent colour, and
            whether finishing a word jumps to the next clue.
          </li>
          <li>Filter the archive by paper or type, and rate puzzles you finish.</li>
        </ul>
      </section>

      <section>
        <h3>Keyboard shortcuts</h3>
        <p className="howto-dim">On a physical keyboard, hold Ctrl:</p>
        <table className="shortcuts">
          <tbody>
            <tr><td>Ctrl + X</td><td>Check cell</td></tr>
            <tr><td>Ctrl + C</td><td>Check word</td></tr>
            <tr><td>Ctrl + E</td><td>Check puzzle</td></tr>
            <tr><td>Ctrl + B</td><td>Reveal cell</td></tr>
            <tr><td>Ctrl + R</td><td>Reveal word</td></tr>
            <tr><td>Ctrl + G</td><td>Reveal puzzle</td></tr>
          </tbody>
        </table>
        <p className="howto-dim">
          Arrows move · Space/Enter switch direction · Backspace deletes
        </p>
      </section>
    </div>
  );
}
