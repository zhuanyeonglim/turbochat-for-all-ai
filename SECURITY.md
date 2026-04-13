# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x.x   | ✅ Active  |
| 1.x.x   | ❌ No      |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately via GitHub's built-in security advisory:
1. Go to the **Security** tab of this repository
2. Click **"Report a vulnerability"**
3. Fill in the details

We will acknowledge within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

**In scope:**
- Code execution vulnerabilities in content scripts
- Privilege escalation via extension messaging
- Data exfiltration bugs (content being sent off-device)
- CSP bypass exploitable by malicious pages

**Out of scope:**
- Bugs on third-party platforms (ChatGPT, Claude, Gemini)
- Performance issues or feature requests

## Our Commitment

- We never collect user data
- All processing is local — nothing leaves your browser
- Security researchers will be credited in our changelog (unless anonymity is preferred)
