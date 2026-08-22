import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Star } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { useAuth } from "../context/AuthContext";
import { displayNameOf } from "../lib/profile";
import { useProgress } from "../hooks/useProgress";
import { trackSummaries } from "../lib/journey";
import { certificateDate } from "../lib/practice";
import PixelButton from "../components/PixelButton";

const AMBER = "#E9B44C";
const GREEN = "#6AAE6F";

/**
 * The certificate for one finished track.
 *
 * A celebration, not a credential: the terms page says so and this page's own
 * footer says so. It renders only when the track is genuinely complete, so a
 * typed URL for an unfinished track gets sent back to the journey instead of a
 * blank award. Printing goes through the browser (Ctrl+P works too); print CSS
 * in index.css strips the app chrome so what comes out is only the card.
 */
export default function CertificatePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { progress } = useProgress();

  const summary = useMemo(() => {
    const track = TRACKS.find((t) => t.slug === slug);
    if (!track) return null;
    return trackSummaries([track], progress)[0];
  }, [slug, progress]);

  const awarded = useMemo(() => {
    const iso = certificateDate(slug);
    return iso
      ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
      : null;
  }, [slug]);

  const name = displayNameOf(user) || "A Kodetika student";

  if (!summary || !summary.complete) {
    return (
      <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
        <div className="max-w-md mx-auto text-center">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {summary
              ? `Finish every level of ${summary.name} and the certificate appears here.`
              : "No such track."}
          </p>
          <div className="mt-5">
            <PixelButton onClick={() => navigate("/profile")} size="md">
              Your journey
            </PixelButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 print-hide">
          <button
            onClick={() => navigate("/profile")}
            className="text-xs flex items-center gap-1.5 hover:gap-2.5 transition-all"
            style={{ color: GREEN }}
          >
            <ArrowLeft size={13} strokeWidth={2.5} /> Your journey
          </button>
          <PixelButton onClick={() => window.print()} size="md">
            <Printer size={14} className="inline mr-1.5" />
            Print
          </PixelButton>
        </div>

        <div
          id="certificate"
          className="rounded-2xl px-8 py-12 text-center"
          style={{ background: "var(--bg-card)", border: `3px solid ${AMBER}` }}
        >
          <div
            className="text-xs font-bold tracking-[0.3em] mb-8"
            style={{ color: GREEN, fontFamily: "'Courier New', monospace" }}
          >
            KODETIKA
          </div>

          <div className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
            Certificate of Completion
          </div>

          <div
            className="text-3xl font-bold mb-6"
            style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
          >
            {name}
          </div>

          <div className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
            completed every level of
          </div>

          <div
            className="text-xl font-bold mb-6"
            style={{ color: AMBER, fontFamily: "'Courier New', monospace" }}
          >
            {summary.name}
          </div>

          <div
            className="inline-flex items-center gap-4 text-sm mb-8"
            style={{ color: "var(--text-secondary)" }}
          >
            <span>{summary.total} levels</span>
            <span className="inline-flex items-center gap-1" style={{ color: AMBER }}>
              <Star size={14} strokeWidth={2.5} fill="currentColor" />
              {summary.stars} of {summary.maxStars}
            </span>
            <span>{summary.mastery}% mastered</span>
          </div>

          {awarded && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Awarded {awarded}
            </div>
          )}

          <div className="text-[10px] mt-6" style={{ color: "var(--text-muted)" }}>
            A record of practice at kodetika.vercel.app, not an accredited qualification.
          </div>
        </div>
      </div>
    </div>
  );
}
