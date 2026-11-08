"use client";

import styles from "./AuthPanel.module.css";

/** The terms shown under the login form. Edit the copy here. */
const TERMS: Array<{ title: string; detail: string }> = [
  {
    title: "All information is confidential",
    detail:
      "Everything you see inside the system stays inside the system, during and after the program.",
  },
  {
    title: "No screenshots without approval",
    detail:
      "Capturing any screen requires the project head's approval before you take it.",
  },
  {
    title: "No outside discussion",
    detail:
      "The system is not to be discussed outside the program or the event it belongs to.",
  },
  {
    title: "Activity is logged and monitored",
    detail:
      "Every action you take is recorded and reviewed, including views, edits and exports.",
  },
  {
    title: "No unapproved deletion or casual changes",
    detail:
      "Deleting records without approval, or editing them for amusement, will be acted on.",
  },
  {
    title: "Personal information stays private",
    detail:
      "Contacts and other personal details must never be shared or published outside the system.",
  },
];

export default function TermsPanel({ onBack }: { onBack: () => void }) {
  return (
    <>
      <h1 className={styles.title} tabIndex={-1}>
        Terms and Agreements
      </h1>
      <p className={styles.subtitle}>
        Once you log in, you agree to the following.
      </p>

      <ol className={styles.terms}>
        {TERMS.map((term) => (
          <li key={term.title}>
            <strong>{term.title}</strong>
            {term.detail}
          </li>
        ))}
      </ol>

      <div className={styles.backRow}>
        <button type="button" className={styles.link} onClick={onBack}>
          Back to log in
        </button>
      </div>
    </>
  );
}
