import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "./prisma";

/**
 * The Email (magic-link) provider requires an adapter to persist users and
 * verification tokens, but the session itself is a JWT (not a database
 * session) so middleware.ts can check it at the edge without a DB round
 * trip on every request.
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM ?? "CrawlPay <onboarding@resend.dev>",
      sendVerificationRequest: async ({ identifier, url }) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          throw new Error("RESEND_API_KEY is not set");
        }

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM ?? "CrawlPay <onboarding@resend.dev>",
            to: identifier,
            subject: "Sign in to CrawlPay",
            html: `<p>Click below to sign in to CrawlPay.</p><p><a href="${url}">Sign in</a></p><p>If you didn't request this, you can ignore this email.</p>`,
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`Resend request failed (${response.status}): ${body}`);
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
