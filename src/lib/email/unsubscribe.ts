export function generateUnsubscribeToken(contactId: string, orgId: string): string {
  return Buffer.from(`${contactId}:${orgId}`).toString("base64");
}

export function generateUnsubscribeUrl(contactId: string, orgId: string): string {
  const token = generateUnsubscribeToken(contactId, orgId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${appUrl}/api/email/unsubscribe?token=${token}`;
}
