import { apiClient } from '@/lib/api/client';

export interface AffiliateDailyStat {
  date: string;
  clicks: number;
  fdCount: number;
  rdCount: number;
  depSum: number;
  ggr: number;
  ngr: number;
  income: number;
}

export interface PartnerStatsResponse {
  balance: number;
  negativeCarryover: number;
  promoCode: string | null;
  link: string;
  stats: AffiliateDailyStat[];
}

export const partnerService = {
  async getStats(): Promise<PartnerStatsResponse> {
    const data = await apiClient.get<PartnerStatsResponse>('/api/partner/stats');
    return data;
  },

  async createPromo(code: string): Promise<{ success: boolean; code?: string; error?: string }> {
    try {
      const data = await apiClient.post<{ success: boolean; code: string }>('/api/partner/promo', { code });
      return data;
    } catch (e: any) {
      if (e.response?.data?.error) {
        throw new Error(e.response.data.error);
      }
      throw new Error('Failed to create promo code');
    }
  }
};
