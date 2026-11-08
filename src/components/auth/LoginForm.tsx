"use client";

import { useId, useState, type FormEvent } from "react";
import styles from "./AuthPanel.module.css";

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {!open && <path d="M4 20 20 4" />}
    </svg>
  );
}

export default function LoginForm({
  onForgotPassword,
  onOpenTerms,
  onSubmit,
}: {
  onForgotPassword: () => void;
  onOpenTerms: () => void;
  /** The one integration point. Nothing is signed in without it. */
  onSubmit?: (data: FormData) => void;
}) {
  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const keepId = `${id}-keep`;

  const [showPassword, setShowPassword] = useState(false);

  // This page is presentation only — there is no auth behind it. Field
  // checks are left to the browser via required/type/minlength.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(new FormData(event.currentTarget));
  };

  return (
    <>
      <h1 className={styles.title} tabIndex={-1}>
        Log in
      </h1>
      <p className={styles.subtitle}>Please login to continue to your account.</p>

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

        <div className={styles.field}>
          <label className={styles.label} htmlFor={passwordId}>
            Password
          </label>
          <div className={styles.inputWrap}>
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              className={`${styles.input} ${styles.hasToggle}`}
              required
              minLength={8}
            />
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              aria-controls={passwordId}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>

        <div className={styles.optionsRow}>
          <div className={styles.checkboxRow}>
            <input
              id={keepId}
              name="keepLoggedIn"
              type="checkbox"
              className={styles.checkbox}
              defaultChecked
            />
            <label className={styles.checkboxLabel} htmlFor={keepId}>
              Keep me logged in
            </label>
          </div>

          <button
            type="button"
            className={styles.link}
            onClick={onForgotPassword}
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" className={styles.submit}>
          Log in
        </button>
      </form>

      <p className={styles.note}>
        By logging in you agree to our{" "}
        <button type="button" className={styles.link} onClick={onOpenTerms}>
          Terms and Agreements
        </button>
        .
      </p>
    </>
  );
}
