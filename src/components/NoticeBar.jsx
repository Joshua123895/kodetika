import { useEffect, useState } from "react";

/**
 * The little bar inside a practice notice, animating from where you were to
 * where you are rather than simply rendering the new value. Seeing it move is
 * the entire reason to show this on a completion: the number was already going
 * to be on the home page.
 *
 * Deliberately not ProgressBar, which is the chunky labelled bar the track and
 * chapter cards use and takes a percentage. This one takes both ends.
 */
export default function NoticeBar({ from, to, max, accent }) {
  const [width, setWidth] = useState(() => (max > 0 ? Math.min(from / max, 1) * 100 : 0));

  useEffect(() => {
    // Painted once at the old value, then flipped on the next frame so the
    // browser has something to transition from. Setting it during render would
    // land both values in the same paint and the bar would jump.
    const id = requestAnimationFrame(() => {
      setWidth(max > 0 ? Math.min(to / max, 1) * 100 : 0);
    });
    return () => cancelAnimationFrame(id);
  }, [to, max]);

  return (
    <div className="h-1.5 rounded-full mt-2" style={{ background: `${accent}25` }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${width}%`, background: accent, transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </div>
  );
}
