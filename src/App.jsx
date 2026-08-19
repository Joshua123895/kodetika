import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, useParams, useLocation } from "react-router-dom";
import { warmPyodideWorker } from "./utils/pyodideWorkerClient";
import Navbar from "./components/Navbar";
import PixelParticles from "./components/PixelParticles";
import UpdateBanner from "./components/UpdateBanner";
import Toasts from "./components/Toasts";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFoundPage from "./pages/NotFoundPage";
import HomePage from "./pages/HomePage";
import TrackPage from "./pages/TrackPage";
import ProfilePage from "./pages/ProfilePage";
import ClassroomPage from "./pages/ClassroomPage";
import ChaptersPage from "./pages/ChaptersPage";
import LevelPage from "./pages/LevelPage";

// Code-split the game routes. They are optional detours, and the Arcade pulls in
// the pygame shim, so there is no reason for a student heading to a lesson to
// download any of it.
const ArcadePage = lazy(() => import("./pages/ArcadePage"));
const GuessOutputPage = lazy(() => import("./pages/GuessOutputPage"));
const BugHuntPage = lazy(() => import("./pages/BugHuntPage"));
const TypingPage = lazy(() => import("./pages/TypingPage"));

function LevelPageWrapper() {
  const { levelId } = useParams();
  return <LevelPage key={levelId} />;
}

export default function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Start downloading the Python runtime the moment the app mounts, from any
    // route. Browsing Home -> Tracks -> Chapters then usually hides the whole
    // cost, and landing directly on a level URL at least overlaps it with
    // reading the objective instead of paying it on the first Run.
    // Fire-and-forget: a failure here is retried by the actual run.
    warmPyodideWorker().catch(() => {});
  }, []);

  return (
    <>
      <style>{`
        @keyframes pixelFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-8px) rotate(3deg); }
          66% { transform: translateY(-4px) rotate(-2deg); }
        }
        .pixel-float {
          animation: pixelFloat 3s ease-in-out infinite;
        }
        @keyframes starPop {
          0% { transform: scale(0) rotate(-20deg); opacity: 0; }
          60% { transform: scale(1.3) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .star-pop {
          animation: starPop 0.4s ease-out both;
        }
        .star-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .star-base {
          position: relative;
          z-index: 1;
          color: #D1D5DB;
          transition: color 0.2s;
        }
        .star-base.star-filled {
          color: #E9B44C;
          animation: starScaleIn 0.4s ease-out both;
        }
        @keyframes starScaleIn {
          0% { transform: scale(0) rotate(-20deg); opacity: 0; }
          60% { transform: scale(1.3) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        textarea { tab-size: 2; }
      `}</style>

      <div
        className="relative"
        style={{ background: "var(--bg)", minHeight: "100dvh" }}
      >
        <PixelParticles />
        <Navbar />
        {/* Everything that announces itself shares one column at top centre,
            so two notices can never appear in different corners at once. */}
        <div className="notice-dock">
          <Toasts />
          <UpdateBanner />
        </div>
        {/* Keyed on the path so navigating away from a crashed screen clears the
            error — a boundary that has caught once stays caught otherwise, and
            every later route would render the fallback instead. */}
        <ErrorBoundary key={pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tracks" element={<TrackPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/classes" element={<ClassroomPage />} />
          <Route path="/tracks/:trackName" element={<ChaptersPage />} />
          <Route path="/tracks/:trackName/:chapterId/:levelId" element={<LevelPageWrapper />} />
          <Route
            path="/arcade"
            element={
              <Suspense fallback={null}>
                <ArcadePage />
              </Suspense>
            }
          />
          <Route
            path="/arcade/guess-output"
            element={
              <Suspense fallback={null}>
                <GuessOutputPage />
              </Suspense>
            }
          />
          <Route
            path="/arcade/bug-hunt"
            element={
              <Suspense fallback={null}>
                <BugHuntPage />
              </Suspense>
            }
          />
          <Route
            path="/arcade/typing"
            element={
              <Suspense fallback={null}>
                <TypingPage />
              </Suspense>
            }
          />
          {/* vercel.json rewrites every path to index.html, so a mistyped URL
              lands here rather than on the CDN's own 404. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </ErrorBoundary>
      </div>
    </>
  );
}
