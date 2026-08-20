# Running Kodetika on your own laptop

You do not need this to *use* Kodetika. The site runs entirely in your browser
at [kodetika.vercel.app](https://kodetika.vercel.app), with no install and no
sign-up. This guide is for running your own copy, so you can change it.

It takes about five minutes. You need to type a few commands, but you do not
need to understand them yet.

---

## Step 1: Install Node.js

Node.js is the program that runs the tooling behind the site.

Download the **LTS** version from [nodejs.org](https://nodejs.org) and install
it, clicking through the defaults. Then **close and reopen your terminal**, or
the next step will not find it.

> **Windows:** press the Start key, type `powershell`, and open it.
> **Mac:** press Cmd+Space, type `terminal`, and open it.

Check it worked by typing:

```bash
node -v
```

You should see a version number like `v22.20.0`.

**It must be 20.19 or newer, or 22.12 or newer.** Node 18 is too old for the
build tool and will fail with a confusing error. If your number is lower, go
back and install the LTS version.

## Step 2: Get the code

If you have Git installed:

```bash
git clone https://github.com/Joshua123895/kodetika.git
cd kodetika
```

No Git? On the GitHub page click the green **Code** button, then **Download
ZIP**, unzip it, and in your terminal type `cd ` followed by a space and then
drag the unzipped folder onto the terminal window. Press Enter.

## Step 3: Install the dependencies

```bash
npm install
```

This downloads the libraries the site is built from. It takes a minute or two
and prints a lot of text. Warnings are normal. You only do this once.

## Step 4: Run it

```bash
npm run dev
```

You will see something like:

```
  VITE v8.1.0  ready in 441 ms
  ➜  Local:   http://localhost:5173/
```

Open that address in your browser. That is Kodetika, running from your own
machine.

Leave the terminal open while you use it. Edit a file, save, and the page
updates by itself. To stop the server, click the terminal and press **Ctrl+C**.

**That is the whole setup.** Everything below is optional.

---

## Optional: accounts and syncing

Out of the box there are no accounts, and your stars are saved in your browser
only. Everything else works exactly as normal.

If you want sign-in and progress that follows you between devices, you need a
free [Supabase](https://supabase.com) project. Copy `.env.example` to a new file
called `.env`, then fill in the two values from your Supabase project settings:

```bash
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Restart `npm run dev` afterwards. Vite only reads that file at startup.

The anon key is meant to be public and is safe in the browser. The database is
protected by Row Level Security, not by hiding the key.

## Optional: running the tests

The test suite checks all 841 levels by actually running their solutions, so it
needs **Python 3** installed and on your PATH as well as Node.

```bash
npm test
```

It takes a few minutes. See the "Testing" section of `README.md` for what it
covers.

---

## When something goes wrong

**`node` or `npm` is not recognised.**
Node.js is not installed, or the terminal was already open when you installed
it. Close the terminal, open a new one, and try again.

**`npm install` fails with permission errors.**
You are probably inside a folder your user cannot write to, such as a system
directory. Move the project to somewhere like your Documents folder and retry.

**Port 5173 is already in use.**
Another copy is already running. Vite just picks the next free port and tells
you which, so read the address it printed rather than assuming 5173. To stop the
other one, find its terminal and press Ctrl+C.

**The page is blank, or a change does nothing.**
Do a hard reload: **Ctrl+Shift+R**, or **Cmd+Shift+R** on a Mac.

**Hundreds of tests fail at once, but pass when you run one file alone.**
On Windows this is almost always the wrong `python`. If Python resolves to the
Microsoft Store stub in `WindowsApps`, every launch is slow enough to blow the
test timeouts. Check with `where python` (PowerShell) or `command -v python`
(Git Bash). Put a real Python install ahead of `WindowsApps` on your PATH, or
turn off the Python app execution aliases in Windows Settings.

**A test fails complaining about line endings.**
The repository is pinned to LF endings by `.gitattributes`. If Git converted
them on checkout, run `git config core.autocrlf false`, delete your copy, and
clone again.

---

## What next

- `README.md` explains what the tracks contain and how the app is put together.
- `CLAUDE.md` is the short orientation for changing the code.
- `notes/PRD.md`, if you have it, is the long reference for how each part works
  and why.
