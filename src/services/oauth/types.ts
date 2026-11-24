export type SubscriptionType = "pro" | "max" | "team" | "enterprise" | "free" | string | null
export type RateLimitTier = string | null
export type BillingType = string | null

export type OAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  subscriptionType?: SubscriptionType
  rateLimitTier?: RateLimitTier
}

export type OAuthProfileResponse = {
  account?: {
    uuid?: string
    email?: string
    full_name?: string
    display_name?: string
    has_claude_max?: boolean
    has_claude_pro?: boolean
  }
  organization?: {
    uuid?: string
    name?: string
    organization_type?: string
    billing_type?: BillingType
    rate_limit_tier?: RateLimitTier
    has_extra_usage_enabled?: boolean
  }
  [key: string]: any
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  account?: { uuid?: string; email_address?: string }
  organization?: { uuid?: string; name?: string }
  [key: string]: any
}

export type UserRolesResponse = {
  roles?: string[]
  [key: string]: any
}

export type ReferralCampaign = string
export type ReferralEligibilityResponse = { eligible: boolean; [key: string]: any }
export type ReferralRedemptionsResponse = { redemptions: any[]; [key: string]: any }
export type ReferrerRewardInfo = { [key: string]: any }
