# Security Checklist Reference

## Authentication & Authorization
- [ ] Passwords hashed with bcrypt/argon2 (cost ≥ 10)
- [ ] JWT tokens have appropriate expiry (access: 15min, refresh: 7d)
- [ ] Refresh token rotation implemented
- [ ] Session management secure (HttpOnly, Secure cookies)
- [ ] Role-based access control (if multi-user)
- [ ] Account lockout after failed attempts

## Input Validation
- [ ] All user inputs validated (use Zod/Yup)
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (output encoding, CSP headers)
- [ ] CSRF tokens on state-changing requests
- [ ] File upload validation (type, size, content)
- [ ] Path traversal prevented

## API Security
- [ ] Rate limiting configured (per user/IP)
- [ ] CORS properly configured (specific origins)
- [ ] Security headers set (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
- [ ] API keys not exposed in client code
- [ ] Sensitive data not logged
- [ ] Error messages don't leak internals

## Data Protection
- [ ] PII encrypted at rest
- [ ] HTTPS enforced (HSTS)
- [ ] Secure cookies (HttpOnly, Secure, SameSite=Strict)
- [ ] No sensitive data in URL parameters
- [ ] Sensitive data masked in logs

## Dependencies
- [ ] No known vulnerabilities (`npm audit`)
- [ ] Dependencies up to date
- [ ] Lock file committed

## Code Quality
- [ ] No hardcoded secrets (use env vars)
- [ ] Environment variables for all config
- [ ] TypeScript strict mode enabled
