# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x.x   | ✅ Yes    |
| 1.x.x   | ❌ No     |

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public GitHub issue.**

Instead, report it privately:
1. Go to the **Security** tab of this repository
2. Click **"Report a vulnerability"**
3. Fill in the details

We will acknowledge your report within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

The following are in scope:
- Code execution vulnerabilities in content scripts
- Privilege escalation via extension messaging
- Data exfiltration bugs (content being sent off-device)
- CSP bypass that could be exploited by malicious pages

The following are out of scope:
- Bugs on third-party platforms (ChatGPT, Claude, Gemini)
- Performance issues
- Feature requests

## Our Commitment

- We never collect user data
- All processing is local — nothing leaves your browser
- We will credit security researchers in our changelog (unless you prefer anonymity)
