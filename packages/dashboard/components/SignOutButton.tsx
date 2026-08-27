"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button className="btn btn-outline" onClick={() => signOut({ callbackUrl: "/login" })}>
      Sign out
    </button>
  );
}
