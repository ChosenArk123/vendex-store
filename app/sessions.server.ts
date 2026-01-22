import { createCookieSessionStorage, type Session } from "@remix-run/node";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__mynodeshop_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export const getSession = (request: Request) =>
  sessionStorage.getSession(request.headers.get("Cookie"));

export const commitSession = (session: Session) =>
  sessionStorage.commitSession(session);

export const destroySession = (session: Session) =>
  sessionStorage.destroySession(session);
