import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isOwnerUser } from "../access";

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

/** True only for a verified session whose email is in OWNER_EMAILS. */
export async function currentUserIsOwner(): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return isOwnerUser(data.user);
  } catch {
    return false;
  }
}
