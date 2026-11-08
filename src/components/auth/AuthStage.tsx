"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AmbientLines, GlobeField } from "@/components/backdrop";
import ForgotPasswordForm from "./ForgotPasswordForm";
import LoginForm from "./LoginForm";
import TermsPanel from "./TermsPanel";
import panel from "./AuthPanel.module.css";
import styles from "./AuthStage.module.css";

type View = "login" | "forgot" | "terms";

const VIEWS: View[] = ["login", "forgot", "terms"];

export default function AuthStage() {
  const [view, setView] = useState<View>("login");

  const loginRef = useRef<HTMLDivElement>(null);
  const forgotRef = useRef<HTMLDivElement>(null);
  const termsRef = useRef<HTMLDivElement>(null);
  const refs: Record<View, React.RefObject<HTMLDivElement | null>> = {
    login: loginRef,
    forgot: forgotRef,
    terms: termsRef,
  };

  // Panels are stacked on top of each other, so the card needs the active
  // one's height to grow and shrink between views instead of collapsing.
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = refs[view].current;
    if (!element) return;

    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // refs is stable across renders; only the active view matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Send focus to the new panel's heading so keyboard and screen reader
  // users follow the switch, but leave the first paint alone.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const heading = refs[view].current?.querySelector("h1");
    heading?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const content: Record<View, React.ReactNode> = {
    login: (
      <LoginForm
        onForgotPassword={() => setView("forgot")}
        onOpenTerms={() => setView("terms")}
      />
    ),
    forgot: <ForgotPasswordForm onBack={() => setView("login")} />,
    terms: <TermsPanel onBack={() => setView("login")} />,
  };

  return (
    <main className={styles.shell} data-view={view}>
      <AmbientLines className={styles.ambient} />
      <GlobeField className={styles.globe} />

      <div className={styles.stage}>
        <div className={panel.card}>
          <div
            className={panel.panels}
            style={height ? { height: `${height}px` } : undefined}
          >
            {VIEWS.map((name) => {
              const active = name === view;
              return (
                <div
                  key={name}
                  ref={refs[name]}
                  className={`${panel.panel} ${active ? panel.panelActive : ""}`}
                  // Keeps hidden panels out of the tab order and off the
                  // accessibility tree while they are faded out.
                  inert={!active}
                >
                  {content[name]}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
