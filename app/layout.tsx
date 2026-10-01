import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faint — Learned Geometric Search",
  description: "A research lab for learned compute allocation in geometric image abstraction.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a className="brand" href="/" aria-label="Faint home">
            <span className="brand-mark">f</span>
            <span>faint</span>
          </a>
          <nav>
            <a href="#lab">Lab</a>
            <a href="https://github.com/8dazo/faint/tree/main/research" target="_blank" rel="noreferrer">Research</a>
            <a className="nav-github" href="https://github.com/8dazo/faint" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
        </header>
        <div id="lab">{children}</div>
      </body>
    </html>
  );
}
