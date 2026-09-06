"use client";

import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { useAction, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

export function AuthPanel() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const billing = useQuery(api.billing.config, {});
  const createCheckout = useAction(api.billing.createSubscriptionCheckout);
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");

  if (isLoading) return null;
  if (isAuthenticated && !open)
    return (
      <button className="account-button" onClick={() => setOpen(true)}>
        Account
      </button>
    );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    try {
      await signIn("password", { email, password, flow });
      setOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Authentication failed.");
    }
  }

  return (
    <div className="account-panel">
      {!isAuthenticated && <button onClick={() => setOpen(!open)}>Sign in</button>}
      {isAuthenticated && <button onClick={() => setOpen(!open)}>Account</button>}
      {open && (
        <div className="account-popover">
          {isAuthenticated ? (
            <div className="account-menu-actions">
              {billing?.configured && (
                <button
                  onClick={async () => {
                    const checkout = await createCheckout({});
                    if (checkout.url) window.location.assign(checkout.url);
                  }}
                >
                  Upgrade to Pro
                </button>
              )}
              <button
                onClick={() => {
                  window.localStorage.setItem("negotiator.accountMode", "true");
                  void signOut();
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <strong>{flow === "signUp" ? "Create your account" : "Sign in"}</strong>
              <input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                type="password"
                autoComplete={flow === "signUp" ? "new-password" : "current-password"}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
              <button type="submit">
                {flow === "signUp" ? "Create account" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => setFlow(flow === "signUp" ? "signIn" : "signUp")}
              >
                {flow === "signUp" ? "I already have an account" : "Create an account"}
              </button>
              {notice && <small>{notice}</small>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
