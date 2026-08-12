import { MAX_ROWS } from "./sqlCore";
import { useColors } from "../editor/colors";

// The pane under a SQL editor, standing in for the console the Python tracks
// get. It is deliberately styled like a database client's result grid rather
// than like terminal output, because that is what the student is producing: a
// table, with named columns, that they will spend the rest of their career
// reading. It follows the app's theme, matching the JavaScript track's console.
//
// Unlike the web track's live preview this does NOT follow the editor as you
// type. A half-written query is a syntax error, and a pane that spends most of
// its life showing `near ";": syntax error` teaches the student to ignore it.
// Run is the trigger, the same way it is in every real client.

export default function SqlResult({ result, running }) {
  const c = useColors();
  const wrap = "h-full overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed";

  if (running) {
    return <div className={wrap} style={{ color: c.consoleLabel }}>Running…</div>;
  }

  if (!result) {
    return <div className={wrap} style={{ color: c.consoleLabel }}>&gt; Run your query to see the result</div>;
  }

  if (result.error) {
    return (
      <div className={wrap} style={{ color: "#FF5F57", whiteSpace: "pre-wrap" }}>
        {result.error}
      </div>
    );
  }

  if (!result.grid) {
    // A script of nothing but INSERT/UPDATE/DELETE really does produce no grid.
    // Saying so beats an empty pane that looks like a failure.
    return (
      <div className={wrap} style={{ color: c.consoleLabel }}>
        Statement ran. Add a SELECT to see the table afterwards.
      </div>
    );
  }

  const { cols, rows } = result.grid;

  return (
    <div className={wrap} style={{ color: c.consoleText }}>
      <table className="border-collapse" style={{ minWidth: "100%" }}>
        <thead>
          <tr>
            {cols.map((name, i) => (
              <th
                key={i}
                className="text-left font-bold px-2 py-1 whitespace-nowrap"
                style={{ color: "#7AA2F7", borderBottom: `1px solid ${c.tabBorder}` }}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((value, ci) => (
                <td
                  key={ci}
                  className="px-2 py-0.5 whitespace-nowrap align-top"
                  style={{ borderBottom: `1px solid ${c.tabBorder}22` }}
                >
                  {value === null || value === undefined
                    ? <span style={{ color: c.consoleLabel, fontStyle: "italic" }}>NULL</span>
                    : String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="px-2 py-1.5" style={{ color: c.consoleLabel }}>(no rows)</div>
      )}
      {result.truncated && (
        <div className="px-2 py-1.5" style={{ color: "#E9B44C" }}>
          Showing the first {MAX_ROWS} rows.
        </div>
      )}
    </div>
  );
}
