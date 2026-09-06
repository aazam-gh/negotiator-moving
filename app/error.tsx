"use client";

import { useEffect } from "react";

export default function ChefIsCooking({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Auto-retry every 1.5s — Chef is almost certainly finishing the
  // component reference that just broke. If it's a real bug that
  // persists, the user can ask Chef to fix it in the bubble.
  useEffect(() => {
    console.error(error);
    const t = setInterval(reset, 1500);
    return () => clearInterval(t);
  }, [error, reset]);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 12,
        padding: 40,
        textAlign: "center",
        fontFamily: "inherit",
      }}
    >
      {/* The fallback must not depend on Next image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://chef.convex.dev/chef.svg"
        alt=""
        width={72}
        height={42}
      />
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
        Chef is still cooking…
      </h2>
      <p
        style={{ color: "#6b7280", maxWidth: 420, lineHeight: 1.5, margin: 0 }}
      >
        A piece of the page is mid-update. The page will refresh on its own in a
        moment. If the same error keeps showing for more than ~10 seconds, ask
        Chef to fix it in the bubble (lower right).
      </p>
    </main>
  );
}
