/**
 * Feature flags para controle de rollout de novas funcionalidades
 * 
 * Uso:
 * import { FEATURES } from '@/lib/feature-flags';
 * 
 * if (FEATURES.CAMPAIGN_PAGES) {
 *   // Código que só executa quando campanhas estão habilitadas
 * }
 */

// Flags globais (via env vars)
export const FEATURES = {
  // Habilita páginas de campanha em /{doctor_slug}/{campaign_slug}
  CAMPAIGN_PAGES: process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_PAGES === 'true',
  
  // Habilita formulários customizáveis por campanha
  CAMPAIGN_FORMS: process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_FORMS === 'true',
  
  // Habilita preview de campanhas em draft com ?preview=1
  CAMPAIGN_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_CAMPAIGN_PREVIEW === 'true',
};

// Helper para verificar se feature está habilitada para um médico específico
// (Útil para rollout gradual por médico)
export async function isFeatureEnabledForDoctor(
  featureName: keyof typeof FEATURES,
  doctorId: string
): Promise<boolean> {
  // Se a feature global estiver desligada, retorna false
  if (!FEATURES[featureName]) {
    return false;
  }
  
  // TODO: Implementar lógica de allowlist por médico
  // Ex: verificar em tabela de feature_flags_by_doctor
  
  return true;
}
