import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/session";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <>
      <p className="mb-4 text-center text-sm text-muted">
        Only the email addresses listed in the app&apos;s ALLOWED_EMAILS setting can sign up.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}
