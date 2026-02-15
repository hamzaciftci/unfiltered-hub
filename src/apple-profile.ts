/**
 * UnfilteredHub — Apple .mobileconfig Profile Generator
 * Generates DNS-over-HTTPS configuration profiles for iOS/iPadOS/macOS
 */

function generateUUID(seed: string): string {
  // Deterministic UUID v4-like from domain string
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const h2 = Math.abs(hash * 31).toString(16).padStart(8, '0');
  const h3 = Math.abs(hash * 37).toString(16).padStart(8, '0');
  const h4 = Math.abs(hash * 41).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${h2.slice(0, 4)}-4${h3.slice(1, 4)}-a${h4.slice(1, 4)}-${hex}${h2.slice(0, 4)}`.toUpperCase();
}

export function generateMobileConfig(domain: string): string {
  const dohURL = `https://${domain}/dns-query`;
  const payloadUUID = generateUUID(domain + '-payload');
  const profileUUID = generateUUID(domain + '-profile');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>DNSSettings</key>
            <dict>
                <key>DNSProtocol</key>
                <string>HTTPS</string>
                <key>ServerURL</key>
                <string>${escapeXml(dohURL)}</string>
            </dict>
            <key>OnDemandRules</key>
            <array>
                <dict>
                    <key>Action</key>
                    <string>Connect</string>
                </dict>
            </array>
            <key>PayloadDisplayName</key>
            <string>UnfilteredHub DoH</string>
            <key>PayloadIdentifier</key>
            <string>com.unfilteredhub.doh.${escapeXml(domain)}</string>
            <key>PayloadType</key>
            <string>com.apple.dnsSettings.managed</string>
            <key>PayloadUUID</key>
            <string>${payloadUUID}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>ProhibitDisablement</key>
            <false/>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>UnfilteredHub DNS-over-HTTPS profili. Tüm DNS sorgularinizi sifreler.</string>
    <key>PayloadDisplayName</key>
    <string>UnfilteredHub DoH</string>
    <key>PayloadIdentifier</key>
    <string>com.unfilteredhub.profile.${escapeXml(domain)}</string>
    <key>PayloadOrganization</key>
    <string>UnfilteredHub</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUUID}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>ConsentText</key>
    <dict>
        <key>default</key>
        <string>Bu profil DNS sorgularinizi HTTPS uzerinden sifreleyerek gizliliginizi korur. UnfilteredHub</string>
    </dict>
</dict>
</plist>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
