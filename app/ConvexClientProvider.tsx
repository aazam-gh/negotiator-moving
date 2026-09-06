"use client";

import { ReactNode, useEffect, useRef } from "react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";

const convex = new ConvexReactClient(
  // Fall back to a placeholder absolute URL so `next build` static prerender
  // (e.g. /_not-found) doesn't throw "Provided address was not an absolute
  // URL" when NEXT_PUBLIC_CONVEX_URL is unset at build time. The real URL is
  // present at runtime in the browser.
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud",
);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <AnonymousSession />
      {children}
    </ConvexAuthProvider>
  );
}

function AnonymousSession() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const attempted = useRef(false);
  useEffect(() => {
    const accountMode =
      typeof window !== "undefined" &&
      window.localStorage.getItem("negotiator.accountMode") === "true";
    if (!isLoading && !isAuthenticated && !accountMode && !attempted.current) {
      attempted.current = true;
      void signIn("anonymous");
    }
  }, [isAuthenticated, isLoading, signIn]);
  return null;
}
