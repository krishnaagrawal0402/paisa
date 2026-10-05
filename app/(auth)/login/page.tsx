import { LoginMark } from "@/components/brand/login-mark";
import { SiteFooter } from "@/components/shell/site-footer";
import { appConfig } from "@/config/app";
import { getPublicEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  restricted: "This is a private instance. Ask its owner to add your email.",
  link: "That sign-in link is invalid or has expired. Request a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const errorKey = typeof error === "string" ? error : undefined;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LoginMark />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">{appConfig.name}</h1>
          <p className="text-muted mt-2">{appConfig.tagline}</p>
        </div>
        <div className="glass p-6">
          <LoginForm googleEnabled={getPublicEnv().googleAuth} initialError={errorKey && ERRORS[errorKey]} />
        </div>
        <SiteFooter className="mt-10 [&>div]:flex-col [&>div]:justify-center! [&>div]:gap-y-3" />
      </div>
    </main>
  );
}
