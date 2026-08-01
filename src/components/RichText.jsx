// Renders the block list produced by src/data/richText.js. Used for a level's
// objective, explanation and hint — three places that previously each carried
// their own copy of the same inline-segment ternary.
//
// The outer element is a <div>, not a <p>: <ul>/<ol> cannot legally nest inside
// a <p>, and a browser silently closes the paragraph early when they do, which
// breaks the surrounding layout.

function Segments({ segments }) {
  return segments.map((seg, i) => {
    if (seg.type === "code") {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: "var(--bg)", color: "var(--text)" }}
        >
          {seg.value}
        </code>
      );
    }
    if (seg.type === "bold") {
      return (
        <strong key={i} className="font-bold">
          {seg.value}
        </strong>
      );
    }
    return <span key={i}>{seg.value}</span>;
  });
}

export default function RichText({ blocks, className = "" }) {
  if (!blocks || blocks.length === 0) return null;

  // Tailwind v4's preflight strips list markers and there is no typography
  // plugin here, so padding and marker style are set explicitly.
  const listClass = "my-1 pl-5 space-y-1";

  return (
    <div className={`text-sm ${className}`} style={{ color: "var(--text)" }}>
      {blocks.map((block, i) => {
        if (block.type === "bullets") {
          return (
            <ul key={i} className={listClass} style={{ listStyleType: "disc" }}>
              {block.items.map((segments, j) => (
                <li key={j}>
                  <Segments segments={segments} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ordered") {
          return (
            <ol key={i} className={listClass} style={{ listStyleType: "decimal" }}>
              {block.items.map((segments, j) => (
                <li key={j}>
                  <Segments segments={segments} />
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === "table") {
          // Scrolls inside its own box rather than widening the column. The app
          // sets `overflow-x: hidden` on html/body, so an overflowing table
          // would otherwise be silently clipped instead of reachable.
          return (
            <div key={i} className="my-2 overflow-x-auto">
              <table className="text-xs border-collapse" style={{ minWidth: "100%" }}>
                <thead>
                  <tr>
                    {block.header.map((segments, j) => (
                      <th
                        key={j}
                        className="px-2 py-1 text-left font-bold whitespace-nowrap"
                        style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
                      >
                        <Segments segments={segments} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((cells, r) => (
                    <tr key={r}>
                      {cells.map((segments, j) => (
                        <td key={j} className="px-2 py-1 align-top" style={{ border: "1px solid var(--border)" }}>
                          <Segments segments={segments} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "codeblock") {
          return (
            <pre
              key={i}
              className="my-2 p-2.5 rounded-lg text-xs font-mono overflow-x-auto"
              style={{ background: "var(--bg)", color: "var(--text)", whiteSpace: "pre" }}
            >
              {block.value}
            </pre>
          );
        }
        return (
          <p key={i} className={i > 0 ? "mt-2" : undefined}>
            <Segments segments={block.segments} />
          </p>
        );
      })}
    </div>
  );
}
