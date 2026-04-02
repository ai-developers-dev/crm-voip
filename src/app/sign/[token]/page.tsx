import { SigningClient } from "./signing-client";

export const metadata = {
  title: "Sign Document",
  description: "Review and sign your document",
};

export default async function SigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SigningClient token={token} />;
}
