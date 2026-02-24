# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-01-30

### Added
- Initial release of @venmail/vsm SDK
- Express middleware for Venmail organization integration webhooks
- HMAC signature verification utilities
- Shared secret header validation
- Payload type detection and normalization
- Comprehensive TypeScript type definitions
- Type guards for webhook payload validation
- Delivery timeline normalization helpers
- Full ESM and CommonJS compatibility
- Comprehensive test suite
- Complete API documentation

### Features
- **Express Integration**: `venmailIntegrationWebhook()` middleware with automatic signature validation
- **Security**: `verifyVenmailSignature()` and `verifySharedSecretHeader()` utilities
- **Type Safety**: Full TypeScript support with discriminated unions and type guards
- **Compatibility**: Dual ESM/CommonJS output for maximum compatibility
- **Documentation**: Comprehensive README and endpoint reference documentation

### Supported Events
- EmployeeLogin
- MailReceived
- AppFileCreated
- MailSent
- FollowUpSent
- MailOpened
- MailRead
- ContactAdded
- CampaignCreated
- CampaignSent
- CampaignLinkOpened
- CampaignLinkClicked
- ProspectDiscovered
- SubscriptionRenewed
- SubscriptionExpired

### Webhook Types
- Integration events (organization webhooks)
- Mail ingestion payloads
- Delivery status updates
- Bounce notifications
- Form events
