import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css"; // legacy app styles
import "./styles/ds.css"; // design system (loads tokens + tailwind)
import App from "./App";
import DesignTokens from "./design-system/DesignTokens";
import Components from "./design-system/Components";
import Reader from "./design-system/surfaces/Reader";
import KnowledgeGraph from "./design-system/surfaces/KnowledgeGraph";
import Dashboard from "./design-system/surfaces/Dashboard";
import Landing from "./design-system/surfaces/Landing";
import { CommandPalette, useCommandPalette } from "./design-system/CommandPalette";

function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  const cmdk = useCommandPalette();

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  // Strip query portion (e.g. #reader?paper=p1) for matching
  const route = hash.split("?")[0];

  const surface = (() => {
    switch (route) {
      case "#tokens":     return <DesignTokens />;
      case "#components": return <Components />;
      case "#reader":     return <Reader />;
      case "#graph":      return <KnowledgeGraph />;
      case "#dashboard":  return <Dashboard />;
      case "#landing":    return <Landing />;
      default:            return <App />;
    }
  })();

  return (
    <>
      {surface}
      <CommandPalette open={cmdk.open} onOpenChange={cmdk.setOpen} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
