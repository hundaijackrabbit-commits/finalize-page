export const DEFAULT_PRIVACY_SETTINGS = {
  aiProcessingEnabled: true,
  allowBusinessAi: true,
  allowConfidentialAi: false,
  allowRestrictedAi: false,
  requireRedactionForAi: true,
  sourceRetentionDays: 30,
  derivedRetentionDays: 30,
  evidenceRetentionDays: 365,
  guestLinkTtlDays: 7,
  autoRevokeGuestsOnFinalize: true,
  autoDestroyCredentialsOnFinalize: true,
  dataRegion: 'north-america',
  trainingUse: 'NEVER',
};

export function mapPrivacySettings(row = {}) {
  return {
    aiProcessingEnabled: row.ai_processing_enabled ?? DEFAULT_PRIVACY_SETTINGS.aiProcessingEnabled,
    allowBusinessAi: row.allow_business_ai ?? DEFAULT_PRIVACY_SETTINGS.allowBusinessAi,
    allowConfidentialAi: row.allow_confidential_ai ?? DEFAULT_PRIVACY_SETTINGS.allowConfidentialAi,
    allowRestrictedAi: row.allow_restricted_ai ?? DEFAULT_PRIVACY_SETTINGS.allowRestrictedAi,
    requireRedactionForAi: row.require_redaction_for_ai ?? DEFAULT_PRIVACY_SETTINGS.requireRedactionForAi,
    sourceRetentionDays: row.source_retention_days ?? DEFAULT_PRIVACY_SETTINGS.sourceRetentionDays,
    derivedRetentionDays: row.derived_retention_days ?? DEFAULT_PRIVACY_SETTINGS.derivedRetentionDays,
    evidenceRetentionDays: row.evidence_retention_days ?? DEFAULT_PRIVACY_SETTINGS.evidenceRetentionDays,
    guestLinkTtlDays: row.guest_link_ttl_days ?? DEFAULT_PRIVACY_SETTINGS.guestLinkTtlDays,
    autoRevokeGuestsOnFinalize: row.auto_revoke_guests_on_finalize ?? DEFAULT_PRIVACY_SETTINGS.autoRevokeGuestsOnFinalize,
    autoDestroyCredentialsOnFinalize: row.auto_destroy_credentials_on_finalize ?? DEFAULT_PRIVACY_SETTINGS.autoDestroyCredentialsOnFinalize,
    dataRegion: row.data_region || DEFAULT_PRIVACY_SETTINGS.dataRegion,
    trainingUse: 'NEVER',
  };
}

export async function loadPrivacySettings(db, organizationId) {
  const { data, error } = await db.from('workspace_privacy_settings').select('*').eq('organization_id', organizationId).maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return mapPrivacySettings(data || {});
}

export function evaluateAiPolicy(artifact, settings = DEFAULT_PRIVACY_SETTINGS) {
  const privacy = String(artifact.privacy_classification || 'BUSINESS').toUpperCase();
  const redactionComplete = artifact.redaction_status === 'COMPLETE';
  const privacyComplete = artifact.privacy_scan_status === 'COMPLETE';

  if (!settings.aiProcessingEnabled) return { allowed: false, reason: 'workspace_ai_processing_disabled', policy: privacy };
  if (privacy === 'RESTRICTED' && !settings.allowRestrictedAi) return { allowed: false, reason: 'restricted_ai_processing_disabled', policy: privacy };
  if (privacy === 'CONFIDENTIAL' && !settings.allowConfidentialAi) return { allowed: false, reason: 'confidential_ai_processing_disabled', policy: privacy };
  if (privacy === 'BUSINESS' && !settings.allowBusinessAi) return { allowed: false, reason: 'business_ai_processing_disabled', policy: privacy };
  if (!privacyComplete) return { allowed: false, reason: 'privacy_scan_incomplete', policy: privacy };
  if (settings.requireRedactionForAi && !redactionComplete) return { allowed: false, reason: 'redaction_required', policy: privacy };
  return { allowed: true, reason: 'privacy_policy_passed', policy: privacy };
}

export function calculateRetentionDate(days, from = new Date()) {
  if (!Number.isFinite(Number(days)) || Number(days) <= 0) return null;
  return new Date(from.getTime() + Number(days) * 24 * 60 * 60 * 1000).toISOString();
}
