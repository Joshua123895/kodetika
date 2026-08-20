// The privacy policy and the terms, as one component with two bodies. They are
// written in the product's own voice and kept honest rather than lawyerly: the
// app's actual behaviour is simple enough to describe truthfully in a page.

const PRIVACY = [
  {
    h: "What this app stores",
    p: [
      "Without an account, everything lives in your own browser's storage: your stars, your saved code, your streak, and your settings. None of it leaves your device, and clearing your browser data erases it.",
      "With an account, the same things are also saved to our database so they can follow you between devices: your email address, your stars per level, code you have saved on levels, your arcade bests, and your practice streak. That is the whole list.",
    ],
  },
  {
    h: "Where your code runs",
    p: [
      "The code you write on Kodetika runs inside your own browser. Python runs in a WebAssembly interpreter on your machine, SQL runs against a database built in your machine's memory, and web levels render in a sandboxed frame on your machine. Your submissions are not executed on, or sent to, any server for grading.",
    ],
  },
  {
    h: "Classes",
    p: [
      "If you join a class with a code, your teacher can see the display name you chose, your stars, how many levels you have done, and which levels you have retried. Your teacher can never see the code you write. You can leave a class at any time from the Classes page, which removes you from that teacher's register.",
    ],
  },
  {
    h: "Who else touches the data",
    p: [
      "Accounts and the database are provided by Supabase, and the site is served by Vercel. Google sign-in, if you use it, tells us only your email address. There are no analytics trackers, no advertising, and your data is not sold or shared with anyone else.",
    ],
  },
  {
    h: "Deleting your account",
    p: [
      "Email jojo05.irwanto@gmail.com from the address you signed up with and the account and its stored progress will be deleted. Anything in your browser's own storage is yours to clear whenever you like.",
    ],
  },
];

const TERMS = [
  {
    h: "What Kodetika is",
    p: [
      "Kodetika is a free platform for learning to code in the browser. You can use it without an account; an account only adds saving your progress across devices and joining classes.",
    ],
  },
  {
    h: "Your account",
    p: [
      "Keep your password to yourself, and use a display name in classes that will not embarrass you in front of your teacher. You are responsible for what happens under your account.",
    ],
  },
  {
    h: "Fair use",
    p: [
      "Do not attempt to break the service, other people's accounts, or the database. Do not join classes you were not invited to. The join codes are short because they are typed off a projector, not because guessing them is a game.",
    ],
  },
  {
    h: "Honesty about what this is",
    p: [
      "Stars, streaks and certificates on Kodetika are a record of practice, not an accredited qualification. Present them as what they are.",
    ],
  },
  {
    h: "No warranty",
    p: [
      "The service is provided as is, free of charge, and can change or be unavailable at any time. We look after your data carefully, but you should not treat Kodetika as the only copy of code you care about.",
    ],
  },
];

function Body({ title, updated, sections }) {
  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-2xl mx-auto">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          {title}
        </h1>
        <p className="text-xs mb-8" style={{ color: "var(--text-muted)" }}>
          Last updated {updated}
        </p>

        {sections.map((s) => (
          <section key={s.h} className="mb-7">
            <h2 className="text-sm font-bold mb-2" style={{ color: "var(--text)" }}>
              {s.h}
            </h2>
            {s.p.map((para, i) => (
              <p
                key={i}
                className="text-sm mb-2 leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return <Body title="Privacy" updated="20 August 2026" sections={PRIVACY} />;
}

export function TermsPage() {
  return <Body title="Terms" updated="20 August 2026" sections={TERMS} />;
}
