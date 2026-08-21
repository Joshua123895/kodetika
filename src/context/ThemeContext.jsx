import { createContext, useContext, useState, useEffect } from "react";
import { THEMES, DEFAULT_DARK, DEFAULT_LIGHT, isDarkTheme, themeById } from "../lib/themes";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // The stored value is a theme id. The old builds stored "dark" or "light",
  // which happen to be valid ids, so nobody's saved choice is lost. An id from
  // a theme that no longer exists falls back to the OS preference.
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved && themeById(saved)) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? DEFAULT_DARK : DEFAULT_LIGHT;
  });

  const dark = isDarkTheme(theme);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    // Two hooks into the DOM: the data-theme attribute selects the palette in
    // index.css, and the .dark class carries everything keyed to the dark side
    // of the line (::selection, and via useTheme().dark the editor chrome and
    // web preview). index.html's no-flash script sets both before first paint.
    //
    // The light/dark cross-fade is a plain always-on CSS transition (see
    // index.css). Toggling the transition on and off around the swap was tried
    // and is worse: removing it mid-fade cancels in-flight transitions and can
    // leave elements painted in the previous theme's colours.
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", dark);
  }, [theme, dark]);

  return (
    <ThemeContext.Provider value={{ theme, themes: THEMES, setTheme, dark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
