/**
 * Generate the DNS TXT record value for a VVS-1 agent.
 * Place this as a TXT record on _venmail.{domain}
 */
export function generateDnsRecord(
  agentName: string,
  publicKeyBase64url: string,
  keyVersion: number = 1
): string {
  return `v=VVS1; agent=${agentName}; pubkey=${publicKeyBase64url}; kv=${keyVersion}; status=active`;
}
