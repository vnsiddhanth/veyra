# Security policy

Veyra processes media entirely in the browser, and its security model depends on that staying true. Please report anything that could
send user data off the device, run untrusted code (for example through crafted media, subtitle or project files), or bypass the
Content-Security-Policy.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on <https://github.com/vnsiddhanth/veyra>.

Include the affected version or commit, the browser, steps to reproduce, and the impact you expect. You will get an acknowledgement as soon
as possible, and a fix or mitigation plan once the report is confirmed.

## Supported versions

Security fixes go into the latest release on the `main` branch.

## Scope notes

- Untrusted inputs are media files, subtitle files, `.veyraproj` project files and `.cube` LUT files. Each is parsed defensively
  (see SECURITY_AND_PRIVACY.md).
- The app makes no network requests with user data. A change that adds one is treated as a security issue.
