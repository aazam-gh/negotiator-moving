"use client";

import { useEffect, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

export function AuthPanel() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const account = useQuery(api.accounts.me, {});
  const ensureAccount = useMutation(api.accounts.ensureAccount);
  const billing = useQuery(api.billing.config, {});
  const createCheckout = useAction(api.billing.createSubscriptionCheckout);
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const provisioningAttempted = useRef(false);

  const registered = account?.registered === true;

  useEffect(() => {
    if (!registered || account.workspaceId || provisioningAttempted.current) return;
    provisioningAttempted.current = true;
    void ensureAccount().catch((error) => {
      provisioningAttempted.current = false;
      setNotice(error instanceof Error ? error.message : "Account setup failed.");
    });
  }, [account, ensureAccount, registered]);

  if (isLoading || account === undefined) return null;
  if (registered && !open)
    return (
      <button className="account-button" onClick={() => setOpen(true)}>
        Account
      </button>
    );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    try {
      window.localStorage.setItem("negotiator.accountMode", "true");
      if (isAuthenticated && !registered) await signOut();
      await signIn("password", { email, password, flow });
      setOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Authentication failed.");
    }
  }

  return (
    <div className="account-panel">
      {!registered && <button onClick={() => setOpen(!open)}>Sign in</button>}
      {registered && <button onClick={() => setOpen(!open)}>Account</button>}
      {open && (
        <div className="account-popover">
          {registered ? (
            <div className="account-menu-actions">
              <strong>Your private inbox</strong>
              <small>
                {account.mailbox?.status === "ready"
                  ? account.mailbox.address
                  : account.mailbox?.status === "failed"
                    ? "Inbox setup needs a retry"
                    : "Provisioning securely…"}
              </small>
              {account.mailbox?.status === "failed" && (
                <button onClick={() => void ensureAccount()}>Retry inbox setup</button>
              )}
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
                  provisioningAttempted.current = false;
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
