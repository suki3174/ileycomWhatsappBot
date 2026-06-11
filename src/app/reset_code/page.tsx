import ResetPasswordForm from "./reset-password-form";

type ResetPasswordPageProps = {
  searchParams?: Promise<{ token?: string | string[] }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = (await searchParams) ?? {};
  const tokenRaw = params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

  return <ResetPasswordForm token={token ?? null} />;
}