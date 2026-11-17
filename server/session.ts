import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";

export async function currentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ? { id: session.user.id, name: session.user.name ?? "", family_id: session.user.family_id } : null;
}

