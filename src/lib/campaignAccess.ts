export type CampaignAccessTier = 'free' | 'research_collective'

export function canUserSeeCampaign(
  campaign: { access_tier?: string | null; is_active?: boolean | null },
  user: { guild_access?: boolean | null; is_pro?: boolean | null } | null | undefined
) {
  if (campaign.is_active === false) return false

  const tier = (campaign.access_tier ?? 'free').toLowerCase()

  if (tier === 'free') return true

  return Boolean(user?.guild_access ?? user?.is_pro)
}
