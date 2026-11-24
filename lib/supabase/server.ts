import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ANONYMOUS, isAdminUser, type Viewer } from "../access";
import { accountHasPremium } from "../premium";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseKey());
}

export function supabaseKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** Supabase client bound to the request cookies (route handlers and server components). */
export async function createSupabaseServerClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey()!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies; middleware refreshes the session instead.
        }
      },
    },
  });
}

interface SessionUser { id: string; email?: string | null; email_confirmed_at?: string | null }

/** Who the verified session belongs to and what it may open. Admins always have Premium. */
export async function viewerFor(user: SessionUser | null | undefined): Promise<Viewer> {
  if (!user?.id) return ANONYMOUS;
  const admin = isAdminUser(user);
  return { signedIn: true, admin, premium: admin || await accountHasPremium(user.id) };
}

/** The current request's viewer (route handlers and server components). */
export async function currentViewer(): Promise<Viewer & { email: string | null; userId: string | null }> {
  if (!supabaseConfigured()) return { ...ANONYMOUS, email: null, userId: null };
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return { ...(await viewerFor(data.user)), email: data.user?.email ?? null, userId: data.user?.id ?? null };
  } catch {
    return { ...ANONYMOUS, email: null, userId: null };
  }
}

/** True only for a verified session whose email is in OWNER_EMAILS. */
export async function currentUserIsAdmin(): Promise<boolean> {
  return (await currentViewer()).admin;
}

/** True for a verified session with Premium (admins included): full market data in mixed APIs. */
export async function currentUserHasPremium(): Promise<boolean> {
  return (await currentViewer()).premium;
}
