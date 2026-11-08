"use client";

import { useId, type FormEvent } from "react";
import styles from "./AuthPanel.module.css";

export default function ForgotPasswordForm({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  /** The one integration point. No reset is requested without it. */
  onSubmit?: (data: FormData) => void;
}) {
  const id = useId();
  const emailId = `${id}-email`;

  // Presentation only — no reset request is made here. Field checks are
  // left to the browser via required/type.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(new FormData(event.currentTarget));
  };

  return (
    <>
      <h1 className={styles.title} tabIndex={-1}>
        Forgot password
      </h1>
      <p className={styles.subtitle}>
        Enter the email on your account and we&rsquo;ll send a link to reset
        your password.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={emailId}>
            Email
          </label>
          <div className={styles.inputWrap}>
            <input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="sampleemail@gmail.com"
              className={styles.input}
              required
            />
          </div>
        </div>

        <button type="submit" className={styles.submit}>
          Send reset link
        </button>
      </form>

      <div className={styles.backRow}>
        <button type="button" className={styles.link} onClick={onBack}>
          Back to log in
        </button>
      </div>
    </>
  );
}
