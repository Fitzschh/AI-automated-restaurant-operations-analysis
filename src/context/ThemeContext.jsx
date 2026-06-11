/**
 * ThemeContext — Global theme management
 * 
 * Provides light/dark theme toggle that persists to localStorage.
 * Default theme is "light" as requested.
 * Sets data-theme attribute on <html> which activates CSS variable overrides.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

const THEME_KEY = 'e-menu-theme';

export function ThemeProvider({ children }) {
  // Default to light theme
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  // Apply theme to <html> element whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const setThemeMode = useCallback((mode) => {
    if (mode === 'light' || mode === 'dark') {
      setTheme(mode);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
